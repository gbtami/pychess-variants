---
name: pychess-testing
description: Select and run change-scoped quality gates for pychess-variants. Use after modifying code and before reporting completion or committing, especially when choosing between frontend checks, Python gates, targeted unit tests, tournament coverage, or Playwright tests, and when sandbox permissions or noisy test output need special handling.
---

# Pychess Testing

Work from the repository root. Match verification effort to the files and behavior changed.

## Select the Scope

1. Inspect the task-owned diff and identify every affected layer.
2. Run targeted tests by default. Find the closest existing test module, class, or case before considering broad discovery.
3. Use the following gates:
   - TypeScript, CSS, or static UI only: run `yarn typecheck` and `yarn test`. Skip Python gates.
   - Python or server code: run `uv run ruff format .`, `uv run ruff check .`, and `uv run pyright`, plus targeted Python tests.
   - Mixed frontend and server changes: run both sets.
   - Browser workflows or rendered behavior: add the relevant Playwright or manual browser verification.
4. Run the full Python suite only for broad or cross-cutting changes, when targeted coverage cannot provide enough confidence, or when the user explicitly requests it.
5. Run tournament tests only when tournament code changed, shared code can affect tournaments, or the task explicitly requires tournament coverage. Do not trigger them for unrelated changes merely because they are part of full discovery.

## Commands

Run Python tooling through the project environment:

```bash
uv run ruff format .
uv run ruff check .
uv run pyright
```

Use `server:tests` for direct unittest selection so both server modules and test helpers resolve:

```bash
env PYTHONPATH=server:tests uv run python -m unittest tests.some_test_module
env PYTHONPATH=server:tests uv run python -m unittest tests.some_test_module.SomeTestCase.test_behavior
```

Use `server` only for discovery:

```bash
env PYTHONPATH=server uv run python -m unittest discover -s tests
```

When a justified full run is noisy, redirect its complete output and inspect the summary:

```bash
env PYTHONPATH=server uv run python -m unittest discover -s tests > /tmp/unittest_full.log 2>&1
rg -n "^Ran [0-9]+ tests|^OK$|^FAILED \\(|^ERROR:|^FAIL:" /tmp/unittest_full.log
```

Do not rely on `unittest -q` or `-b` for quiet output; application logger initialization remains noisy.

For browser tests:

```bash
uv run python -m playwright install
env PYTHONPATH=server uv run python -m pytest tests/test_e2e.py
env PYTHONPATH=server uv run python -m pytest tests/test_gui.py
```

Avoid Playwright `--with-deps` unless provisioning a fresh host with sudo access. The tests need permission to bind local sockets. Use `uv run server/server.py -a` when an authenticated-flow check can use anonymous test users.

## Sandbox and Handoff

- Request sandbox escalation directly when pyright needs system Python paths or tests need local sockets. Prefer reusable command-prefix approvals.
- If requested Git operations fail because `.git/index.lock` is not writable, retry them with escalation.
- Review the diff after formatting and preserve unrelated user changes.
- Report which checks ran, their results, and any intentionally skipped broad or tournament coverage.
