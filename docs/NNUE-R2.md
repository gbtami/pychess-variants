# NNUE browser download origin (Cloudflare R2 + Worker)

The GitHub repository `gbtami/Fairy-Stockfish-NNUE` remains the canonical
archive and manifest for official Fairy-Stockfish NNUE networks. Browser-side
PyChess downloads need a CORS-capable delivery origin because GitHub Release
asset redirects are not a reliable cross-origin `fetch`/XHR origin.

The production mirror uses a private Cloudflare R2 bucket behind a very small
Cloudflare Worker. PyChess never receives R2 credentials and Heroku never
proxies the 1–260 MB network files.

```text
PyChess browser
    -> https://pychess-nnue.gbtami.workers.dev
    -> Worker R2 binding: NNUE
    -> private R2 bucket: pychess-nnue
```

The R2 public `r2.dev` development URL is disabled.

## R2 bucket

The bucket is named `pychess-nnue` and contains the 48 hash-named `.nnue`
assets from the canonical GitHub release. Object keys are exactly their
filenames, with no directory prefix.

For bulk maintenance use rclone with a bucket-scoped Object Read & Write token.
The bucket was created with the Eastern Europe location hint (`EEUR`), which is
not the separate R2 EU jurisdiction. Its S3 API endpoint therefore uses the
normal form:

```text
https://<ACCOUNT_ID>.r2.cloudflarestorage.com
```

Do not add `.eu.` merely because the bucket has an Eastern Europe location
hint; `.eu.r2.cloudflarestorage.com` is only for buckets created in the strict
EU jurisdiction.

A typical upload/update is:

```bash
rclone copy ./nnue r2:pychess-nnue \
  --include '*.nnue' \
  --progress \
  --transfers 4 \
  --checkers 8
```

Do not rename old assets. Their hash-bearing names keep URLs immutable and let
older PyChess clients continue fetching the exact network they know about.

## Worker

The Worker is named `pychess-nnue` and has an R2 binding named `NNUE` pointing
to the `pychess-nnue` bucket. It serves only top-level `.nnue` objects using
`GET` and `HEAD`, streams the R2 body directly, and supplies CORS/cache headers.

The production handler should use an allowlist containing at least:

```text
https://www.pychess.org
https://pychess.org
http://127.0.0.1:8080
http://localhost:8080
```

NNUE responses should include:

```text
Access-Control-Allow-Origin: <matching allowed origin>
Cache-Control: public, max-age=31536000, immutable
Content-Type: application/octet-stream
X-Content-Type-Options: nosniff
```

The Worker must stream `object.body`; do not convert a large R2 object into an
`ArrayBuffer` inside the Worker.

A production check is:

```bash
curl -I \
  -H 'Origin: https://www.pychess.org' \
  'https://pychess-nnue.gbtami.workers.dev/ataxx-e631fe1b1b6d.nnue'
```

The expected response is `200`, `Content-Length: 245728`, and an
`Access-Control-Allow-Origin` header for `https://www.pychess.org`.

## PyChess configuration

Set the server environment variable to the Worker root, without a filename:

```text
NNUE_DOWNLOAD_ROOT=https://pychess-nnue.gbtami.workers.dev
```

A trailing slash is harmless; PyChess strips it before building an object URL.
When this setting is empty, manual `.nnue` loading remains available and the
official-download control reports that automatic downloads are not configured.

## Download behavior

PyChess downloads exactly one official network on explicit request. It never
prefetches the complete network set.

- Networks up to 64 MiB start after the user presses the official download
  button.
- Networks above 64 MiB show a size-aware confirmation first.
- Analysis settings show the exact official byte size and live transfer
  progress.
- The completed byte count must match the bundled manifest before the network
  is stored or activated.
- Files are persisted through OPFS first, with IndexedDB fallback, and reused
  on later visits.
- The manual file picker remains available for custom/test networks.

## Updating the official networks

The GitHub release is the source of truth and R2 is only its browser-delivery
mirror. When Fairy-Stockfish publishes a replacement network:

1. Keep the old hash-named GitHub Release asset for compatibility with older
   clients.
2. Add the new network to `gbtami/Fairy-Stockfish-NNUE`, regenerate its manifest,
   and upload the new release asset.
3. Upload the new `.nnue` object to the private R2 bucket with the same filename.
4. Regenerate PyChess' bundled catalogue from the mirror checkout:

   ```bash
   python3 scripts/update_nnue_catalogue.py ../Fairy-Stockfish-NNUE
   ```

   Commit the resulting `client/nnueCatalog.generated.ts`. The generator also
   imports authoritative custom-variant fingerprints and trusted FSF aliases
   from `variant-identities.json`.
5. Deploy PyChess. Step 5 lifecycle handling removes a superseded **official**
   selected cache when that variant is next used; manually supplied networks are
   never garbage-collected by this update path.

Useful mirror checks are:

```bash
rclone lsf r2:pychess-nnue --include '*.nnue' | wc -l
rclone size r2:pychess-nnue --include '*.nnue'
```

The expanded verified mirror currently contains 140 networks totaling
`7,118,164,801` bytes.
The R2 bucket stays private; do not re-enable its public `r2.dev` development URL.

## User-defined variant identity safety

Automatic NNUE selection for a user-defined variant is never based on its
internal name alone. A UDV must match an authoritative Fairy-Stockfish custom
definition using the conservative `fsf-ini-v1` SHA-256 fingerprint. The shipped
Fairy-Stockfish `src/variants.ini` definition is authoritative when present; the
wiki is only a fallback.

Built-in/site variants and explicit Fairy-Stockfish compatibility aliases keep
their trusted mapping. UDV aliases are deliberately not followed. Networks with
no authoritative custom definition remain available only through the manual
NNUE file picker.

## Secrets and recovery

R2 API credentials are maintenance credentials only. Keep them out of PyChess,
Git, Worker source, logs, and support messages. The Worker needs only the `NNUE`
R2 binding; browser users never receive R2 credentials.

If the Worker must be recreated:

1. Create a Worker named `pychess-nnue`.
2. Bind the private `pychess-nnue` R2 bucket as `NNUE`.
3. Allow only top-level `.nnue` keys and `GET`/`HEAD` (plus CORS preflight).
4. Stream `object.body` directly and set the CORS/cache/content-type headers
   documented above.
5. Verify the Ataxx `HEAD` request before restoring `NNUE_DOWNLOAD_ROOT`.

If R2/Workers are temporarily unavailable, already cached networks and manual
imports continue working. New official downloads fail with a retryable UI error.
To disable new automatic downloads immediately without a code rollback, unset:

```text
NNUE_DOWNLOAD_ROOT
```

## Local and production rollout

Local development can exercise the real Worker by exporting:

```bash
export NNUE_DOWNLOAD_ROOT=https://pychess-nnue.gbtami.workers.dev
```

Restart the local PyChess server after changing it. Production uses the same
root. See `docs/NNUE-TESTING.md` for the browser/storage/large-file matrix that
should be run before and immediately after enabling the setting in production.
