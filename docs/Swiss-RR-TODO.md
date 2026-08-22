# Swiss and Round-Robin roadmap

Swiss and Round-Robin (RR) are implemented but have not yet been exercised by normal
production users. Swiss is intended to follow Lichess/lila semantics closely. RR follows
the asynchronous arrangement model used by lishogi, where the two players agree on a
time and one player creates a challenge that the opponent accepts; the scheduled time is
a reminder/appointment and does **not** automatically create or start the game.

This is one roadmap because both systems share PyChess's tournament persistence, Teams,
entry conditions, game scoring, chat, restart recovery, and websocket infrastructure.
The Swiss and RR tracks remain separate below because their pairing/game lifecycles are
fundamentally different.

Reference snapshots used for this review:

- PyChess: `pychess-variants-master(3)(20260821-200510)`
- Lichess/lila: `lila-master(20260821-201248)` (`modules/swiss`)
- lishogi: `lishogi-master(2)` (`modules/tournament` arrangement/Robin flow)

The Python 3.13 offline test environment from `AGENTS.md` was used during the audit.
All `test_tournament*.py` tests passed (137 tests), and the dedicated Swiss pairing suite
passed separately (25 tests).

## Audit conclusion

There is no reason to replace either implementation.

**Swiss is already mature.** It has Dutch pairing through `py4swiss`, Lichess-like
late-entry handling, byes, Sonneborn-Berger tie-breaks, no-show bans, forbidden/manual
pairings, automatic/manual round intervals, and unusually strong restart repair.
The remaining Swiss work is mostly bounding/validating organizer input and making a few
production policies explicit before Team leaders can create events.

**RR is also feature-complete at the product level.** Its matrix, approval flow,
two-sided scheduling, agreement tolerance, challenge/accept flow, reminders, hard finish
date, team-removal handling, aborted-game reopening, and game-based restart reconciliation
are all present. Its higher-priority findings are lifecycle/concurrency issues specific to
the asynchronous arrangement model.

## Already in good shape — shared infrastructure

- Ordinary fixed-round creation is already Team-oriented: a non-director must have the
  Team `tournaments` permission; standalone RR/Swiss creation is limited to the current
  DEV/tournament-director path.
- Fixed-round creation has a rolling per-user quota (currently five RR/Swiss events per
  24 hours).
- Team membership is checked server-side when joining. Removing a member from an active
  Team tournament withdraws/pauses that player; RR additionally clears unusable pending
  schedules/challenges involving the removed member.
- BOT accounts cannot join tournaments.
- Public catalogued variants are supported; inaccessible/private catalogued variants and
  two-board variants are rejected server-side.
- Rating, minimum rated-game, account-age, password, custom-start, rated/casual, and clock
  validation reuse the common tournament infrastructure.
- Created/started tournaments, player rows, pairings, games, chat, current round, next-round
  timing, and terminal state are persisted.
- Fixed-round players do not depend on keeping the tournament websocket open. The recent
  tournament-notification work coordinates game redirects across tabs and plays an audible
  notification before navigation.
- Site admins/tournament directors retain the existing global tournament moderation tools.

## Already in good shape — Swiss

- `SwissTournament` uses `py4swiss`'s Dutch engine and reconstructs the complete TRF state
  from durable tournament/player/pairing history before each round.
- Lichess-like late join is supported through half of the configured rounds. Missed rounds
  receive durable synthetic `H`/`Z` history so pairing and standings survive restart.
- Pairing-allocated byes, manual full byes, absent rounds, and late-entry half-points are
  distinguished in persisted history and in the UI.
- Forbidden pairings are supplied to the Dutch engine; manual pairings/byes can override
  one round and are cleared after they are consumed.
- The Swiss no-show policy closely follows Lichess: escalating bans, a 30-day cap, and a
  successful subsequent game clearing the ban. Its writes are designed to be idempotent
  across partial crashes.
- The score/tie-break implementation follows Lichess's Sonneborn-Berger-style calculation,
  including virtual-opponent treatment for real byes. PyChess's Janggi point system is
  intentionally preserved.
- Automatic round delays are derived from the time control and bounded; manual rounds and
  long 1d/2d/7d intervals are supported.
- Pairing failures terminate cleanly with explicit `notEnoughPlayers` or `noLegalPairing`
  reasons and system-chat messages.
- Restart repair is extensive: missing pairing documents can be reconstructed from games,
  interrupted round commits are rolled back/repaired, late-entry history and byes are
  repaired, partially persisted scores are recovered, and no-show side effects are replayed
  idempotently.
- A TRF export is available for diagnosing Swiss pairing state.

