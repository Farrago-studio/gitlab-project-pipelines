# Security policy

## Reporting a vulnerability

Please report security vulnerabilities privately to [contact@farrago.fr](mailto:contact@farrago.fr) with the subject **Security — Farrago GitLab Pipelines**.

Do not disclose a vulnerability publicly before Farrago has assessed it and coordinated a fix. Include reproduction steps and the affected extension version, but do not include real access tokens or production secrets.

Farrago will acknowledge a complete report as soon as reasonably possible and will coordinate remediation and disclosure with the reporter.

## Security design

- Tokens are stored with VS Code Secret Storage.
- Tokens are scoped by GitLab instance URL.
- Tokens are never written to workspace settings or extension logs.
- Manual jobs require explicit user confirmation.
- The extension does not execute pipeline commands locally.
- The dashboard uses a restrictive Content Security Policy.
- Workspace Trust is required because project identity comes from the local Git repository.
