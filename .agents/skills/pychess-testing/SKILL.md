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
   - Python or server code: run `uv run ruff format --target-version py313 .`, `uv run ruff check .`, and `uv run pyrefly check`, plus targeted Python tests.
   - Mixed frontend and server changes: run both sets.
   - Browser workflows or rendered behavior: add the relevant Playwright or manual browser verification.
4. Run the full Python suite only for broad or cross-cutting changes, when targeted coverage cannot provide enough confidence, or when the user explicitly requests it.
5. Run tournament tests only when tournament code changed, shared code can affect tournaments, or the task explicitly requires tournament coverage. Do not trigger them for unrelated changes merely because they are part of full discovery.

## Commands

Run Python tooling through the project environment. The project runtime and Ruff lint target stay at Python 3.14, but the formatter must use `--target-version py313`. Ruff 0.15+ removes parentheses from multi-exception `except` clauses when formatting as `py314`; using `py313` formatting preserves the parenthesized form, which is valid on Python 3.14 and remains parseable by Python 3.13-based tooling.
Keep existing `from __future__ import annotations` imports in modules that need forward-reference compatibility with Python 3.13-based tooling. They do not change the project runtime target; they prevent 3.13 from eagerly evaluating those annotations during import.

```bash
uv run ruff format --target-version py313 .
uv run ruff check .
uv run pyrefly check
```

Use `server:tests` for direct unittest selection so both server modules and test helpers resolve:

```bash
env PYTHONPATH=server:tests uv run python -m unittest tests.some_test_module
env PYTHONPATH=server:tests uv run python -m unittest tests.some_test_module.SomeTestCase.test_behavior
```

Use `server` only for discovery:

```bash
env PYTHONPATH=server uv run python -m unittest discover -s tests
env PYTHONPATH=server uv run python -m pytest tests/test_simul.py
```

`test_simul.py` uses pytest fixtures and is not collected by `unittest discover`; both commands make up the Python CI coverage.

The ChatGPT Python 3.13 sandbox has a 45-second per-command execution ceiling. Full unittest
discovery is close enough to that ceiling that the tests can finish but interpreter
shutdown can still time out. For sandbox full-suite verification, run the same unittest
modules in two deterministic round-robin shards instead:

```bash
env PYTHONPATH=server uv run python tests/run_unittest_shard.py 1 2
env PYTHONPATH=server uv run python tests/run_unittest_shard.py 2 2
env PYTHONPATH=server uv run python -m pytest tests/test_simul.py
```

The shard runner discovers the same `test*.py` modules as unittest and assigns sorted
module names by index modulo the shard count. This keeps the split stable without a
manually maintained file list and distributes slow modules better than contiguous
halves. GitHub CI can continue using monolithic `unittest discover`; sharding here is a
sandbox execution strategy, not reduced coverage.

Python tests configure application logging at `WARNING` by default to avoid DEBUG-log I/O dominating CI. When diagnosing a failure, opt back into verbose application logs for that run:

```bash
env PYCHESS_TEST_LOG_LEVEL=DEBUG PYTHONPATH=server:tests uv run python -m unittest tests.some_test_module
```

For a justified full run, redirect output when you want to preserve the complete warning/error log and inspect the summary separately:

```bash
env PYTHONPATH=server uv run python -m unittest discover -s tests > /tmp/unittest_full.log 2>&1
rg -n "^Ran [0-9]+ tests|^OK$|^FAILED \(|^ERROR:|^FAIL:" /tmp/unittest_full.log
```

For browser tests:

```bash
uv run python -m playwright install
env PYTHONPATH=server uv run python -m pytest tests/test_e2e.py
env PYTHONPATH=server uv run python -m pytest tests/test_gui.py
env PYTHONPATH=server uv run python -m pytest tests/test_bughouse_lobby_flow.py
```

Avoid Playwright `--with-deps` unless provisioning a fresh host with sudo access. The tests need permission to bind local sockets. Use `uv run server/server.py -a` when an authenticated-flow check can use anonymous test users.

## Sandbox and Handoff

- Request sandbox escalation directly when Pyrefly needs system Python paths or tests need local sockets. Prefer reusable command-prefix approvals.
- If requested Git operations fail because `.git/index.lock` is not writable, retry them with escalation.
- Review the diff after formatting and preserve unrelated user changes.
- Report which checks ran, their results, and any intentionally skipped broad or tournament coverage.
