# Simul roadmap

The simultaneous-exhibition feature is implemented behind `SIMULING = DEV` and has not
yet been enabled on the production server. This roadmap tracks the production-readiness
and Lichess-parity work identified in the post-Teams review.

## Already in good shape

- Simuls are always casual and create one normal game per accepted opponent.
- Create/edit/cancel flows, host color, estimated start time, description, host extra
  initial time, and host extra time per accepted player are implemented.
- Minimum/maximum rating, minimum rated games, and account-age entry conditions are
  enforced server-side.
- Candidate/accepted-player management, random candidate acceptance, start flow, live
  mini-boards, results, chat, and host auto-skip between games are implemented.
- Rematches and adding time are disabled for simul games; the round UI already hides
  takebacks.
- `simul-create` and `simul-join` are published to the main timeline.
- Simul/game/chat state is persisted, started simuls survive server restart, finished
  games are recovered, and simul games use the sparse `game.sid` index.
- Two-board variants are intentionally excluded. Public catalogued PyChess variants are
  supported in addition to site variants.

## Production-readiness hardening

- [x] **Authentication and BOT hosting.** Reject anonymous websocket joins and prevent
  BOT accounts from hosting simuls, matching Lichess's authenticated non-BOT flow.
- [x] **Takeback enforcement.** Reject forged server-side takeback requests in simul
  games as well as hiding the UI control.
- [x] **Created-simul lifetime and restart loading.** Persist `hostSeenAt` whenever the
  host opens a created simul. On restart, always restore `T_STARTED` simuls but preload
  `T_CREATED` simuls only when the host was seen within the previous hour. Stale created
  simuls remain in MongoDB and still load on demand from their URL instead of consuming
  startup memory forever.
- [x] **Home-list queries.** Query created, started, and finished simuls independently so
  recent finished records cannot hide a still-created or running simul. Created listings
  use the same recent-host window as restart preloading, finished listings sort by finish
  time, and signed-in participants get a pending/accepted simuls section.
- [x] **Participant/game cap.** Limit one simul to 50 accepted opponents, enforced when
  new applicants enter, when the host accepts a candidate, and again immediately before
  game creation. Lichess uses its global realtime-playing capacity (currently 100); the
  lower PyChess cap is intentionally conservative for the production server.
- [x] **Applicant persistence and explicit withdraw.** Pending and accepted applicants
  remain registered when their last simul-page websocket disconnects, matching Lichess.
  Registration survives navigation/reconnect and is removed only when the player uses the
  explicit Withdraw action or the host rejects/removes them.
- [x] **Account deletion / GDPR.** GDPR erasure now removes unstarted simuls owned by the
  account, removes the account from other created-simul applicant lists, and anonymizes
  host/player references in started or finished simul history. Cached simuls are scrubbed
  too, and simul games persist the non-personal host side so anonymization cannot corrupt
  result/mini-board interpretation.
- [x] **Moderator controls.** Site admins can edit any simul and cancel a created simul
  without impersonating the host, matching Lichess's `ManageSimul` behavior while keeping
  already-started games intact. Simul chats are included in the central admin Public chats
  console and use the existing global timeout action. Hosts do not receive chat moderation
  for the initial production rollout: PyChess currently has only a global `User.silence`
  timeout, so exposing it to hosts would incorrectly affect unrelated chats. Add a dedicated
  room-local timeout first if host chat moderation is revisited.
- [x] **Recovery tests and cleanup.** Simul game creation is idempotent per accepted
  opponent, so restart recovery completes any games missing after an interrupted/partial
  start without duplicating games or applying host extra time twice. Coverage now includes
  partial start recovery, stale-created preload/on-demand behavior, and the host round-page
  game list used for navigation after restart. The temporary nested/per-simul startup timing
  has been removed while retaining the coarse application startup phases.

## High-value Lichess parity

- [x] **Clock choices and defaults.** Match Lichess's 20+60 default and its full simul
  clock menus: 5-180 minute initial times and 0-180 second increments at the same stepped
  choices. The server continues accepting the existing 0-180 ranges; this item aligns the
  normal create/edit form without unnecessarily narrowing server compatibility.
- [x] **Minimum start size.** Require at least two accepted opponents before starting,
  enforced server-side and reflected by the host Start button, matching Lichess.
- [x] **Team membership condition.** Hosts can optionally restrict a simul to members
  of one of their enabled teams, matching Lichess. The selected team is validated on
  create/edit, persisted with the simul, displayed with the other entry conditions,
  and enforced server-side when an applicant joins.
- [x] **Multiple variants.** Hosts can offer up to 20 variants and each applicant chooses
  which offered variant to play, matching Lichess's game semantics. Because PyChess has
  60+ site variants plus a much larger public community catalogue, the create/edit form uses
  a searchable multi-select with removable selections instead of Lichess's fixed checkbox
  grid. Applicant choices are persisted per participant and drive entry checks, restart
  recovery, and actual game creation.
- [ ] **Custom starting position.** Lichess can host a simul from a supplied FEN. Decide
  how this should interact with PyChess variants and custom/catalogued variants before
  implementing it.
- [ ] **Host current-board presence.** Track and expose which game the host is currently
  viewing so spectators can see the active board, as Lichess does.
- [ ] **Hosted-simul history.** Add a paginated "simuls hosted by this user" view and
  profile integration when useful.

## Optional parity / polish

- [ ] Consider Lichess-style featured/featurable simuls for titled or moderator-approved
  hosts if the public list becomes busy.
- [ ] Consider a public simul-list API only if clients or bots have a concrete use for it.
- [ ] Revisit name defaults/limits and title-spoof protection; Lichess pre-fills the
  host's name and allows up to 40 characters.
- [ ] Do a final visual/mobile comparison against Lichess after the behavior and data
  model are settled.

## Intentional PyChess differences

- **No two-board simuls.** Bughouse-style two-board variants do not fit the current simul
  game/host-navigation model and remain excluded.
- **Public catalogued variants are supported.** This is a PyChess extension beyond
  Lichess's built-in variant set and should remain.
- **Minimum rated games is retained.** PyChess already supports this useful extra entry
  condition even though current Lichess simul conditions focus on rating, account age,
  and optional team membership.

## Production switch

Keep `SIMULING = DEV` until the production-readiness items above are resolved and the
normal Python/TypeScript quality gates have passed on the final branch.
