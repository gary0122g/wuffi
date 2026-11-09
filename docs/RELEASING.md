# Publishing Windows updates

1. Update the version in package.json, package-lock.json, src-tauri/Cargo.toml, src-tauri/Cargo.lock and tauri.conf.json together. Update the displayed About version and download links.
2. Commit and push verified changes to main.
3. Run **Publish signed update** from GitHub Actions on main. The workflow runs checks, builds the NSIS installer, signs its updater artifact, and publishes the versioned release. It then updates `latest.json` on the `update-channel` prerelease.
4. Confirm the versioned installer, `.exe.sig`, and update-channel manifest are publicly downloadable. Only update the channel after the versioned installer is available.

The updater endpoint is `https://github.com/gary0122g/wuffi/releases/download/update-channel/latest.json`. This dedicated channel also supports release candidates without relying on GitHub's stable-only `/latest` redirect. Never replace an existing version's installer with different bytes; bump the version.

`TAURI_SIGNING_PRIVATE_KEY` must be stored in repository Actions Secrets. `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` is optional for encrypted keys. The public verification key is in tauri.conf.json. Keep a secure offline backup of the private key; losing or rotating it breaks trust for installed clients. Never commit private keys or print them in CI logs.

For local release builds, set `TAURI_SIGNING_PRIVATE_KEY` to the private key path in the shell environment before `npm run release`. Contributors who only need an unsigned installer can disable updater artifacts for their own build with `npx tauri build --bundles nsis --config '{"bundle":{"createUpdaterArtifacts":false}}'`. Never publish that build through the update channel.

Tauri update signatures verify downloaded packages. They do not replace Windows Authenticode/SignPath signing. When SignPath is available, ensure Windows signing finishes before computing the updater signature; modifying the installer afterward invalidates that signature.

The app checks only when enabled, never installs without confirmation, and rejects installation while documents are unsaved. Development/background-test builds do not install updates. Use an isolated machine for actual installer/restart acceptance; background checks must never trigger an installer on a user's working desktop.