## Already in good shape — Round-Robin

- RR deliberately does **not** use the Arena/Swiss batch game-creation model. The full
  pair matrix is projected deterministically and persisted as `tournament_arrangement`
  records.
- The field size is capped at 16 players. This is intentionally much smaller than
  lishogi's historical 50-player Robin limit: at 16 players the maximum matrix is only
  120 arrangements, which is a sensible limit for PyChess's small server and UI.
- Optional organizer approval, pending/denied lists, kicking, and open/closed joining are
  implemented and persisted before the field freezes at start.
- Each pair can independently propose a time. Proposals within 60 seconds become an agreed
  appointment, matching lishogi's tolerance model.
- Agreement notifications and approximately-24-hour reminders are persisted in the normal
  PyChess notification system, with anti-spam cooldown/repeat windows.
- The appointment is intentionally not an auto-start. One player creates the tournament
  challenge and the opponent explicitly accepts it, matching lishogi.
- The challenge reserves the final game id, fixes the circle-method color, carries the RR
  arrangement id into the game, and only then registers/scorers the game as a tournament
  game.
- Aborted games reopen the arrangement for replay instead of scoring it.
- RR restart reconciliation checks authoritative game documents by arrangement id and
  repairs stale `started`/`finished` arrangement state.
- RR has a real hard finish date, unlike Swiss where the duration is only an estimate.
- The dedicated RR client already has matrix/list/challenge/manage views, scheduling modal,
  online-status lookup, approval controls, and responsive presentation.

# Production-readiness work before Team-leader rollout

## Shared tournament lifecycle

- [x] **Tournament GDPR/account-erasure coverage.** Account erasure currently scrubs
  tournament chat and removes the account from active Team tournaments, but historical
  tournament identity still remains in tournament-specific documents. Define and implement
  a durable ghost-user policy for `tournament.createdBy`, `tournament_player.uid`,
  `tournament_pairing.u`, and RR `tournament_arrangement` user/challenger fields, and scrub
  already-loaded tournament objects as well. Lila explicitly rewrites Swiss players and
  pairings to a generated ghost id so historical pairings remain structurally valid. For
  PyChess, created events owned by an erased account can be aborted/deleted while started or
  finished history should remain valid and anonymized. Add the identity indexes needed by
  the chosen scrub queries rather than scanning whole collections. Implemented with a keyed,
  retry-safe per-tournament ghost id for preserved history; removal from genuinely unplayed
  rosters; abort of unstarted events owned by the erased account; RR arrangement id re-keying
  (including game/notification links and stale challenge cleanup); loaded-cache scrubbing; and
  indexed lookups for creator/winner/player/pairing/arrangement/link identities.

- [x] **Team-close / disabled-Team lifecycle.** Closing a Team previously made
  `is_enabled_team_member()` false immediately. Swiss already-registered players could mostly
  continue because pairing uses the tournament roster, but an RR became effectively
  unplayable because scheduling and challenge creation/acceptance re-check enabled Team
  membership on every action. PyChess now prevents ordinary creator closure while a
  created/started RR or Swiss exists. The site-admin path used by moderation and account
  disable/erasure explicitly aborts every active fixed-round Team tournament before the Team
  is disabled, with a durable system-chat explanation, so a started RR can never be silently
  stranded by Team closure.

- [x] **Organizer permission lifecycle.** Creation requires the Team tournament permission,
  but subsequent edit/abort/manual-round/RR-management authorization is based primarily on
  the original `createdBy`. Therefore a leader who later loses the Team permission or leaves
  the Team can still remain tournament organizer. Lichess similarly privileges the original
  Swiss creator, so this is not automatically wrong; choose and document the PyChess policy
  before advertising "Team leaders can manage Team tournaments." If current Team permission
  should be required, enforce it consistently across HTTP edit and websocket management.
  PyChess now keeps the original creator as the sole Team organizer but requires that creator
  to remain in an enabled Team with the `tournaments` permission. Losing membership or that
  permission immediately revokes creator edit/manual-round/abort/RR-management controls;
  tournament directors retain their existing lifecycle override. The HTTP edit path, direct
  update helper, websocket handlers, reconnect payload, and client-side controls all use the
  same current-permission decision.

## Swiss hardening

