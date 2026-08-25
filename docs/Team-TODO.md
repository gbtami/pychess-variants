# Teams roadmap

Teams shipped in PR #2304. This file tracks useful post-merge improvements and design
questions that are not required for the initial Teams release.

## Higher-value follow-ups

- [ ] **Creator/ownership policy.** Revisit the current rule that the original creator can
  never leave and must retain `Admin`. Lichess protects the last Admin instead; PyChess
  should make its ownership-transfer policy explicit before long-lived Teams need to
  change hands.
- [ ] **Team discovery.** Replace the current fixed-size Team directory with search,
  pagination, and useful sorting once Team count warrants it.
- [ ] **Membership notifications.** Add focused notifications where they help users take
  action without making Teams noisy. Highest-value cases are an accepted join request and
  a new join request for leaders who can manage requests; declined requests, kicks, and
  leader promotions can be added if they prove useful.
- [ ] **Member search/filtering.** Add username search on large Team member lists and
  optionally distinguish leaders from ordinary members.

## Optional parity and privacy improvements

- [ ] **Member privacy.** Add a Lichess-style `hideMembers` setting and apply it to Team
  member lists and profile Team affiliations.
- [ ] **Private Team description.** Consider a member-only/private description for
  internal instructions, links, and tournament information.
- [ ] **Team-forum search.** Add access-aware search inside a Team forum. Team forum posts
  should remain excluded from global forum search unless result counts and pagination can
  be made privacy-safe.
- [ ] **Profile Activity integration.** When the broader user profile Activity tab is
  implemented, include appropriate Team activity while preserving Team privacy rules. The
  main-page timeline already supports `team-create` and `team-join` events.

## Intentional non-goals

- **No Team Battles.** PyChess Teams are expected to form around particular chess
  variants, so cross-Team battles would often force members into variants they do not
  want to play. Ordinary Team Arena, Round-Robin, and Swiss tournaments are the intended
  competition model.
- **No hard Team deletion for now.** Closing/reopening preserves historical tournament,
  forum, update, and membership references. Add irreversible deletion only if a concrete
  moderation or legal requirement appears.
