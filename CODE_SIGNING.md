# Code signing policy

wuffi is preparing an application for SignPath Foundation's free open-source code signing program. Approval has not been granted and current releases are unsigned. A checksum verifies a download's contents; it is not a digital signature.

## Scope and responsibility

- Repository: https://github.com/gary0122g/wuffi
- License: MIT for wuffi's own code; see [third-party notices](THIRD_PARTY_NOTICES.md).
- Committer, reviewer and release approver: [gary0122g](https://github.com/gary0122g).
- Privacy: [Desktop privacy policy](PRIVACY.md).

Signing is intended only for Windows binaries built from this public repository. The public Windows artifact workflow records the source commit and uploads the application and installer from the same build. It does not currently sign or publish them.

Before signing is enabled, the maintainer must enable multi-factor authentication for GitHub and SignPath, configure verified build provenance and artifact restrictions in SignPath, and manually approve each signing request. Signing credentials must never be committed or made available to pull-request builds. Changes to dependencies and build workflows require review before release.

Third-party binaries must not be re-signed as wuffi's own code. Pandoc is downloaded separately from upstream with user confirmation; WebView2 is a system runtime.

After approval and the first verified signed release, this page will identify the actual signing provider and certificate. No existing unsigned release will be described as signed retroactively.