- [x] **Bound Swiss pairing work / participant cap.** PyChess now caps Swiss tournaments at
  64 registered participants server-side. The count deliberately includes withdrawn players,
  because they remain as zeroed TRF rows and still contribute to py4swiss pairing work; an
  existing participant can therefore rejoin at the cap, but join/withdraw churn cannot admit a
  65th historical participant. The existing `scripts/py4swiss_memory_stress.py` harness was
  used to benchmark the same TRF construction/validation plus Dutch pairing path: across 90
  synthetic pairing calls at 64 players / 9 rounds, this Python 3.13 sandbox measured about
  45 ms median, 76 ms p95, and 79 ms maximum per call. A 96-player / 10-round run averaged
  about 112 ms per round. That makes 64 a conservative bound for the single aiohttp process
  without adding `asyncio.to_thread()` complexity yet; revisit offloading if production
  measurements at the cap show materially higher latency.

- [x] **Server-side Swiss round/input limits.** Swiss creation/edit now enforces the
  PyChess-supported 3–15 round range server-side, rejects malformed round counts, and after
  start requires `rounds >= current_round`. Pairing input is also bounded before persistence:
  forbidden pairings allow at most 2,048 non-empty lines (enough to represent all 2,016
  unique player pairs at the 64-player cap), while next-round manual pairings allow at most
  64 non-empty lines. Manual lines must contain exactly two tokens, cannot self-pair, and a
  username may occur only once across the submitted round (case-insensitive, with `username
  1` retaining its manual-bye meaning). This follows Lichess's validation shape while using
  limits that match PyChess's much smaller Swiss field bound.

- [x] **First-round start grace.** PyChess now keeps a Swiss in `T_CREATED` for up to one
  hour after `startsAt` while fewer than two active registrations are present, retrying on the
  normal tournament clock and starting as soon as a second player arrives. The grace deadline
  is derived from the persisted `startsAt`, so restart during the wait needs no extra recovery
  state; after the hour expires the tournament is aborted as before. Pre-start withdrawn
  registrations deliberately do not satisfy the two-player threshold. This follows Lichess's
  one-hour first-round grace while fitting PyChess's existing clock model.

## Round-Robin hardening

- [x] **Do not finish RR while an arrangement game is still running.** At the configured
  deadline PyChess now durably expires every not-yet-started arrangement, clears its live RR
  seek/challenge and scheduling state, and rejects new schedule/challenge/accept requests.
  Already-started arrangement games remain playable while the tournament stays `T_STARTED`;
  their normal game-end path still scores the result, then finalizes the RR once no ongoing
  arrangement game remains. The draining state needs no extra persisted flag: it is derived
  from the durable `startsAt + minutes` deadline plus restored started games/arrangements, and
  restart coverage verifies a deadline-crossing game is restored, scored, and only then causes
  the tournament to finish. Unplayed cells use the durable `expired` arrangement status.

- [ ] **Clear stale RR challenges durably on restart.** RR persists `status=challenged` and
  `inviteId`, but the underlying challenge/seek is in memory and is not restored. On reload,
  `_reconcile_arrangements_from_games()` does not reset such a challenge; the lazy
  `_clear_stale_invite()` only runs when an arrangement is looked up and does not persist the
  repair. This can show an Accept challenge control for a challenge that vanished with the
  previous process. During `load_arrangements()`, detect challenged arrangements whose invite
  is absent, reset them to pending, persist the reset, and broadcast only the repaired state.

- [ ] **Serialize RR arrangement mutations.** Lishogi sequences arrangement mutations per
  tournament. PyChess currently lets websocket requests from the two players interleave.
  Two simultaneous `create_arrangement_challenge()` calls can both pass the "no active
  invite" check, create two seeks, and leave one orphaned while the later write wins.
  Scheduling/update/accept operations should also have deterministic ordering. Add a
  lightweight per-tournament or per-arrangement async lock around state-changing RR
  arrangement operations and keep database writes inside that serialized section.

- [x] **Index RR arrangement lookup.** Startup/reload reads
  `tournament_arrangement.find({"tid": tournament_id})`, and empty-RR cleanup deletes by the
  same field, but startup previously created indexes only for `tournament_player.tid` and
  `tournament_pairing.tid`. Added `tournament_arrangement.tid` plus the user/challenger indexes
  required by account erasure; RR game/seek/notification link indexes were added for arrangement
  re-keying as well.

- [ ] **Validate RR scheduling against the tournament deadline.** The client limits the
  calendar, but before the tournament starts `scheduleMaxDate()` falls back to
  `startsAt + 90 days` instead of the actual `startsAt + tminutes`, and the server accepts an
  arbitrary proposed date. Players can therefore agree to a game after the RR itself is
  scheduled to finish. Derive the real finish date before and after start, use it as the
  client max, and reject materially-past or post-deadline proposals server-side.

