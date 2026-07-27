---
name: pychess-memory-debugging
description: Diagnose and remedy pychess-variants server memory growth, retained Python/native objects, user/game/tournament caches, asyncio tasks, websockets, SSE streams, custom variants, and Fairy-Stockfish registrations. Use for Heroku R14/restarts, rising RSS or swap, suspected leaks, production metrics collection, monitor/monitor.py or monitor/record.py changes, and memory-lifecycle reviews.
---

# PyChess Memory Debugging

Investigate memory growth without making gameplay latency worse. Separate bounded caches, traffic-correlated retention, native allocations, and genuine leaks before changing lifecycle code.

## Protect Production

- Inspect `monitor.sh` without printing its contents. It contains credentials and is ignored by the root `/*.sh` rule; never stage it.
- Obtain explicit authorization before querying production.
- Use `./monitor.sh record` only after the deployed server supports `GET /metrics?summary=True`.
- Keep production intervals at least 60 seconds. Prefer the recorder defaults: seven samples, ten minutes apart, private mode-0600 JSONL under `/tmp`.
- Do not periodically call the full `/metrics` endpoint. It performs garbage collection and heap/object inspection and has taken 1.3–1.6 seconds on production.
- Use an isolated, infrequent full snapshot only when its object detail is necessary and traffic permits it.
- Never expose the monitor token in commands, logs, diffs, commits, or responses.

## Establish the Signal

1. Record the dyno restart time and compare equal-duration windows within one dyno lifetime.
2. Track `rss_mib`, `swap_mib`, and `rss_plus_swap_mib`. RSS falling while swap rises is not memory release.
3. Correlate total memory with:
   - registered totals, cache-only users, and cumulative registered-user evictions;
   - anonymous users;
   - games, tasks, queues, websockets, and SSE streams;
   - Python allocated blocks and cache entry counts;
   - catalogued variants, stored asset bytes, pyffish variants, and fishnet payload bytes.
4. Compare first/last deltas and slopes. Treat a growing count as evidence only when its per-object cost can plausibly explain the memory slope.
5. Preserve raw JSONL privately; analyze summaries without copying credentials or user-sensitive detail.

## Interpret the Main Consumers

- A locally constructed registered `User` has measured roughly 65–70 KiB RSS. Because `Users.get()` loads ratings, relations, preferences, and sets, an unbounded registered-user cache can explain several MiB per hour.
- User `perfs` and `pperfs` maps are intentionally sparse: an absent variant means the default rating. Do not eagerly materialize all rated variants or insert defaults during reads. Track `user_perf_entries` and `user_puzzle_perf_entries`; growth should follow ratings actually created, not `users × rated variants`.
- Legacy MongoDB user documents may still contain eagerly materialized defaults. After deploying sparse-rating server code, use `scripts/compact_user_rating_maps.py` in dry-run mode first, then `--apply`; its optimistic batch filters skip users whose targeted ratings changed after they were read.
- `tracemalloc` materially inflates memory measurements. Use it for allocation provenance, then repeat RSS probes without it for per-object cost.
- pyffish registrations allocate native memory that Python heap walks cannot see. Compare `pyffish_variants` with RSS/swap and reproduce registration growth locally.
- Catalogued SVG/INI payload bytes measure stored text but not every derived cache or native representation. Check the catalogued Betza, board, rules, and client payload caches separately.
- Stable Python object counts with rising RSS+swap suggest native allocation, allocator fragmentation, or an unmeasured cache—not proof of a Python leak.
- Peak RSS never decreases and is diagnostic history, not current quota use.

## Review Ownership Before Eviction

Never remove a cached `User` merely because it is offline. Prevent two live `User` instances for one account by protecting identities referenced by:

- cached games and spectators;
- seeks and invites;
- tournament players, by-name maps, byes, and spectators;
- simul players, pending players, and spectators;
- auto-pairing maps;
- correspondence games, sockets, SSE channels, watched games, and user-owned tasks.

Use one central sweep rather than one sleeping task per registered user. Track cache access, apply a conservative TTL, re-check identity before deletion, and expose cumulative eviction telemetry. Test both eviction of idle cache-only users and retention of externally referenced users.

- Beware `collections.UserDict`: its inherited `values()` and `items()` enumerate through `__getitem__`. If `__getitem__` refreshes access time, metrics and global scans keep every entry alive. Override bulk views with timestamp-neutral underlying-dict views and test that explicit lookup still refreshes.
- Loading a historical tournament materializes every participant as a full `User` and protects those identities while the tournament remains cached. Measure finished tournament counts and unique user references. Use a short last-access-based TTL for finished tournaments, retain active viewers by checking both central and per-user socket maps, and clear both maps on eviction.
- Re-read the last-access timestamp after every timer sleep; an HTTP or websocket request can refresh it while the removal task is asleep. Remember that tournament eviction and registered-user eviction have separate TTLs.

## Diagnose Tasks and Streams

- Check both container membership and task completion/cancellation callbacks.
- Look for tasks retaining a game/user through closures after removal.
- Verify websocket/SSE `finally` paths discard queues and socket sets during disconnect races.
- When removing games or tournaments, cancel clocks/work and clear reverse references before deleting the top-level cache entry.
- Prefer reverse indexes over scanning the entire heap or every game during routine cleanup.

## Validate a Remedy

Use the `pychess-testing` skill for code changes. Add focused tests that prove lifecycle boundaries and race safety, then run Python formatting, Ruff, Pyright, and targeted tests. Do not claim the production slope is fixed until a post-deploy recording spans a representative traffic window and shows bounded counts and RSS+swap.
