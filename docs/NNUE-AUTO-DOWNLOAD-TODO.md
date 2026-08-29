# Browser NNUE auto-download plan

PyChess currently requires users to download a Fairy-Stockfish `.nnue` network themselves and select it in Board settings. The goal is to make official networks discoverable, downloadable, and cached by the browser while preserving manual imports for custom/testing networks.

The variant network set is much larger than Lichess' and includes files above 250 MB, so downloads must remain on-demand and large downloads need explicit size-aware confirmation.

## Hosting decision

Do **not** publish an NNUE-only normal release in `gbtami/Fairy-Stockfish`.

`fairyfishnet` resolves `https://api.github.com/repos/gbtami/Fairy-Stockfish/releases/latest` and expects the latest release to contain the exact platform engine binary. An NNUE-only latest release would therefore break automatic worker engine downloads.

Preferred solution: host immutable hash-named `.nnue` assets in a separate release repository, e.g. `gbtami/Fairy-Stockfish-NNUE`. A prerelease in the existing Fairy-Stockfish repository would also stay out of GitHub's `/releases/latest` result, but a separate repository keeps the two release lifecycles safely independent.

## Steps

- [x] **1. Big-file storage foundation**
  - Add OPFS-first storage with IndexedDB fallback, following Lichess' large-asset approach.
  - Route existing manual NNUE imports through it.
  - Lazily migrate existing `variant--nnue-data` IndexedDB entries so users keep their installed networks.
  - Keep the existing manual file picker as the advanced/fallback path.

- [ ] **2. Official NNUE manifest**
  - Add a client-side manifest keyed by the actual Fairy-Stockfish engine variant name.
  - Record immutable filename, byte size, and download URL/tag.
  - Reuse aliases such as `chess -> nn`, `placement -> nn`, and `cambodian -> makruk` where appropriate.
  - Keep user-defined variants manual unless they map to a catalogued Fairy-Stockfish built-in with a known official network.

- [ ] **3. On-demand download manager**
  - Download only the current variant's network, never prefetch the full set.
  - Stream download progress to the analysis settings UI.
  - Reuse the big-file cache on later visits.
  - Automatically download reasonably sized networks after the user requests local NNUE analysis.
  - Require explicit confirmation for large networks, with the exact download size shown. Initial proposed threshold: 64 MiB.

- [ ] **4. Analysis settings UX**
  - Show whether the official network is missing, downloading, cached, or manually supplied.
  - Show download size and progress.
  - Keep “Use NNUE” separate from “network installed” state.
  - Avoid silently downloading a 100–260 MB network merely because the historical `Use NNUE` setting defaults to enabled.
  - Allow retry/removal when storage quota or download errors occur.

- [ ] **5. Integrity and lifecycle**
  - Validate the expected byte size before activating a downloaded network.
  - Delete a corrupt/incomplete cached network and permit a clean retry.
  - When the manifest moves to a new hash-named network, remove the superseded selected official file so old networks do not accumulate indefinitely.
  - Preserve manually selected files unless the user replaces/removes them.

- [ ] **6. Documentation and rollout**
  - Update the NNUE blog/help text so manual Google Drive download is no longer the normal workflow.
  - Test OPFS and IndexedDB fallback in Chromium and Firefox, including a large network.
  - Verify mobile/narrow UI and quota/error messages before enabling automatic first-use downloads in production.
