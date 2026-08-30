# Browser NNUE rollout checklist

Use this checklist before enabling or changing the official browser NNUE download
service in production. The tests are intentionally manual because they exercise
browser storage, network transfer, WASM memory, responsive UI, and the external
Cloudflare delivery path.

## Local setup

Start PyChess with the production Worker as the NNUE download root:

```bash
export NNUE_DOWNLOAD_ROOT=https://pychess-nnue.gbtami.workers.dev
```

Restart the server after changing the environment variable. The Worker allows the
normal local origins `http://localhost:8080` and `http://127.0.0.1:8080`.

Use a fresh/private browser profile when testing first-use behavior. A normal
profile may already have an NNUE cached in OPFS or IndexedDB.

## Core flow

Run these checks in both current Firefox and Chromium:

- [ ] Open analysis for Ataxx. The settings panel shows the official filename and
      size but does not download it merely because **Use NNUE** is enabled.
- [ ] Press **Download official NNUE**. The 245,728-byte Ataxx network downloads,
      progress reaches 100%, and the state becomes **Official NNUE cached**.
- [ ] Start local analysis. The engine header reports `Fairy-Stockfish 14+ NNUE`.
- [ ] Disable **Use NNUE**. Analysis continues with HCE and the cached file remains
      installed.
- [ ] Enable **Use NNUE** again. The existing cached file is reused without another
      download.
- [ ] Reload the page and start analysis again. The cached network is reused.
- [ ] Press **Remove NNUE**, confirm removal, and verify that the official download
      action returns. Download it again successfully.

## Large network

Use a network above the 64 MiB confirmation threshold, for example Capablanca
(`capablanca-bb644ef32758.nnue`, 101,518,240 bytes).

- [ ] The first download click shows a size-aware confirmation instead of silently
      starting the transfer.
- [ ] Canceling the confirmation leaves storage unchanged.
- [ ] Accepting it shows live byte/percentage progress and finishes successfully.
- [ ] Analysis starts with NNUE after the download.
- [ ] Reloading reuses the large cached network without another network request.
- [ ] Browser memory remains usable during download and engine activation.

## Manual NNUE fallback

- [ ] Import a compatible `.nnue` with the manual file picker. The state becomes
      **Manual NNUE supplied** and the engine can use it immediately without reload.
- [ ] Replacing the manual file removes the previous selected cache entry.
- [ ] **Remove NNUE** removes a manual file only after explicit confirmation.
- [ ] A manually supplied file is not removed merely because the official manifest
      points at another network version.

## Failure and recovery

- [ ] Temporarily start the server with an empty `NNUE_DOWNLOAD_ROOT`. Manual import
      still works and official download reports that the service is not configured.
- [ ] With DevTools offline mode enabled, an official download fails cleanly and a
      retry action remains available after networking is restored.
- [ ] Interrupt/reject a download and verify that an incomplete official network is
      not activated as NNUE.
- [ ] If practical, test in a profile with constrained storage/quota. A failed write
      must leave analysis usable and must not destroy a previously working manual
      network.
- [ ] Clear site storage and verify that PyChess returns to the expected missing
      network state rather than retaining stale UI metadata.

## Storage backends

OPFS is preferred. IndexedDB remains the fallback for browsers where OPFS is not
available or its probe fails.

- [ ] In normal Firefox/Chromium, verify that an installed network survives reload.
- [ ] Exercise the IndexedDB fallback in a browser/environment where OPFS is
      unavailable, then verify install, reload, removal, and re-download.
- [ ] If upgrading a profile that used the old `variant--nnue-data` IndexedDB entry,
      verify that the old network still loads and is lazily migrated when possible.

## Responsive/mobile UI

At a narrow/mobile viewport:

- [ ] Filename, exact size, state, progress, download/retry, and remove controls stay
      readable without horizontal overflow.
- [ ] Large-download confirmation is usable.
- [ ] The settings panel can still be closed/scrolled while a download is in
      progress.

## Production smoke test

After deployment:

```bash
curl -I \
  -H 'Origin: https://www.pychess.org' \
  'https://pychess-nnue.gbtami.workers.dev/ataxx-e631fe1b1b6d.nnue'
```

Expect `200`, `Content-Length: 245728`,
`Access-Control-Allow-Origin: https://www.pychess.org`, and an immutable
long-lived cache header.

Then test one small and one large network from the production analysis page.
If rollout must be stopped, unset `NNUE_DOWNLOAD_ROOT`; existing cached/manual
networks continue to work and no Heroku proxy is involved.
