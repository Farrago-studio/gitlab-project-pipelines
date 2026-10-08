import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as vscode from "vscode";
import { GitLabApi, GitLabJob, GitLabPipeline } from "./gitlabApi";
import { normalizeBaseUrl, parseGitLabRemote } from "./remote";

const execFileAsync = promisify(execFile);
const configurationSection = "gitlabProjectPipelines";

interface ProjectContext {
  baseUrl: string;
  projectPath: string;
  workspaceFolder: vscode.WorkspaceFolder;
}

type PipelineFilter = "all" | "tags" | "branches";
type RefKind = "tag" | "branch";

interface PipelineEntry {
  pipeline: GitLabPipeline;
  kind: RefKind;
}

type PipelineNode = PipelineItem | JobItem | MessageItem;

export function activate(context: vscode.ExtensionContext): void {
  const provider = new PipelinesProvider(context);
  const view = vscode.window.createTreeView("gitlabProjectPipelines", {
    treeDataProvider: provider,
    showCollapseAll: true,
  });

  context.subscriptions.push(
    view,
    provider,
    vscode.commands.registerCommand("gitlabProjectPipelines.refresh", () => provider.refresh()),
    vscode.commands.registerCommand("gitlabProjectPipelines.setToken", () => provider.setToken()),
    vscode.commands.registerCommand("gitlabProjectPipelines.clearToken", () => provider.clearToken()),
    vscode.commands.registerCommand("gitlabProjectPipelines.selectFilter", () => provider.selectFilter()),
    vscode.commands.registerCommand("gitlabProjectPipelines.openDashboard", () => provider.openDashboard()),
    vscode.commands.registerCommand(
      "gitlabProjectPipelines.playJob",
      (item: JobItem) => provider.playJob(item),
    ),
    vscode.commands.registerCommand(
      "gitlabProjectPipelines.openPipeline",
      (item: PipelineItem) => vscode.env.openExternal(vscode.Uri.parse(item.pipeline.web_url)),
    ),
    vscode.commands.registerCommand(
      "gitlabProjectPipelines.openJob",
      (item: JobItem) => vscode.env.openExternal(vscode.Uri.parse(item.job.web_url)),
    ),
    vscode.commands.registerCommand(
      "gitlabProjectPipelines.showJobLog",
      (item: JobItem) => provider.showJobLog(item),
    ),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration(configurationSection)) {
        provider.reconfigure();
      }
    }),
    vscode.workspace.onDidChangeWorkspaceFolders(() => provider.refresh()),
  );
}

export function deactivate(): void {}

class PipelinesProvider implements vscode.TreeDataProvider<PipelineNode>, vscode.Disposable {
  private readonly changed = new vscode.EventEmitter<PipelineNode | undefined | void>();
  readonly onDidChangeTreeData = this.changed.event;

  private projectContext: ProjectContext | undefined;
  private pipelineEntries: PipelineEntry[] | undefined;
  private readonly jobs = new Map<number, GitLabJob[]>();
  private refreshTimer: ReturnType<typeof setInterval> | undefined;
  private dashboard: vscode.WebviewPanel | undefined;
  private filter: PipelineFilter;
  private readonly output = vscode.window.createOutputChannel(vscode.l10n.t("GitLab Pipelines"));

  constructor(private readonly extensionContext: vscode.ExtensionContext) {
    this.filter = extensionContext.workspaceState.get<PipelineFilter>("pipelineFilter", "all");
    this.configureTimer();
  }

