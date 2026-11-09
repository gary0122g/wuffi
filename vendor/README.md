# External assets and build tools

Git tracks the application WOFF2 fonts in `src/assets/sarasa/`, the third-party browser scripts in `public/`, and license files here. The original Sarasa TTF files and downloaded archives are local conversion inputs and are excluded from Git; normal builds use the tracked WOFF2 files directly.

The Windows x64 application downloads the unmodified Pandoc 3.12.1 executable on the first conversion, after confirmation. The packager no longer needs or includes `vendor/pandoc/`. Downloads and installed files are verified using `resources/pandoc-release.json`; the ZIP hash matches the [official Pandoc release](https://github.com/jgm/pandoc/releases/tag/3.12.1). The installed executable and its license files live under the application's user-data directory in `components/pandoc/3.12.1-windows-x86_64/`, so later conversions work offline.

See `THIRD_PARTY_NOTICES.md` for licenses and source links.
