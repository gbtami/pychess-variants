# Browser NNUE auto-download plan

PyChess now discovers, downloads, validates, and persistently caches official
Fairy-Stockfish NNUE networks from the analysis settings panel. Manual `.nnue`
imports remain available for custom/testing networks.

The variant network set is much larger than Lichess' and includes files above
250 MB, so downloads remain on-demand and large downloads require explicit
size-aware confirmation.

## Hosting decision

Do **not** publish an NNUE-only normal release in `gbtami/Fairy-Stockfish`.

`fairyfishnet` resolves `https://api.github.com/repos/gbtami/Fairy-Stockfish/releases/latest`
and expects the latest release to contain the exact platform engine binary. An
NNUE-only latest release would therefore break automatic worker engine downloads.

The networks are archived as immutable hash-named assets in the dedicated
`gbtami/Fairy-Stockfish-NNUE` repository's long-lived `networks` release. This
keeps the NNUE archive completely independent from fairyfishnet's engine-binary
release lifecycle.

GitHub remains the canonical archive/manifest, but browser delivery uses a
private Cloudflare R2 bucket behind the `pychess-nnue.gbtami.workers.dev`
Worker. GitHub Release asset redirects are not a reliable cross-origin browser
`fetch` origin, while the Worker gives PyChess explicit CORS and streams large
objects without routing them through Heroku. See `docs/NNUE-R2.md`.

## Completed implementation

- [x] **1. Big-file storage foundation**
  - OPFS-first storage with IndexedDB fallback.
  - Existing manual imports use the big-file store.
  - Legacy `variant--nnue-data` entries are lazily migrated when possible.
  - Manual import remains the advanced/fallback path.

- [x] **2. Official NNUE manifest**
  - Bundle the mirrored assets with immutable filename and exact byte size.
  - Resolve Fairy-Stockfish's compatible-network aliases.
  - Reuse the same mapping for manual filename validation.
  - Synchronize catalogue metadata from `gbtami/Fairy-Stockfish-NNUE` with
    `scripts/update_nnue_catalogue.py`.
  - User-defined variants get automatic NNUE only when their `fsf-ini-v1`
    fingerprint matches an authoritative Fairy-Stockfish custom definition;
    name-only matches and aliases are not sufficient for UDV.

- [x] **3. On-demand download manager**
  - Configurable `NNUE_DOWNLOAD_ROOT`.
  - Download only the current variant's network; never prefetch the full set.
  - Live progress, exact-size validation, persistent cache reuse.
  - Additional confirmation above 64 MiB.
  - 140 verified release assets mirrored to private R2 and served through the Worker.

- [x] **4. Analysis settings UX**
  - Missing/downloading/cached/manual states with exact sizes and progress.
  - **Use NNUE** is independent from whether a network is installed.
  - Retry and explicit removal controls.
  - Manual imports hot-load without requiring a page refresh.

- [x] **5. Integrity and lifecycle**
  - Exact-size validation plus SHA-256 filename-prefix verification when Web
    Crypto is available.
  - Source/integrity metadata for official versus manual caches.
  - Corrupt/incomplete official caches are discarded for clean retry.
  - Superseded selected official networks are removed without touching manual
    files.

- [x] **6. Documentation and rollout preparation**
  - Preserve the historical NNUE blog posts unchanged; they document the
    workflow that existed when they were published.
  - Document the current official first-use download workflow separately from
    historical announcements.
  - Document R2/Worker maintenance, update/recovery, and rollback.
  - Add the cross-browser/manual rollout matrix in `docs/NNUE-TESTING.md`.

## Production rollout

These are deployment actions, not implementation work:

- [ ] Complete the manual Firefox and Chromium matrix in `docs/NNUE-TESTING.md`,
      including one network above 64 MiB and a narrow/mobile viewport.
- [ ] Set
      `NNUE_DOWNLOAD_ROOT=https://pychess-nnue.gbtami.workers.dev` on the
      production server and restart/deploy.
- [ ] Run the production Worker/CORS smoke test and download one small and one
      large network from the production analysis page.

Rollback is intentionally simple: unset `NNUE_DOWNLOAD_ROOT`. Manual imports and
already cached networks remain usable, and Heroku never proxies the NNUE bytes.