  dispose(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
    }
    this.dashboard?.dispose();
    this.output.dispose();
    this.changed.dispose();
  }

  getTreeItem(element: PipelineNode): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: PipelineNode): Promise<PipelineNode[]> {
    try {
      if (element instanceof PipelineItem) {
        return await this.getJobs(element.pipeline);
      }
      if (element) {
        return [];
      }
      return await this.getPipelines();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return [new MessageItem(vscode.l10n.t("Error: {0}", message), "error")];
    }
  }

  refresh(): void {
    this.projectContext = undefined;
    this.pipelineEntries = undefined;
    this.jobs.clear();
    this.changed.fire();
  }

  reconfigure(): void {
    this.configureTimer();
    this.refresh();
  }

  async setToken(): Promise<void> {
    try {
      const project = await this.resolveProjectContext();
      const token = await vscode.window.showInputBox({
        title: vscode.l10n.t("GitLab token for {0}", project.baseUrl),
        prompt: vscode.l10n.t("Use a Personal Access Token with the api scope to run manual jobs."),
        password: true,
        ignoreFocusOut: true,
        validateInput: (value) => (value.trim() ? undefined : vscode.l10n.t("The token cannot be empty.")),
      });
      if (!token) {
        return;
      }

      await this.extensionContext.secrets.store(this.tokenKey(project.baseUrl), token.trim());
      this.refresh();
      void vscode.window.showInformationMessage(
        vscode.l10n.t("GitLab token saved in VS Code Secret Storage."),
      );
    } catch (error) {
      void vscode.window.showErrorMessage(error instanceof Error ? error.message : String(error));
    }
  }

  async clearToken(): Promise<void> {
    try {
      const project = await this.resolveProjectContext();
      await this.extensionContext.secrets.delete(this.tokenKey(project.baseUrl));
      this.refresh();
      void vscode.window.showInformationMessage(vscode.l10n.t("GitLab token removed."));
    } catch (error) {
      void vscode.window.showErrorMessage(error instanceof Error ? error.message : String(error));
    }
  }

  async selectFilter(): Promise<void> {
    const options: Array<vscode.QuickPickItem & { value: PipelineFilter }> = [
      {
        label: vscode.l10n.t("$(list-flat) All pipelines"),
        description: vscode.l10n.t("Branches and tags"),
        value: "all",
      },
      { label: vscode.l10n.t("$(tag) Tags only"), value: "tags" },
      { label: vscode.l10n.t("$(git-branch) Branches only"), value: "branches" },
    ];
    const selected = await vscode.window.showQuickPick(options, {
      title: vscode.l10n.t("Filter pipelines"),
      placeHolder: vscode.l10n.t("Choose the reference type to display"),
    });
    if (!selected) {
      return;
    }
    this.filter = selected.value;
    await this.extensionContext.workspaceState.update("pipelineFilter", this.filter);
    this.changed.fire();
  }

  async openDashboard(): Promise<void> {
    if (this.dashboard) {
      this.dashboard.reveal(vscode.ViewColumn.Active);
    } else {
      this.dashboard = vscode.window.createWebviewPanel(
        "gitlabPipelinesDashboard",
        vscode.l10n.t("GitLab Pipelines"),
        vscode.ViewColumn.Active,
        { enableScripts: true },
      );
      this.dashboard.onDidDispose(() => {
        this.dashboard = undefined;
      });
      this.dashboard.webview.onDidReceiveMessage(async (message: { command?: string; id?: number }) => {
        if (message.command === "open" && typeof message.id === "number") {
          const entry = this.pipelineEntries?.find(({ pipeline }) => pipeline.id === message.id);
          if (entry) {
            await vscode.env.openExternal(vscode.Uri.parse(entry.pipeline.web_url));
          }
        } else if (message.command === "refresh") {
          this.pipelineEntries = undefined;
          await this.renderDashboard();
          this.changed.fire();
        }
      });
    }
    await this.renderDashboard();
  }

  async playJob(item: JobItem): Promise<void> {
    if (item.job.status !== "manual") {
      return;
    }

    const runAction = vscode.l10n.t("Run");
    const answer = await vscode.window.showWarningMessage(
      vscode.l10n.t(
        "Run job “{0}” from pipeline #{1} ({2})?",
        item.job.name,
        item.pipeline.iid ?? item.pipeline.id,
        item.pipeline.ref,
      ),
      { modal: true },
      runAction,
    );
    if (answer !== runAction) {
      return;
    }

    try {
      const api = await this.createApi();
      await api.playJob(item.job.id);
      this.jobs.delete(item.pipeline.id);
      this.pipelineEntries = undefined;
      this.changed.fire();
      void vscode.window.showInformationMessage(vscode.l10n.t("Job “{0}” started.", item.job.name));
    } catch (error) {
      void vscode.window.showErrorMessage(
        vscode.l10n.t(
          "Unable to run the job: {0}",
          error instanceof Error ? error.message : String(error),
        ),
      );
    }
  }

  async showJobLog(item: JobItem): Promise<void> {
    try {
      const trace = await (await this.createApi()).getJobTrace(item.job.id);
      this.output.clear();
      this.output.appendLine(
        vscode.l10n.t(
          "Job {0} · pipeline #{1} · {2}",
          item.job.name,
          item.pipeline.iid ?? item.pipeline.id,
          item.pipeline.ref,
        ),
      );
      this.output.appendLine("─".repeat(80));
      this.output.append(trace || vscode.l10n.t("This job does not have any logs yet."));
      this.output.show(true);
    } catch (error) {
      void vscode.window.showErrorMessage(
        vscode.l10n.t(
          "Unable to load the job log: {0}",
          error instanceof Error ? error.message : String(error),
        ),
      );
    }
  }

  private async getPipelines(): Promise<PipelineNode[]> {
    const project = await this.resolveProjectContext();
    const token = await this.extensionContext.secrets.get(this.tokenKey(project.baseUrl));
    if (!token) {
      return [
        new MessageItem(
          vscode.l10n.t("Configure GitLab token"),
          "key",
          "gitlabProjectPipelines.setToken",
        ),
      ];
    }

    const entries = await this.loadPipelineEntries(
      new GitLabApi(project.baseUrl, project.projectPath, token),
    );
    const filtered = entries.filter(
      ({ kind }) =>
        this.filter === "all" ||
        (this.filter === "tags" && kind === "tag") ||
        (this.filter === "branches" && kind === "branch"),
    );

    if (filtered.length === 0) {
      return [new MessageItem(vscode.l10n.t("No pipeline found."), "info")];
    }
    return filtered.map(({ pipeline, kind }) => new PipelineItem(pipeline, kind));
  }

  private async loadPipelineEntries(api: GitLabApi): Promise<PipelineEntry[]> {
    if (!this.pipelineEntries) {
      const limit = this.configuration().get<number>("pipelineLimit", 30);
      const [pipelines, tagPipelines] = await Promise.all([
        api.listPipelines(limit),
        api.listPipelines(100, "tags"),
      ]);
      const tagRefs = new Set(tagPipelines.map((pipeline) => pipeline.ref));
      this.pipelineEntries = pipelines.map((pipeline) => ({
        pipeline,
        kind: tagRefs.has(pipeline.ref) ? "tag" : "branch",
      }));
    }
    return this.pipelineEntries;
  }

  private async renderDashboard(): Promise<void> {
    if (!this.dashboard) {
      return;
    }
    this.dashboard.webview.html = dashboardLoadingHtml();
    try {
      const entries = await this.loadPipelineEntries(await this.createApi());
      this.dashboard.webview.html = dashboardHtml(entries, this.filter);
    } catch (error) {
      this.dashboard.webview.html = dashboardErrorHtml(
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  private async getJobs(pipeline: GitLabPipeline): Promise<PipelineNode[]> {
    let jobs = this.jobs.get(pipeline.id);
    if (!jobs) {
      jobs = await (await this.createApi()).listJobs(pipeline.id);
      this.jobs.set(pipeline.id, jobs);
    }

    if (jobs.length === 0) {
      return [new MessageItem(vscode.l10n.t("No job found in this pipeline."), "info")];
    }
    return jobs.map((job) => new JobItem(job, pipeline));
  }

  private async createApi(): Promise<GitLabApi> {
    const project = await this.resolveProjectContext();
    const token = await this.extensionContext.secrets.get(this.tokenKey(project.baseUrl));
    if (!token) {
      throw new Error(vscode.l10n.t("No GitLab token is configured."));
    }
    return new GitLabApi(project.baseUrl, project.projectPath, token);
  }

  private async resolveProjectContext(): Promise<ProjectContext> {
    if (this.projectContext) {
      return this.projectContext;
    }

    const folder = this.activeWorkspaceFolder();
    if (!folder) {
      throw new Error(vscode.l10n.t("Open a folder containing a GitLab repository."));
    }

    const config = this.configuration(folder.uri);
    const remoteName = config.get<string>("remote", "origin");
    let remote: string;
    try {
      const result = await execFileAsync("git", ["config", "--get", `remote.${remoteName}.url`], {
        cwd: folder.uri.fsPath,
      });
      remote = result.stdout.trim();
    } catch {
      throw new Error(vscode.l10n.t("Git remote “{0}” was not found in {1}.", remoteName, folder.name));
    }

    const detected = parseGitLabRemote(remote);
    const baseUrl = normalizeBaseUrl(config.get<string>("baseUrl", "") || detected.baseUrl);
    const projectPath = (config.get<string>("projectPath", "") || detected.projectPath)
      .trim()
      .replace(/^\/+|\/+$/g, "")
      .replace(/\.git$/, "");

    if (!baseUrl || !projectPath) {
      throw new Error(vscode.l10n.t("Unable to determine the GitLab instance or project."));
    }

    this.projectContext = { baseUrl, projectPath, workspaceFolder: folder };
    return this.projectContext;
  }

  private activeWorkspaceFolder(): vscode.WorkspaceFolder | undefined {
    const activeUri = vscode.window.activeTextEditor?.document.uri;
    if (activeUri) {
      const activeFolder = vscode.workspace.getWorkspaceFolder(activeUri);
      if (activeFolder) {
        return activeFolder;
      }
    }
    return vscode.workspace.workspaceFolders?.[0];
  }

  private configuration(scope?: vscode.Uri): vscode.WorkspaceConfiguration {
    return vscode.workspace.getConfiguration(configurationSection, scope);
  }

  private tokenKey(baseUrl: string): string {
    return `${configurationSection}.token:${normalizeBaseUrl(baseUrl).toLowerCase()}`;
  }

  private configureTimer(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = undefined;
    }
    const interval = this.configuration().get<number>("refreshInterval", 15);
    if (interval > 0) {
      this.refreshTimer = setInterval(() => {
        this.pipelineEntries = undefined;
        this.jobs.clear();
        this.changed.fire();
        if (this.dashboard) {
          void this.renderDashboard();
        }
      }, interval * 1_000);
    }
  }
}

class PipelineItem extends vscode.TreeItem {
  constructor(
    readonly pipeline: GitLabPipeline,
    readonly kind: RefKind,
  ) {
    super(`#${pipeline.iid ?? pipeline.id}  ${pipeline.ref}`, vscode.TreeItemCollapsibleState.Collapsed);
    this.id = `pipeline-${pipeline.id}`;
    this.contextValue = "pipeline";
    this.description = `${kindLabel(kind)} · ${statusLabel(pipeline.status)} · ${relativeTime(pipeline.updated_at)}`;
    this.iconPath = statusIcon(pipeline.status);
    this.tooltip = new vscode.MarkdownString(
      [
        `**Pipeline #${pipeline.iid ?? pipeline.id}**`,
        "",
        vscode.l10n.t("- Reference: `{0}`", pipeline.ref),
        vscode.l10n.t("- Type: {0}", kindLabel(kind)),
        vscode.l10n.t("- Status: {0}", statusLabel(pipeline.status)),
        vscode.l10n.t("- Source: `{0}`", pipeline.source),
        vscode.l10n.t("- Commit: `{0}`", pipeline.sha.slice(0, 8)),
        vscode.l10n.t("- Created: {0}", formatDate(pipeline.created_at)),
      ].join("\n"),
    );
  }
}

class JobItem extends vscode.TreeItem {
  constructor(
    readonly job: GitLabJob,
    readonly pipeline: GitLabPipeline,
  ) {
    super(job.name, vscode.TreeItemCollapsibleState.None);
    this.id = `job-${job.id}`;
    this.contextValue = job.status === "manual" ? "job.manual" : "job";
    this.description = `${job.stage} · ${statusLabel(job.status)}`;
    this.iconPath = statusIcon(job.status);
    this.tooltip = new vscode.MarkdownString(
      [
        `**${job.name}**`,
        "",
        vscode.l10n.t("- Stage: `{0}`", job.stage),
        vscode.l10n.t("- Status: {0}", statusLabel(job.status)),
        vscode.l10n.t("- Pipeline: #{0} on `{1}`", pipeline.iid ?? pipeline.id, pipeline.ref),
      ].join("\n"),
    );
    this.command = {
      command: "gitlabProjectPipelines.showJobLog",
      title: vscode.l10n.t("Show logs"),
      arguments: [this],
    };
  }
}

class MessageItem extends vscode.TreeItem {
  constructor(label: string, icon: string, command?: string) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.iconPath = new vscode.ThemeIcon(icon);
    if (command) {
      this.command = { command, title: label };
    }
  }
}

