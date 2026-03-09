# Swiss Feature Review Plan

Date: 2026-03-09
Branch: `feature/swiss-py4swiss-integration`
Baseline: compare against `master`

## Goal

Ship Swiss tournaments in `pychess-variants` with lichess-like behavior for creation, pairing, persistence, lobby/standings UI, and non-played round handling, without regressing existing Arena behavior or unrelated production protections already present on `master`.

## Current Status

The branch already has substantial Swiss support:

- Swiss and RR tournament creation/editing in the existing tournament form.
- Dutch Swiss pairing via `py4swiss`, with optional `swisspairing` backend.
- Fixed-round progression with automatic/manual interval values.
- Late join support with compensation points and persisted missed-round history.
- Persisted byes and absent/unpaired round entries in MongoDB.
- TRF export for Swiss tournaments.
- Swiss/RR lobby updates:
  - current round shown in the header
  - ongoing round marked with `*`
  - non-played rounds rendered as `-`
  - right-side player game list uses `Bye`, `Late`, `Absent`
- Janggi Swiss scoring support, including 7/0 full wins and 4/2 point-counting results.
- Janggi setup flow fixes for autoplay smoke tests and Random-Mover setup refresh.

Validation run on this branch:

- `yarn typecheck`
- `PYTHONPATH=server python -m pytest -q tests/test_swiss_pairing.py tests/tournament_flow_test.py tests/tournament_scoring_test.py tests/tournament_persistence_test.py tests/test_games_api.py tests/test_wsr_janggi_setup.py tests/test_wsl_ai_challenge_janggi.py`
- `PYTHONPATH=server python -m pytest -q tests/test_security_evasion.py`

Result at review time:

- `78 passed` in the main Swiss/tournament/Janggi suite
- `10 passed` in `test_security_evasion.py`

## Priority Findings

### P0: Must Fix Before Merge

- [x] Audit and fix Swiss Sonneborn-Berger parity with lichess/FIDE.
  - Completed in the Swiss branch by adding Swiss-specific tie-break recalculation.
  - RR keeps its existing Berger behavior unchanged.
  - Swiss now treats pairing-allocated/full byes with a virtual-opponent style tie-break contribution, while leaving synthetic late/absent entries out of the tie-break like lichess.
  - Coverage added for:
    - pairing bye tie-break contribution
    - late/absent non-contribution
    - Swiss leaderboard ordering with a bye on tied points

- [x] Remove Arena-style hard `minutes` timeout from Swiss/RR semantics.
  - Completed by making Arena the only system that finishes on the wall-clock deadline.
  - Swiss and RR now finish strictly on round completion / pairing exhaustion.
  - The existing `minutes` field is kept as a displayed estimate for fixed-round events.
  - Form/help text now reflects the estimate-only meaning for Swiss and RR.
  - Coverage added for Swiss and RR with `minutes=0`, ensuring they still complete all configured rounds.

- [x] Decouple Swiss pairing eligibility from open tournament websocket presence.
  - Completed by treating fixed-round tournament game sockets as a valid presence source in addition to tournament lobby sockets.
  - Swiss/RR players who remain on their finished game page now stay pairable for the next round and can receive the `new_game` redirect there.
  - Arena behavior stays unchanged.
  - Coverage added for round-to-round fixed-round flow without reopening the tournament page.

- [x] Restore `master` fishnet abort policy before merge.
  - Completed by merging `master` in commit `9b947a1d`.
  - `server/fishnet.py` and `tests/test_fishnet_abort_policy.py` now include the master-side abort/terminal handling again.

- [x] Restore `master` signup evasion protection before merge.
  - Completed by merging `master` in commit `9b947a1d`.
  - `server/security_evasion.py` and `tests/test_security_evasion.py` now include the fp-only multi-source fallback again.

### P1: Important Swiss Parity Gaps

- [x] Replace Arena-oriented Swiss player state/controls with clearer Swiss semantics.
  - Completed by aligning the user-visible Swiss/RR controls with absence wording instead of Arena `PAUSE` wording.
  - The internal `paused` / `withdrawn` state model remains in place as an implementation detail.
  - Fixed-round tournament pages and finished game pages now show `ABSENT` where Arena still shows `PAUSE`.

- [x] Make the tournament creation page more Swiss-specific.
  - Completed by keeping the shared tournament form, but making its labels/help/FAQ system-aware.
  - Arena still shows Arena-only scoring/Berserk guidance.
  - Swiss and Round-Robin now show fixed-round wording:
    - rounds and interval help aligned with fixed-round behavior
    - duration relabeled as an estimate for fixed-round systems
    - static Arena FAQ replaced with system-specific Arena / RR / Swiss guidance

- [x] Add Swiss tie-break and organizer behavior documentation.
  - Completed on the tournament page FAQ surface.
  - Swiss FAQ now documents:
    - Sonneborn-Berger tie-break behavior
    - virtual-opponent treatment for actual byes
    - late-join / absent placeholder rounds and their scoring impact
    - Janggi-specific Swiss scoring exception
    - early finish when no legal new pairing exists
  - RR now has its own fixed-round FAQ instead of incorrectly reusing Arena guidance.

### P2: Nice-to-Have Lichess Parity Follow-Ups

- [ ] Entry conditions for Swiss creation.
  - Lichess supports conditions such as minimum rated games, account age, rating bounds, titled-only, etc.

- [ ] “Must have played their last Swiss game” anti-no-show rule.
  - Lichess has explicit anti-no-show handling and temporary Swiss bans.

- [ ] Forbidden pairings and manual pairings.
  - Lichess Swiss supports organizer-specified forbidden/manual pairings.

- [ ] Manual next-round scheduling option.
  - Lichess Swiss supports manually scheduling the next round.

## Suggested Execution Order

1. Restore the two `master` regressions first. Done in `9b947a1d`.
   - fishnet abort policy
   - signup evasion fallback

2. Fix Swiss core correctness.
   - Swiss Sonneborn-Berger parity
   - remove hard `minutes` stop for fixed-round systems
   - decouple pairing from tournament websocket presence

3. Clean up Swiss product surface.
   - Swiss wording/state model
   - creation form
   - FAQ/help text

4. Add extra lichess organizer features if still desired.
   - conditions
   - anti-no-show rule
   - forbidden/manual pairings
   - manual next-round scheduling

## Master Sync Notes

The two non-Swiss regressions identified in the review were solved on `master` and have now been merged into this branch in `9b947a1d`:

- Fishnet abort policy:
  - `234b670c5` `Handle repeated fishnet engine crashes with terminal policy`
  - `02eff34f2` `Fix KeyError in fishnet analysis`

- Signup evasion fallback:
  - `928641536` `Tighten evasion signup blocking with multi-source fp fallback`

The merge required manual conflict resolution in:

- `server/fishnet.py`
- `server/security_evasion.py`
- `tests/test_security_evasion.py`

## Progress Log

- [x] Core Swiss pairing backend integrated
- [x] Late join / bye / absent persistence added
- [x] TRF export added
- [x] Swiss/RR round progress shown in lobby
- [x] Ongoing round `*` marker added
- [x] Non-played round labels aligned closer to lichess
- [x] Janggi Swiss score rendering and point model added
- [x] Janggi setup refresh fixed for Random-Mover path
- [x] Swiss Sonneborn-Berger parity
- [x] Fixed-round end condition parity
- [x] Pairing eligibility without tournament page websocket
- [x] Restore master fishnet abort policy
- [x] Restore master signup evasion fallback
- [x] System-aware tournament creation help for Swiss/RR
- [x] Tournament-page Swiss/RR FAQ aligned with fixed-round behavior
