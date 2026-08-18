# Teams TODO

This file tracks the remaining work discovered during the comprehensive review of the
initial PyChess Teams implementation in PR #2304.

## Pre-merge hardening

These items should be completed before merging the first Teams PR.

- [x] **Protect leaders from Kick-only moderators.** A member with the `Kick` permission
  may remove ordinary members, but removing another leader requires `Admin`. The team
  creator remains unkickable. Persist the declined/kicked marker before removing the
  membership so a partial database failure cannot leave a removed user able to rejoin
  immediately.
- [x] **Integrate Teams with account close, ban, and GDPR deletion.** Remove or anonymize
  team memberships, join requests, leader roles, and authored Team data as appropriate;
  keep `memberCount` correct; include Team-owned personal data in export/erasure flows;
  and define what happens when the Team creator account disappears. For v1, disabling or
  banning a creator archives their enabled Teams and removes their membership. A site admin
  may reopen such a Team only after the creator account is enabled again, which restores the
  creator membership/Admin permissions. GDPR-erased creators are anonymized and their Teams
  remain permanently archived.
- [x] **Fix active-Team queries after many archived memberships.** `teams_for_user()` and
  the Team Updates/sidebar/forum-index queries now read all historical memberships before
  filtering to enabled Teams, so 50+ closed memberships cannot hide a current Team.
- [x] **Rate-limit RR/Swiss creation.** Team membership must not turn fixed-round
  tournaments into an unbounded tournament/database spam path. Team Round-Robin and Swiss
  creation is limited to five tournaments per user in a rolling 24-hour window; failed
  creations release their quota claim, and tournament directors remain exempt.
- [x] **Make enabled-Team membership an invariant of adding members.** `_add_member()`
  should itself refuse closed Teams so a concurrent close/request-accept race cannot add
  a member after closure.
- [ ] **Run the full quality gates after the hardening fixes.** Ruff format/check, Pyright,
  Python tests, TypeScript typecheck/tests, and CodeQL should all be green before merge.

## Post-merge improvements

These are useful follow-ups but are not required for the initial Teams release.

- [ ] **Member privacy.** Add a Lichess-style `hideMembers` setting and apply it to Team
  member lists and profile Team affiliations.
- [ ] **Private Team description.** Consider a member-only/private description for
  internal instructions and links.
- [ ] **Team discovery.** Replace the current fixed-size Team directory with search,
  pagination, and useful sorting once Team count warrants it.
- [ ] **Member search/filtering.** Add username search on large Team member lists and
  optionally distinguish leaders from ordinary members.
- [ ] **Membership notifications.** Notify users when a join request is accepted/declined,
  when they are kicked, and when they are promoted to leader; notify request managers of
  new requests without making Teams noisy.
- [ ] **Team-forum search.** Add access-aware search inside a Team forum. Team forum posts
  should remain excluded from global forum search unless result counts/pagination can be
  made privacy-safe.
- [ ] **Creator/ownership policy.** Revisit the current rule that the original creator can
  never leave and must retain `Admin`. Lichess protects the last Admin instead; PyChess
  should make its chosen ownership-transfer policy explicit.
- [ ] **Moderation permission wording.** Change “Moderate team forums and chats” to match
  the functionality actually present unless Team chat is intentionally added later.
- [ ] **Activity integration.** When the broader user Activity tab is implemented, decide
  which Team events belong there and preserve Team privacy rules.

## Intentional non-goals

- **No Team Battles.** PyChess Teams are expected to form around particular chess
  variants, so cross-Team battles would often force members into variants they do not
  want to play. Ordinary Team Arena, Round-Robin, and Swiss tournaments are the intended
  competition model.
- **No hard Team deletion for now.** Closing/reopening preserves historical tournament,
  forum, update, and membership references. Add irreversible deletion only if a concrete
  moderation or legal requirement appears.
