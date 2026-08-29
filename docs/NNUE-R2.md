# NNUE browser download origin (Cloudflare R2)

The GitHub repository `gbtami/Fairy-Stockfish-NNUE` remains the canonical
archive and manifest for official Fairy-Stockfish NNUE networks. Browser-side
PyChess downloads need a CORS-capable mirror because GitHub Release asset
redirects are not a reliable cross-origin `fetch`/XHR origin.

Cloudflare R2 is the preferred production mirror. PyChess never needs R2 write
credentials: the browser only performs public `GET` requests.

## 1. Create the bucket

Create an R2 bucket, for example `pychess-nnue`, and upload the 48 hash-named
`.nnue` files from the NNUE archive. Keep the object keys equal to their
filenames, with no directory prefix.

For bulk uploads Cloudflare recommends an S3-compatible client such as rclone.
Wrangler also works, but uploads one object at a time.

The resulting object layout should look like:

```text
3check-cb5f517c228b.nnue
antichess-dd3cbe53cd4e.nnue
...
cannonshogi-b9b7fc49f641.nnue
...
xiangqi-c07e94a5c7cb.nnue
```

Do not rename the files. Their hash-bearing names make the download URLs
immutable and allow old PyChess clients to keep using the exact network they
were built for.

## 2. Enable public reads

For temporary DEV testing, R2's public `r2.dev` URL is sufficient. Cloudflare
marks that endpoint as non-production and rate-limited, so production should
use a custom domain connected directly to the bucket, for example an NNUE
subdomain under a domain managed by Cloudflare.

The public root must resolve files directly:

```text
https://<NNUE-DOMAIN>/crazyhouse-8ebf84784ad2.nnue
```

## 3. Configure CORS

Add this policy to the bucket and add any separate DEV deployment origin you
need while testing:

```json
[
  {
    "AllowedOrigins": [
      "https://www.pychess.org",
      "https://pychess.org",
      "http://127.0.0.1:8080",
      "http://localhost:8080"
    ],
    "AllowedMethods": ["GET", "HEAD"],
    "MaxAgeSeconds": 3600
  }
]
```

If CORS is changed after a custom domain has already cached objects, purge that
hostname's cache so old responses without the CORS headers are not retained.

A useful command-line check is:

```bash
curl -I \
  -H 'Origin: https://www.pychess.org' \
  'https://<NNUE-DOMAIN>/ataxx-e631fe1b1b6d.nnue'
```

The response should be successful and include an
`Access-Control-Allow-Origin` value permitting `https://www.pychess.org`.

## 4. Configure PyChess

Set the server environment variable to the public bucket/custom-domain root,
without a filename:

```text
NNUE_DOWNLOAD_ROOT=https://<NNUE-DOMAIN>
```

A trailing slash is harmless; the server strips it before exposing the value to
the client.

When this setting is empty, PyChess keeps the existing manual `.nnue` picker
and the official-download button reports that automatic downloads are not
configured. This makes the code safe to deploy before the R2 mirror is ready.

## 5. Download behavior

PyChess downloads exactly one official network on request. It does not prefetch
other variants.

- Networks up to 64 MiB start immediately after the user presses the official
  download button.
- Networks above 64 MiB show a size-aware confirmation first.
- Progress is shown while the browser downloads the file.
- The completed byte count must exactly match the bundled manifest before the
  network is stored or activated.
- The file is persisted through the OPFS-first/IndexedDB-fallback storage added
  in Step 1 and reused on later visits.
- The manual file picker remains available for custom/test networks.
