export interface GitLabPipeline {
  id: number;
  iid?: number;
  status: string;
  source: string;
  ref: string;
  sha: string;
  web_url: string;
  created_at: string;
  updated_at: string;
}

export interface GitLabJob {
  id: number;
  name: string;
  stage: string;
  status: string;
  web_url: string;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

interface GitLabErrorBody {
  message?: string | Record<string, string[]>;
  error?: string;
}

export class GitLabApi {
  private readonly projectId: string;

  constructor(
    private readonly baseUrl: string,
    projectPath: string,
    private readonly token: string,
  ) {
    this.projectId = encodeURIComponent(projectPath);
  }

  async listPipelines(
    limit: number,
    scope?: "branches" | "tags",
  ): Promise<GitLabPipeline[]> {
    const scopeParameter = scope ? `&scope=${scope}` : "";
    return this.request<GitLabPipeline[]>(
      `/projects/${this.projectId}/pipelines?per_page=${limit}&order_by=id&sort=desc${scopeParameter}`,
    );
  }

  async listJobs(pipelineId: number): Promise<GitLabJob[]> {
    return this.request<GitLabJob[]>(
      `/projects/${this.projectId}/pipelines/${pipelineId}/jobs?per_page=100`,
    );
  }

  async playJob(jobId: number): Promise<GitLabJob> {
    return this.request<GitLabJob>(`/projects/${this.projectId}/jobs/${jobId}/play`, {
      method: "POST",
    });
  }

  async getJobTrace(jobId: number): Promise<string> {
    return this.requestText(`/projects/${this.projectId}/jobs/${jobId}/trace`);
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await this.fetch(path, init);

    return (await response.json()) as T;
  }

  private async requestText(path: string): Promise<string> {
    const response = await this.fetch(path);
    return response.text();
  }

  private async fetch(path: string, init: RequestInit = {}): Promise<Response> {
    const response = await fetch(`${this.baseUrl}/api/v4${path}`, {
      ...init,
      headers: {
        Accept: "application/json",
        "PRIVATE-TOKEN": this.token,
        ...init.headers,
      },
    });

    if (!response.ok) {
      let detail = "";
      try {
        const body = (await response.json()) as GitLabErrorBody;
        detail = typeof body.message === "string" ? body.message : body.error ?? "";
      } catch {
        detail = await response.text().catch(() => "");
      }

      const suffix = detail ? ` — ${detail}` : "";
      if (response.status === 401) {
        throw new Error(vscode.l10n.t("The GitLab token is invalid or expired{0}", suffix));
      }
      if (response.status === 403) {
        throw new Error(vscode.l10n.t("Insufficient GitLab permissions{0}", suffix));
      }
      if (response.status === 404) {
        throw new Error(vscode.l10n.t("GitLab project or resource not found{0}", suffix));
      }
      throw new Error(vscode.l10n.t("GitLab returned HTTP {0}{1}", response.status, suffix));
    }

    return response;
  }
}
import * as vscode from "vscode";