- [ ] **Decouple mandatory RR games from ordinary lobby challenge restrictions.** An RR
  arrangement currently goes through generic `create_seek()`, so the normal seek-count limit
  and mutual block checks can prevent two already-registered tournament opponents from
  creating their required game. Decide the policy explicitly. The recommended tournament
  behavior is to keep authentication/team/arrangement checks but bypass restrictions whose
  purpose is unsolicited lobby challenges; otherwise provide an organizer-visible resolution
  for pairings that can never be played.

# High-value parity / organizer features

## Swiss

- [ ] **Scheduled participant reminder.** Lichess sends a "Swiss starting soon" notification
  about ten minutes before eligible Swiss events. PyChess currently has tournament-page
  countdown/browser alerts and Discord notices, but no equivalent participant reminder when
  the player is away from the tournament page. Add a focused notification before a scheduled
  Team Swiss starts; Web Push can be layered on only where the user's notification preference
  and subscription support it.

- [ ] **Additional Swiss entry/chat conditions only if Teams need them.** Lichess Swiss also
  offers titled-only and explicit allow-list entry conditions plus configurable chat scope
  (leaders/members/all/none). PyChess already has Team membership, password, rating, rated
  games, account age, and no-show enforcement, which is sufficient for initial rollout.
  Add allow-list/titled/chat-scope controls only if real Team organizers request them.

## Round-Robin

- [ ] **Organizer annul/replay control.** Lishogi lets the organizer annul a mistaken RR game
  result and replay that arrangement, retaining previous game ids as history. PyChess only
  reopens games that end with `ABORTED`; once a normal result is recorded it is final. Add a
  creator/site-moderator annul action for a still-active RR, reverse the tournament score
  idempotently, reset the arrangement to pending, and retain prior game ids so the original
  game remains auditable instead of disappearing from the arrangement history.

- [ ] **Offline usefulness of RR reminders.** RR appointment confirmations and 24-hour
  reminders currently create PyChess notification-bell entries and live SSE updates. That is
  useful when the site is open but much less useful for a correspondence-style appointment
  days later. After the core RR lifecycle is stable, consider Web Push for agreed-time and
  24-hour reminder notifications, controlled by user notification preferences. Do not make
  push delivery a prerequisite for starting the actual game.

# Final rollout / verification

- [ ] **End-to-end Team staging exercise.** Before enabling creation for Team leaders, run at
  least one real multi-round Swiss and one real multi-day RR with ordinary non-admin accounts.
  Include: Team leader creation, ordinary Team joins, late Swiss join, bye/no-show, manual or
  forbidden Swiss pairing, RR approval, two-sided appointment agreement, challenge/accept,
  aborted RR replay, one Heroku-style restart while active, Team-member removal, and the
  terminal standings/history pages. This catches integration/UX assumptions that unit tests
  cannot reproduce.

- [ ] **Final desktop/mobile comparison.** After the lifecycle fixes above settle the UI,
  compare Swiss against current Lichess and RR against current lishogi at desktop and phone
  widths. Focus on fixed-round controls, long Team/variant names, Swiss standings/player
  sheets, the RR matrix/list fallback, appointment modal, and organizer management controls.
  Do not add tests for CSS-only polish unless a concrete regression needs protection.

- [ ] **Enable for Team leaders.** Keep standalone RR/Swiss restricted to site administration
  / development as appropriate, and expose normal creation through the Team tournament
  permission only after the production-readiness items and normal CI gates are green.

# Intentional PyChess differences / non-goals

- **RR remains an asynchronous arrangement tournament.** Do not refactor it into Swiss/Arena
  round waves. All pairings exist as arrangements and can be played in whatever order the
  two players agree on.
- **An agreed RR time is not an auto-start.** It is an appointment/reminder; players still
  explicitly create and accept the challenge. This matches lishogi and avoids starting games
  against absent users.
- **Keep the 16-player RR cap for now.** Lishogi supports much larger Robins, but RR storage
  and UI are O(n²). Raising the limit has no current product need and would create unnecessary
  load on the small PyChess server.
- **Swiss uses `py4swiss`, not lila's pairing binary/internals.** Match observable Dutch
  pairing semantics and durable tournament behavior, not implementation language/library.
- **PyChess variant breadth is intentional.** Fixed-round tournaments may use normal site
  variants and eligible public catalogued variants; two-board variants remain excluded.
- **Janggi tournament scoring remains PyChess-specific.** Lichess's chess scoring formulas
  are not a reason to remove the established Janggi point model.
- **Unplayed RR pairings may remain visible after finish.** Lishogi removes unfinished Robin
  arrangements when finishing. PyChess can reasonably keep them visible as explicit
  "unplayed" history, provided the deadline/finalization rules are correct and the UI makes
  their status unambiguous.