function statusIcon(status: string): vscode.ThemeIcon {
  switch (status) {
    case "success":
      return new vscode.ThemeIcon("pass-filled", new vscode.ThemeColor("testing.iconPassed"));
    case "failed":
      return new vscode.ThemeIcon("error", new vscode.ThemeColor("testing.iconFailed"));
    case "running":
      return new vscode.ThemeIcon("sync~spin", new vscode.ThemeColor("charts.blue"));
    case "pending":
    case "created":
    case "preparing":
    case "waiting_for_resource":
      return new vscode.ThemeIcon("clock", new vscode.ThemeColor("charts.yellow"));
    case "manual":
      return new vscode.ThemeIcon("play-circle", new vscode.ThemeColor("charts.blue"));
    case "canceled":
    case "canceling":
      return new vscode.ThemeIcon("circle-slash", new vscode.ThemeColor("disabledForeground"));
    case "skipped":
      return new vscode.ThemeIcon("debug-step-over", new vscode.ThemeColor("disabledForeground"));
    default:
      return new vscode.ThemeIcon("circle-outline");
  }
}

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    success: vscode.l10n.t("passed"),
    failed: vscode.l10n.t("failed"),
    running: vscode.l10n.t("running"),
    pending: vscode.l10n.t("pending"),
    created: vscode.l10n.t("created"),
    preparing: vscode.l10n.t("preparing"),
    waiting_for_resource: vscode.l10n.t("waiting for resource"),
    manual: vscode.l10n.t("manual"),
    canceled: vscode.l10n.t("canceled"),
    canceling: vscode.l10n.t("canceling"),
    skipped: vscode.l10n.t("skipped"),
    scheduled: vscode.l10n.t("scheduled"),
  };
  return labels[status] ?? status;
}

