# Browser NNUE auto-download plan

PyChess currently requires users to download a Fairy-Stockfish `.nnue` network themselves and select it in Board settings. The goal is to make official networks discoverable, downloadable, and cached by the browser while preserving manual imports for custom/testing networks.

The variant network set is much larger than Lichess' and includes files above 250 MB, so downloads must remain on-demand and large downloads need explicit size-aware confirmation.

## Hosting decision

Do **not** publish an NNUE-only normal release in `gbtami/Fairy-Stockfish`.

`fairyfishnet` resolves `https://api.github.com/repos/gbtami/Fairy-Stockfish/releases/latest` and expects the latest release to contain the exact platform engine binary. An NNUE-only latest release would therefore break automatic worker engine downloads.

The networks are now archived as immutable hash-named assets in the dedicated `gbtami/Fairy-Stockfish-NNUE` repository's long-lived `networks` release. This keeps the NNUE archive completely independent from fairyfishnet's engine-binary release lifecycle.

GitHub Release assets are not suitable as the production browser download origin: current release downloads redirect to `release-assets.githubusercontent.com`, and the final asset response has been observed without the CORS headers required for cross-origin JavaScript fetches. Keep GitHub as the canonical archive/manifest and mirror the files to a CORS-capable object store for Step 3. Cloudflare R2 is the preferred delivery candidate because it supports explicit browser CORS policies and keeps large-file delivery separate from the GitHub archive.

## Steps

- [x] **1. Big-file storage foundation**
  - Add OPFS-first storage with IndexedDB fallback, following Lichess' large-asset approach.
  - Route existing manual NNUE imports through it.
  - Lazily migrate existing `variant--nnue-data` IndexedDB entries so users keep their installed networks.
  - Keep the existing manual file picker as the advanced/fallback path.

- [x] **2. Official NNUE manifest**
  - Bundle the 48 mirrored release assets in a client-side manifest so discovery does not require a runtime GitHub API/manifest request.
  - Record immutable filename and exact byte size and retain the stable GitHub Release URL as the canonical archive URL, not the browser fetch URL.
  - Resolve Fairy-Stockfish's documented compatibility aliases such as `chess -> nn`, `placement -> nn`, `cambodian -> makruk`, `caparandom/embassy/gothic -> capablanca`, and the Janggi compatibility variants.
  - Reuse the same mapping for manual NNUE filename validation.
  - User-defined variants remain manual unless their actual engine variant name is a known catalogued Fairy-Stockfish built-in/network alias.

- [ ] **3. On-demand download manager**
  - [x] Add a configurable `NNUE_DOWNLOAD_ROOT`; automatic downloads stay disabled until a CORS-capable mirror is configured.
  - [x] Download only the current variant's network, never prefetch the full set.
  - [x] Report download progress in the analysis settings UI.
  - [x] Reuse the big-file cache on later visits.
  - [x] Validate the exact manifest byte size before storing or activating a download.
  - [x] Start networks up to 64 MiB after an explicit user download request and require an additional size-aware confirmation above 64 MiB.
  - [x] Mirror the 48 release assets to a private Cloudflare R2 bucket and serve them through the
    `pychess-nnue.gbtami.workers.dev` Worker with explicit PyChess CORS headers. See `docs/NNUE-R2.md`.
  - [ ] Set `NNUE_DOWNLOAD_ROOT=https://pychess-nnue.gbtami.workers.dev` on the deployed server when this
    feature is released.

- [x] **4. Analysis settings UX**
  - Show whether the official network is missing, downloading, cached, or manually supplied.
  - Show exact official file size and live byte/percentage progress.
  - Keep “Use NNUE” separate from “network installed” state and explain that downloads are managed separately.
  - Avoid silently downloading a 100–260 MB network merely because the historical `Use NNUE` setting defaults to enabled.
  - Allow retry after download/storage failures and removal of the selected cached/manual network.

- [x] **5. Integrity and lifecycle**
  - Validate exact byte size before activation and verify the SHA-256 prefix embedded in each official hash-named filename when Web Crypto is available.
  - Record source/integrity metadata for cached networks; lazily validate and adopt official caches created by Steps 1-4.
  - Delete corrupt/incomplete official cache entries and leave the official download action available for a clean retry.
  - When the manifest moves to a new hash-named network, remove a superseded selected **official** cache entry so old networks do not accumulate indefinitely.
  - Preserve manually selected files unless the user explicitly replaces/removes them.

- [ ] **6. Documentation and rollout**
  - Update the NNUE blog/help text so manual Google Drive download is no longer the normal workflow.
  - Test OPFS and IndexedDB fallback in Chromium and Firefox, including a large network.
  - Verify mobile/narrow UI and quota/error messages before enabling automatic first-use downloads in production.
