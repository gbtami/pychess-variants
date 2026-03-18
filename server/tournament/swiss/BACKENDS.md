# Swiss Pairing Backends

`pychess-variants` currently has three Swiss pairing backends:

- `py4swiss`: default backend. It runs in-process and supports the current PyChess Swiss scoring model, including exact Janggi Swiss scoring. This includes Janggi's `7/0` regular decisive games, `4/2` variant-end results, and custom bye handling.
- `swisspairing`: optional in-process backend. It is used as a parity and conformance backend for the FIDE 2026 Dutch work. In PyChess it also supports the same exact Janggi Swiss scoring as `py4swiss`, because the adapter uses the shared PyChess Swiss history/scoring mapping before calling `swisspairing`. It is still not the default production backend yet.
- `bbpPairings`: optional external executable backend. It is only available through the async Swiss flow, and the current adapter does not support exact Janggi Swiss scoring. `bbpPairings` is therefore not suitable as the site-wide default while PyChess must support every variant equally.

## Selection

Use `SWISS_PAIRING_BACKEND` to force a backend:

- `py4swiss`
- `swisspairing`
- `bbp`

If the variable is unset, PyChess defaults to `py4swiss`.
