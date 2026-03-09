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

- [ ] Replace Swiss `berger` tie-break with a Swiss-style tie-break.
  - Current code uses `berger` for all non-Arena tournaments in `server/tournament/tournament.py`.
  - This is correct for RR, but not for Swiss.
  - Lichess Swiss uses opponent-points tie-break with virtual-opponent handling for byes/forfeits.
  - Work:
    - implement dedicated Swiss tie-break logic
    - keep RR Berger logic unchanged
    - add Swiss standings tests with tied scores, byes, and absences

- [ ] Remove Arena-style hard `minutes` timeout from Swiss/RR semantics.
  - Current fixed-round tournaments still finish on `ends_at`, even if not all rounds are completed.
  - Lichess Swiss is round-count driven, not duration-driven.
  - Work:
    - decide target semantics for Swiss and RR
    - likely make rounds + interval the actual completion condition
    - keep displayed duration as estimate only, if desired
    - update form/help text and tests

- [ ] Decouple Swiss pairing eligibility from open tournament websocket presence.
  - Current `waiting_players()` requires tournament sockets.
  - Only the tournament page opens the tournament websocket.
  - A Swiss player who stays on the finished game page can silently become absent for the next round.
  - Work:
    - define explicit Swiss participation/absence state
    - pair eligible joined players even without an open tournament page socket, or make absence explicit and user-visible
    - add tests for round-to-round flow without reopening the tournament page

- [ ] Restore `master` fishnet abort policy before merge.
  - Branch currently regresses current `master` fishnet handling.
  - Current branch requeues aborted fishnet work as `ANALYSIS` and dropped terminal abort handling.
  - Work:
    - reapply master fishnet abort logic
    - restore `tests/test_fishnet_abort_policy.py`
    - ensure move/analysis jobs keep correct queue priority and stale handling

- [ ] Restore `master` signup evasion protection before merge.
  - Branch currently drops the fp-only multi-source fallback from `master`.
  - Work:
    - reapply master `security_evasion.py` logic
    - restore the related tests in `tests/test_security_evasion.py`

### P1: Important Swiss Parity Gaps

- [ ] Replace Arena-oriented Swiss player state/controls with clearer Swiss semantics.
  - Current UI and server still expose `pause` / `withdraw` mechanics inherited from Arena.
  - Lichess Swiss primarily models started-event opt-out as absence.
  - Work:
    - review whether `paused` / `withdrawn` should remain implementation details only
    - align user-visible wording and controls with Swiss expectations

- [ ] Make the tournament creation page more Swiss-specific.
  - Current form still mixes Arena and Swiss concepts:
    - common “Duration” field
    - common Arena FAQ block in the static template
    - Swiss is one option inside the Arena form template
  - Work:
    - hide/rename Arena-specific concepts for Swiss
    - make Swiss help text match actual branch semantics
    - consider separate Swiss creation view if shared form becomes too awkward

- [ ] Add Swiss tie-break and organizer behavior documentation.
  - Current `client/tournamentFaq.ts` is a useful start, but not complete enough for a long-term parity target.
  - Work:
    - document tie-break details once implemented
    - document late join / bye / absent behavior precisely
    - document Janggi-specific exception clearly

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

1. Restore the two `master` regressions first.
   - fishnet abort policy
   - signup evasion fallback

2. Fix Swiss core correctness.
   - Swiss tie-break
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

The two non-Swiss regressions identified in the review are already solved on `master` and should be pulled in rather than re-invented here:

- Fishnet abort policy:
  - `234b670c5` `Handle repeated fishnet engine crashes with terminal policy`
  - `02eff34f2` `Fix KeyError in fishnet analysis`

- Signup evasion fallback:
  - `928641536` `Tighten evasion signup blocking with multi-source fp fallback`

Likely safest approach:

- merge or rebase latest `master`

Possible narrower approach:

- selectively cherry-pick the three commits above and resolve conflicts

Because this branch also modified the same files, expect manual conflict resolution in:

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
- [ ] Swiss tie-break parity
- [ ] Fixed-round end condition parity
- [ ] Pairing eligibility without tournament page websocket
- [ ] Restore master fishnet abort policy
- [ ] Restore master signup evasion fallback
