# Farrago GitLab Pipelines

Monitor every GitLab pipeline for the project open in Visual Studio Code—without switching your local branch or leaving the editor.

Farrago GitLab Pipelines is developed and maintained by [Farrago](https://farrago.fr/), a French software development agency building web, mobile, SaaS, automation, and DevOps solutions.

> This is an independent extension developed by Farrago. It is not affiliated with, endorsed by, or sponsored by GitLab Inc.

## Features

- Detects the GitLab project from the configured Git remote.
- Supports GitLab.com and self-managed GitLab instances.
- Lists recent pipelines across every branch and tag, independently of the checked-out branch.
- Distinguishes and filters tag and branch pipelines.
- Provides a full-width pipeline dashboard.
- Expands pipelines to show their jobs and statuses.
- Runs manual jobs after an explicit confirmation.
- Displays job logs in the VS Code Output panel.
- Opens the exact pipeline or job page in GitLab when more detail is needed.
- Refreshes pipeline state automatically at a configurable interval.
- Stores GitLab tokens in VS Code Secret Storage—never in workspace settings.
- Provides English and French user interfaces.

## Getting started

1. Open a folder containing a Git repository connected to GitLab.
2. Select the **Farrago Pipelines** icon in the Activity Bar.
3. Select the key button or run **GitLab Pipelines: Configure access token**.
4. Enter a GitLab Personal Access Token.

Use the `read_api` scope for read-only monitoring. Use the `api` scope if you need to run manual jobs.

Expand a pipeline to inspect its jobs. Select a job name to display its log in VS Code, select **Open in GitLab** for the GitLab page, or use the play button to start a manual job.

## Dashboard and filters

Use the filter button in the view title to display all pipelines, tags only, or branches only. Use the dashboard button to open a full-width table in an editor tab.

## Settings

| Setting | Default | Description |
| --- | --- | --- |
| `gitlabProjectPipelines.remote` | `origin` | Git remote used to detect the project. |
| `gitlabProjectPipelines.baseUrl` | empty | Overrides the detected GitLab instance URL. |
| `gitlabProjectPipelines.projectPath` | empty | Overrides the detected `group/subgroup/project` path. |
| `gitlabProjectPipelines.pipelineLimit` | `30` | Number of recent pipelines displayed. |
| `gitlabProjectPipelines.refreshInterval` | `15` | Refresh interval in seconds; `0` disables automatic refresh. |

## Security and privacy

The extension sends requests only to the GitLab instance inferred from the repository or explicitly configured by the user. It does not include telemetry, analytics, advertising, or an external Farrago backend. See [PRIVACY.md](PRIVACY.md) and [SECURITY.md](SECURITY.md).

## Support

See [SUPPORT.md](SUPPORT.md) or contact Farrago at [contact@farrago.fr](mailto:contact@farrago.fr).

## Development

```bash
npm install
npm run check
npm test
npm run package
```

Press `F5` from the extension directory to open an Extension Development Host.

## License

Copyright © 2026 Farrago. Released under the [MIT License](LICENSE).

---

Built with care by [Farrago](https://farrago.fr/) — custom software development for ambitious products and businesses.