function kindLabel(kind: RefKind): string {
  return kind === "tag" ? vscode.l10n.t("tag") : vscode.l10n.t("branch");
}

function relativeTime(value: string): string {
  const timestamp = Date.parse(value);
  const seconds = Math.round((timestamp - Date.now()) / 1_000);
  const formatter = new Intl.RelativeTimeFormat(vscode.env.language, { numeric: "auto" });
  const ranges: Array<[number, Intl.RelativeTimeFormatUnit]> = [
    [60, "second"],
    [60, "minute"],
    [24, "hour"],
    [30, "day"],
    [12, "month"],
  ];
  let duration = seconds;
  for (const [limit, unit] of ranges) {
    if (Math.abs(duration) < limit) {
      return formatter.format(duration, unit);
    }
    duration = Math.round(duration / limit);
  }
  return formatter.format(duration, "year");
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(vscode.env.language, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function dashboardLoadingHtml(): string {
  return `<!doctype html><html lang="${escapeHtml(vscode.env.language)}"><body><p>${escapeHtml(vscode.l10n.t("Loading pipelines…"))}</p></body></html>`;
}

function dashboardErrorHtml(message: string): string {
  return `<!doctype html><html lang="${escapeHtml(vscode.env.language)}"><body><h1>GitLab Pipelines</h1><p>${escapeHtml(message)}</p></body></html>`;
}

function dashboardHtml(entries: PipelineEntry[], initialFilter: PipelineFilter): string {
  const nonce = Math.random().toString(36).slice(2);
  const rows = entries
    .map(({ pipeline, kind }) => {
      const referenceKind = kind === "tag" ? vscode.l10n.t("Tag") : vscode.l10n.t("Branch");
      return `<tr data-kind="${kind}">
        <td><span class="status status-${escapeHtml(pipeline.status)}"></span>${escapeHtml(statusLabel(pipeline.status))}</td>
        <td><button class="link pipeline" data-id="${pipeline.id}">#${pipeline.iid ?? pipeline.id}</button></td>
        <td><span class="kind kind-${kind}">${escapeHtml(referenceKind)}</span></td>
        <td><code>${escapeHtml(pipeline.ref)}</code></td>
        <td>${escapeHtml(pipeline.source)}</td>
        <td title="${escapeHtml(formatDate(pipeline.updated_at))}">${escapeHtml(relativeTime(pipeline.updated_at))}</td>
        <td><button class="open pipeline" data-id="${pipeline.id}" title="${escapeHtml(vscode.l10n.t("Open in GitLab"))}">↗ GitLab</button></td>
      </tr>`;
    })
    .join("");

  return `<!doctype html>
<html lang="${escapeHtml(vscode.env.language)}">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { color: var(--vscode-foreground); background: var(--vscode-editor-background); font-family: var(--vscode-font-family); padding: 20px 28px; }
    header { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 20px; }
    h1 { font-size: 22px; margin: 0; }
    .toolbar { display: flex; gap: 8px; flex-wrap: wrap; }
    button { color: var(--vscode-button-foreground); background: var(--vscode-button-background); border: 0; border-radius: 2px; padding: 6px 10px; cursor: pointer; }
    button:hover { background: var(--vscode-button-hoverBackground); }
    button.secondary { color: var(--vscode-foreground); background: var(--vscode-button-secondaryBackground); }
    button.active { outline: 2px solid var(--vscode-focusBorder); }
    table { width: 100%; border-collapse: collapse; border: 1px solid var(--vscode-panel-border); }
    th, td { padding: 9px 12px; text-align: left; border-bottom: 1px solid var(--vscode-panel-border); white-space: nowrap; }
    th { color: var(--vscode-descriptionForeground); font-weight: 600; background: var(--vscode-editorWidget-background); position: sticky; top: 0; }
    tr:hover td { background: var(--vscode-list-hoverBackground); }
    code { color: var(--vscode-textPreformat-foreground); }
    .status { display: inline-block; width: 9px; height: 9px; border-radius: 50%; margin-right: 8px; background: var(--vscode-descriptionForeground); }
    .status-success { background: var(--vscode-testing-iconPassed); }
    .status-failed { background: var(--vscode-testing-iconFailed); }
    .status-running { background: var(--vscode-charts-blue); }
    .status-pending, .status-created, .status-preparing { background: var(--vscode-charts-yellow); }
    .kind { display: inline-block; padding: 2px 7px; border-radius: 10px; background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); }
    .kind-tag::before { content: "◆ "; }
    .kind-branch::before { content: "⑂ "; }
    button.link { color: var(--vscode-textLink-foreground); background: transparent; padding: 0; font: inherit; }
    button.link:hover { color: var(--vscode-textLink-activeForeground); text-decoration: underline; background: transparent; }
    .empty { color: var(--vscode-descriptionForeground); padding: 20px; }
  </style>
</head>
<body data-filter="${initialFilter}">
  <header>
    <h1>GitLab Pipelines <small>(${entries.length})</small></h1>
    <div class="toolbar">
      <button class="filter secondary" data-filter="all">${escapeHtml(vscode.l10n.t("All"))}</button>
      <button class="filter secondary" data-filter="tag">${escapeHtml(vscode.l10n.t("Tags"))}</button>
      <button class="filter secondary" data-filter="branch">${escapeHtml(vscode.l10n.t("Branches"))}</button>
      <button id="refresh">${escapeHtml(vscode.l10n.t("Refresh"))}</button>
    </div>
  </header>
  <table>
    <thead><tr><th>${escapeHtml(vscode.l10n.t("Status"))}</th><th>Pipeline</th><th>${escapeHtml(vscode.l10n.t("Type"))}</th><th>${escapeHtml(vscode.l10n.t("Reference"))}</th><th>${escapeHtml(vscode.l10n.t("Source"))}</th><th>${escapeHtml(vscode.l10n.t("Updated"))}</th><th></th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <p class="empty" hidden>${escapeHtml(vscode.l10n.t("No pipeline matches this filter."))}</p>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const rows = [...document.querySelectorAll('tbody tr')];
    const empty = document.querySelector('.empty');
    function applyFilter(filter) {
      let visible = 0;
      rows.forEach(row => {
        const show = filter === 'all' || row.dataset.kind === filter;
        row.hidden = !show;
        if (show) visible += 1;
      });
      empty.hidden = visible !== 0;
      document.querySelectorAll('.filter').forEach(button => button.classList.toggle('active', button.dataset.filter === filter));
    }
    document.querySelectorAll('.pipeline').forEach(button => button.addEventListener('click', () => {
      vscode.postMessage({ command: 'open', id: Number(button.dataset.id) });
    }));
    document.querySelectorAll('.filter').forEach(button => button.addEventListener('click', () => applyFilter(button.dataset.filter)));
    document.getElementById('refresh').addEventListener('click', () => vscode.postMessage({ command: 'refresh' }));
    const initial = document.body.dataset.filter;
    applyFilter(initial === 'tags' ? 'tag' : initial === 'branches' ? 'branch' : 'all');
  </script>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"]/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
    };
    return entities[character];
  });
}
