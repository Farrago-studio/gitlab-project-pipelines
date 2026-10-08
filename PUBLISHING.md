# Marketplace publishing guide

This document is for Farrago maintainers.

## One-time preparation

1. Create the Visual Studio Marketplace publisher with ID `farrago-studio` and public name **Farrago**. The `publisher` value in `package.json` must match this immutable ID exactly.
2. Complete the publisher profile with `https://farrago.fr/`, the Farrago logo, and `contact@farrago.fr`.
3. Keep the public GitHub repository metadata in `package.json` synchronized with `https://github.com/Farrago-studio/gitlab-project-pipelines`.
4. Review the GitLab trademark disclaimer in `README.md` and keep the product visually distinct from GitLab’s official extension.
5. Review `PRIVACY.md`, `SECURITY.md`, and `SUPPORT.md` with the appropriate Farrago owner.

Publisher verification can be requested after the Marketplace and domain eligibility requirements are met. Farrago controls `farrago.fr`, which can be verified through the DNS procedure provided by Microsoft.

## Release checklist

1. Update `version` in `package.json` using Semantic Versioning.
2. Update `CHANGELOG.md` with the release date and user-visible changes.
3. Run:

   ```bash
   npm ci
   npm run l10n:export
   npm run check
   npm test
   npm run package
   npm audit --omit=dev
   ```

4. Install the generated VSIX in a clean VS Code profile and test English and French locales.
5. Check the packaged file list printed by `vsce`; it must not contain tokens, `.env` files, source maps, test output, or repository secrets.
6. Verify GitLab.com and, when possible, a self-managed GitLab instance.
7. Publish with `npm run publish:marketplace` after authenticating the `farrago-studio` publisher.
8. Tag the exact source revision and retain the generated VSIX and checksum as release artifacts.

## Authentication

Use the current Microsoft-recommended Marketplace authentication mechanism. Microsoft has announced the retirement of global Azure DevOps Personal Access Tokens on December 1, 2026; prefer secure automated publishing with Microsoft Entra ID for the long-term publication workflow.

Never store Marketplace credentials in the repository. Use protected CI variables or a secure credential provider.

## Rollback

If a release is defective, publish a corrected patch version. Unpublishing should be reserved for security or legal issues because it disrupts existing users.
