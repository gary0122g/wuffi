# Contributing to wuffi

This repository contains the Tauri desktop app. The optional hosted membership service is maintained separately in wuffi-web.

Use Windows x64, Node.js 22.13+, Rust MSVC, Visual Studio C++ Build Tools with Windows SDK, and WebView2.

```powershell
npm ci --ignore-scripts
npm run dev
```

`npm run dev` builds and launches the local debug app. `npm start` launches an existing debug build. `npm run release` makes a Windows NSIS installer; use it only for releases.

Before a pull request, run `npm test`, `npm run build`, and `npm run test:rust`. Describe the problem, behavior and relevant checks. Keep credentials, personal files, build outputs and downloaded tools out of Git. Preserve third-party licenses.
