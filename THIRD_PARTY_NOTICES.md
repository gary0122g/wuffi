# Third-party components

wuffi (formerly Liubai) is an independent implementation. Typora's name is used only to identify the interface reference. No Typora executable, proprietary source code, activation mechanism, icon, or bundled theme files are included in wuffi's application package.

## Pandoc

The Windows x64 desktop application invokes the unmodified Pandoc 3.12.1 executable as a separate process for document conversion. Pandoc is downloaded from its official GitHub release on the first conversion, after confirmation; it is not bundled with the application. The archive and installed files are checked against the pinned SHA-256 values in `resources/pandoc-release.json`.

- Project and source: https://github.com/jgm/pandoc/tree/3.12.1
- Release: https://github.com/jgm/pandoc/releases/tag/3.12.1
- License: GNU General Public License version 2 or later; `COPYING.rtf` and `COPYRIGHT.txt` are installed alongside `pandoc.exe` in the application user-data directory under `components/pandoc/3.12.1-windows-x86_64/`.
- Source archive: https://github.com/jgm/pandoc/archive/refs/tags/3.12.1.tar.gz

## Desktop and editor libraries

The Tauri Windows app uses Tauri, Wry, WebView2 bindings and the Rust libraries recorded in `src-tauri/Cargo.lock`. It uses the system WebView2 runtime. It does not bundle Chromium or Node.js.

Milkdown, ProseMirror, CodeMirror, Mermaid, KaTeX, marked, DOMPurify and their dependencies retain their respective licenses. Exact JavaScript versions are recorded in `package-lock.json`.

Bundled Open Sans, PT Serif, Merriweather, Lato and Vollkorn retain their font licenses from the corresponding `@fontsource` packages. Built-in themes are independently implemented CSS.

## Formula and legacy diagram engines (0.6)

- MathJax 3.2.2: Apache-2.0. https://github.com/mathjax/MathJax-src
- flowchart.js 1.18.0 and Raphael 2.3.0: MIT. https://github.com/adrai/flowchart.js
- js-sequence-diagrams 2.0.1: BSD-2-Clause. https://github.com/bramp/js-sequence-diagrams
- Snap.svg 0.4.1: Apache-2.0. https://github.com/adobe-webplatform/Snap.svg
- Underscore 1.8.3: MIT. https://github.com/jashkenas/underscore
- Web Font Loader: Apache-2.0. https://github.com/typekit/webfontloader

Sequence diagram browser distributions are bundled locally from the project's official demo site. License texts are included in `vendor/licenses` and the Windows package's `resources/licenses` directory.

## Sarasa Mono TC (0.7.2)

Sarasa Mono TC 1.0.42 Regular and Bold are bundled under the SIL Open Font License 1.1. Full glyph sets are preserved in WOFF2 format; no subsetting or outline changes.

- Project/source: https://github.com/be5invis/Sarasa-Gothic/tree/v1.0.42
- Original release: https://github.com/be5invis/Sarasa-Gothic/releases/tag/v1.0.42
- Copyright and license: `resources/licenses/font-sarasa-mono-tc.txt`.
