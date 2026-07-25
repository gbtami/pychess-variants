# Engine Workflows

## Resolve Paths

Resolve the pychess root with `git rev-parse --show-toplevel`. Use `FAIRY_STOCKFISH_DIR` and `FAIRYFISHNET_DIR` when set; otherwise try sibling `Fairy-Stockfish` and `fairyfishnet` directories.

## Start With Local Engine Or `pyffish`

Use Fairy-Stockfish's `test.py` as the first reference for:

- legality checks
- insufficient-material behavior
- variant-specific edge cases
- custom variant configuration examples
- `pyffish` API usage patterns

Read only the relevant section or position family when possible.

## Direct UCI Reproduction

From the fairyfishnet directory, run its local engine with a minimal command stream:

```bash
printf 'uci
setoption name VariantPath value <pychess-root>/variants.ini
setoption name UCI_Variant value chess
isready
position fen <FEN>
go movetime 100 depth 1
quit
' | ./stockfish-x86_64-bmi2
```

Use this to determine whether a move or status bug already exists in engine output. Substitute the resolved repository path; do not copy the placeholder literally.

## Direct Worker Translation Check

When engine output is correct but the worker may be wrong, inspect or run `fairyfishnet.py` directly. Focus on:

- `go(...)`
- `bestmove(...)`
- posted JSON under `"move"` or `"analysis"`

Treat `fishnet.ini` as potentially sensitive. Inspect only the fields needed for the task and never expose or commit credentials.

## Local Worker Against Local Server

Confirm that the worker endpoint targets the intended local server before starting it:

```text
endpoint = http://127.0.0.1:8080/fishnet/
```

Then, from the fairyfishnet directory:

```bash
python3 fairyfishnet.py -v -v
```

Use this only after understanding the lower-layer reproduction.

## Server-Side Checks

From the pychess repository root:

```bash
env PYTHONPATH=server uv run python -c "from utils import sanitize_fen; print(sanitize_fen('chess','<FEN>',False))"
```

Use direct Python checks to determine whether the server accepts a FEN, whether `FairyBoard` has legal moves, or whether a position is terminal before a BOT move is queued.
