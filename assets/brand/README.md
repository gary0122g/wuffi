# wuffi brand artwork

The approved direction is the sixth visible style study: flat paper collage.
The primary symbol is a Golden Retriever head with broad floppy ears, a cream
muzzle and a quiet smile. The primary wordmark reads `wuffi` in lowercase dark
rounded lettering. Full-body dogs remain companion illustrations.

## Production assets

Selected production assets are checked in so normal builds do not depend on
ignored generation output:

- `wuffi.png` (512 px), `wuffi.ico` (16–256 px), `wuffi.icns`: standalone head icon.
- `wuffi-logo.png` (1600 px wide): transparent primary horizontal logo.
- `src/assets/dogs/*.png`: six transparent 256 px companion avatars, bundled by Vite.
- `marketing/wuffi/public/brand/`: website logo and head icon.
- `marketing/wuffi/public/dogs/`: six transparent 512 px website companions.

The native icon paths are shared by Electron and Tauri. ICNS and PNG exports
are supplied for possible macOS/Linux use; builds on those systems are unverified.

## Use

- Keep the head symbol for app icons and small navigation marks; use the complete
  horizontal logo where the product name should be visible.
- Use the charcoal wordmark on white or warm ivory. It is not a light-on-dark
  wordmark. The standalone colored head can be used on light or dark surfaces.
- Preserve the original proportions and transparent background. Do not add
  outlines, pixel rendering, glossy highlights or strong shadows.
- Keep clear space of at least one eye-to-eye distance around the head symbol.
- Use the original full-body companion artwork for editorial illustrations.

Palette: warm ivory `#faf7f2`, charcoal `#302c28`, ochre `#dfa650`, cream
`#f5e4c7`, with muted slate-blue collars. Paper grain belongs to the illustrations;
the product UI stays clear and quiet.

## Provenance and preparation

The eight masters were generated using built-in ImageGen. The tool did not expose
a model selector, so no specific model version is claimed. Prompts and reference
roles are in [paper-brand-prompts.json](../../marketing/wuffi/paper-brand-prompts.json).
The selected study is `outputs/wuffi-art-styles/04-paper-collage.png`.

Raw masters remain ignored under `marketing/wuffi/public/generated/paper-cut/`.
Run `scripts/prepare-wuffi-assets.py` with Pillow to encode the masters into the
production sizes above. The script only resizes and encodes; it does not make
creative image edits or call a generation API. The logo exports are raster PNGs,
not editable vector originals. Earlier pixel artwork remains in Git history and
the historical video footage.

## Website art direction

[Paper Walks / 紙上散步](../../marketing/wuffi/design/paper-walks.md) develops the
existing paper-cut identity into writing scenes, marketing compositions, type,
color and motion guidance. The selected direction is implemented in the website
with four independent production illustrations in
`marketing/wuffi/public/art/paper-walks/`. Raw generation output stays ignored;
the complete generation prompts and design tokens are stored beside the guide.
