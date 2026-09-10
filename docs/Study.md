# Study

Study adds persistent chapters, annotations, sharing, and collaboration to PyChess's
single-board analysis. It reuses the ordinary analysis board, move tree, navigation,
and engine tools through an optional analysis extension.

This is the implementation reference and remaining-feature inventory, consolidated on
2026-09-10 against PyChess `ad17d527c`. It replaces the phased roadmap and repeated
review reports. Their detailed plans, reproductions, and findings remain in Git history.
Update this document when behavior changes; possible future features below are not
commitments or a release schedule.

## Implemented behavior

### Studies and chapters

- Create a Study or chapter from a variant's start position, a validated FEN, or a
  saved PyChess game.
- Add an existing local analysis tree, including variations and annotations, to a new
  Study or an existing owned/contributed Study. Preserve orientation and relevant
  game metadata and PGN tags.
- Rename/delete Studies; create, rename, and delete chapters; edit chapter orientation
  and description pinning. At least one chapter must remain in a Study.
- Switch chapters in place while retaining the analysis shell and Study socket,
  updating the URL and remembering local navigation paths.
- Persist variations, promotion to mainline, forced variations, and branch deletion.
- Store catalogued/custom variant rules with the chapter so later catalogue changes
  do not change the saved rules.

Chapters are single-board only. Raw PGN paste/upload is still unavailable; the import
core and its remaining integration are described below.

### Annotations and analysis

- Root and move comments with stable IDs and server-authoritative authorship;
  autosaving comment editors and comments displayed in the move tree.
- Root and move arrows/circles and NAGs, including a picker for the 24 named lichess
  glyphs. Comments, glyphs, PGN tags, descriptions, and sharing have dedicated tools.
- Chapter-wide Clear annotations and Clear variations actions.
- Local engine analysis, subject to the viewer's computer-analysis permission.
- Contributor requests for Fishnet analysis of a chapter's preferred mainline, with
  at least five moves and a five-minute repeat guard.
- Persisted partial/completed server evaluations, live progress, the shared analysis
  chart, generated mistake glyphs/advice comments, and best-line variations. Existing
  human comments and variations are preserved/reused.

Changing the analyzed mainline invalidates stale server analysis and cancels queued
work. Fishnet jobs remain in memory: after a server restart, saved partial results
remain visible, but unfinished work is no longer pending and can be requested again
after the cooldown. Historical custom-variant analysis uses the saved rules snapshot
in its worker payload.

### Visibility, permissions, and collaboration

| Visibility | Who can view | Discovery |
| --- | --- | --- |
| Private | Owner and explicit read/write members | Accessible personal/member lists and searches |
| Unlisted | Anyone with the link | Hidden from public discovery; accessible personal/member lists and favorites can include it |
| Public | Anyone | Public lists, search, topics, and owner/profile listings |

The owner administers Study settings and membership. Write members can persist tree
and annotation edits and manage chapters. Read members can view private Studies but
cannot persist edits. Owners can add members, change roles, and remove members;
non-owner members can leave.

Computer analysis, cloning, and share/export have audience settings: Nobody, Owner,
Contributor, Member, or Everyone. Read access is still required. Membership and
settings changes update access/capabilities in connected clients. Public and unlisted
chapters can be embedded; embedding follows visibility independently of share/export
permissions. Cloning creates a private copy for a permitted signed-in viewer.

Realtime collaboration broadcasts accepted edits, annotations, chapter lifecycle
changes, and shared navigation. Two independent controls govern participation:

- **REC** records a contributor's edits. With REC off, analysis changes stay local.
  Changing REC reloads the authoritative chapter so experiments do not become saved
  edits accidentally. The preference is stored per Study in the browser.
- **SYNC** follows the shared chapter/path. With SYNC off, viewers browse independently
  and see a behind indicator when the shared position changes. Rejoining SYNC reloads
  the shared position. Contributors can publish shared navigation; readers can follow.

### Discovery and sharing

Study lists include public Studies, owned Studies, memberships, owned public/private
Studies, favorites, and public Studies by owner. The membership list also includes
read-only members. Lists support recently updated, newest, oldest, and alphabetical
ordering. Profiles expose a public Study count/link.

Search uses a bounded denormalized prefix index over Study name/owner/topics and
chapter names, variants, descriptions, and PGN tag names/values. It supports
`owner:<username>` and `member:<username>` filters and respects visibility. This finds
Studies using chapter content; a chapter-local search/navigation tool is not implemented.

Likes update live, and new likes of public Studies appear in followers' timelines.
New Studies start with the owner's like. Contributors can edit up to 30 discovery
topics. Topic pages show public popular topics and personal shortcuts derived from
owned/member Studies. Share tools provide Study/chapter links, chapter embeds, and
chapter/whole-Study PGN downloads.

## PGN and interchange

### Export

[studyPgn.ts](../client/study/studyPgn.ts) renders PGN in the browser. Chapter export
uses the current local analysis tree. Whole-Study export fetches other persisted
chapters sequentially through permission-checked `export-data` endpoints and renders
them as multiple games. The server does not generate PGN or instantiate an engine
for export.

Exports preserve variations, comments, NAGs, a valid saved result, variant/FEN setup,
saved clocks, and evaluations. Supported annotation conventions include `$N`,
`[%csl ...]`, `[%cal ...]`, `[%clk ...]`, and `[%eval ...]`.

PyChess also writes ignorable extensions for data ordinary PGN cannot fully express:

| Extension | Preserved data |
| --- | --- |
| `PyChessVariant` | Exact PyChess variant key |
| `PyChessChess960` | Whether the chapter uses the 960 form |
| `PyChessVariantIniEncoding=base64`, `PyChessVariantIni` | Exact UTF-8 custom-rule snapshot |
| `PyChessChapterDescriptionEncoding=base64`, `PyChessChapterDescription` | Exact UTF-8 chapter description |
| `[%pynag ...]` | Root-position NAGs |
| `[%pyclocks whiteMs,blackMs]` | Both clock values, including root clocks and sub-second precision |

### Import: core implemented, raw-text workflow missing

[studyPgnImport.ts](../client/study/studyPgnImport.ts) defines a parser-neutral recursive
PGN contract and converts parsed games into Study trees. It preserves variations,
comments, NAGs, shapes, clocks, evaluations, and the supported PyChess extensions.
Every branch is replayed in the browser and validated again server-side. The import
endpoint accepts normalized chapter data, validates the batch before insertion, and
enforces remaining chapter capacity.

There is currently no complete raw PGN parser connected to this contract and no
Study paste/upload UI. The existing lightweight Paste reader exposes headers and
mainline only. Connecting it as a full Study importer would discard variations and
annotations. Completing this workflow requires a parser with recursive variations,
comments, NAGs, and multiple-game support, followed by the UI integration.

## Implementation and source map

| Area | Main sources |
| --- | --- |
| Shared analysis host, tree, context, extension | [analysisCtrl.ts](../client/analysis/analysisCtrl.ts), [analysisTreeCtrl.ts](../client/analysis/analysisTreeCtrl.ts), [analysisContext.ts](../client/analysis/analysisContext.ts), [analysisExtension.ts](../client/analysis/analysisExtension.ts) |
| Study page, tools, chapter navigation | [studyView.ts](../client/study/studyView.ts), [chapterNavigation.ts](../client/study/chapterNavigation.ts), [studyChapterForm.ts](../client/study/studyChapterForm.ts) |
| Lists and Add to Study | [studyIndex.ts](../client/study/studyIndex.ts), [addToStudy.ts](../client/study/addToStudy.ts) |
| Client persistence adapter and synchronization | [studyTree.ts](../client/study/studyTree.ts), [studySync.ts](../client/study/studySync.ts) |
| HTTP routes and authorization | [routes.py](../server/routes.py), [views/study.py](../server/views/study.py), [permissions.py](../server/study/permissions.py) |
| Models, storage, tree validation, mutations | [models.py](../server/study/models.py), [storage.py](../server/study/storage.py), [tree.py](../server/study/tree.py), [builder.py](../server/study/builder.py), [mutations.py](../server/study/mutations.py) |
| Room protocol, sequencing, snapshot checks | [ws.py](../server/study/ws.py), [sequencer.py](../server/study/sequencer.py), [snapshot.py](../server/study/snapshot.py) |
| Custom rules, server analysis, account erasure | [variant.py](../server/study/variant.py), [analysis.py](../server/study/analysis.py), [gdpr.py](../server/study/gdpr.py) |

The analysis-core extraction is implemented: Study composes the shared host through
`AnalysisExtension`. Compatibility mode properties and puzzle inheritance still exist;
converting every analysis consumer to composition is not a prerequisite for Study.

### Persistence and synchronization

MongoDB stores lightweight Study metadata in `study` and each chapter separately in
`study_chapter`. Study metadata includes members, visibility/settings, shared position,
likes, topics, and revision. Chapters contain setup, source, saved rules, tree,
annotations, tags/description, server evaluation, and their own revision. Pages load
one full chapter plus lightweight chapter-list data; Studies are not preloaded at
application startup.

Persisted tree data is separate from runtime analysis nodes. Nodes have opaque
10-character IDs, parent links, and sibling order, independent of variant move
encoding. Mutations send small operations with `clientOpId` and revision information
through `/wsstudy/{studyId}`. The server validates permissions, paths, moves, and
limits, persists the result, and broadcasts the canonical operation.

A lazy per-Study `asyncio.Lock` serializes mutations, chapter lifecycle changes,
membership/privacy changes, room joins, deletion, and related analysis work. The lock
registry tracks queued users and cleans up when no room or operation needs it.
This sequencing is process-local; distributing Study writes across server processes
would require an explicit coordination design.

Clients apply optimistic edits and reconcile remote revisions. Concurrent identical
moves are deduplicated; the losing local ID and queued descendant paths are remapped
to the canonical server ID. Stale operations can be accepted after validation against
the latest tree. Missing paths, revision gaps, or failed reconciliation trigger an
authoritative reload. Initial connection and chapter navigation verify both chapter
content and Study-wide snapshot tokens against the subscribed room.

### Resource limits and lifecycle

Deployment defaults in [constants.py](../server/study/constants.py) are 64 chapters,
3,000 nodes per chapter, 30 members, and 8 MiB encoded chapter size. The chapter-size
setting is capped at 15 MiB, below MongoDB's 16 MiB limit. Annotations and search
metadata have additional bounded counts/lengths.

Untrusted embedded rules and their imported positions/trees are validated outside
the serving process. Historical rules admitted to the main native engine registry
have a separate configurable cap of 256 snapshots per process. Native registrations
cannot be unloaded; the budget resets on restart. This bound is a resource policy,
not a production memory measurement.

Whole-Study deletion is serialized, deletes chapter data, broadcasts deletion, and
closes the room. Account erasure deletes private/unlisted owned Studies, retains
public owned Studies with ownership anonymized to `<erased>`, removes memberships
and likes, and anonymizes authored comments while retaining their text. The live
account is disabled before cleanup; affected chapter comments are rescanned under
the Study lock to cover writes that completed during erasure discovery.

## Relationship to lichess

The design and original reviews used lila, most recently local snapshot `39deb036f3`,
as their comparison baseline. This is a comparison with that inspected implementation,
not a claim of parity with today's lichess deployment.

The shared principles are an analysis host extended by Study, separate Study/chapter
documents, incremental edits, serialized writes, independent recording/following,
membership and feature permissions, and reload-based recovery from inconsistent state.

| Area | PyChess adaptation or difference |
| --- | --- |
| Runtime and sequencing | Python/aiohttp with process-local asyncio locks instead of lila's Scala sequencing infrastructure |
| Tree identity | Opaque IDs accommodate Fairy-Stockfish move encodings instead of lichess's compact move-derived IDs; duplicate moves require reconciliation |
| Variant persistence | Immutable custom-rule snapshots preserve historical catalogued/user-defined variants |
| PGN | Browser-generated downloads and normalized import DTOs; raw PGN import UI and lichess-style server PGN/API routes are absent |
| Discovery | Bounded prefix search; personal topic shortcuts derived from memberships/ownership instead of a separate topic-preference collection |
| Explorer | Permission is stored/evaluated, but PyChess has no opening explorer UI and hides its setting |
| Product scope | Ordinary collaborative analysis is implemented; lesson modes, relay, and other optional features below remain absent |

## Remaining features and decisions

These are known gaps or possible extensions. Their presence here does not imply that
PyChess will implement them all or reproduce every lichess workflow.

| Feature | Current gap / next decision |
| --- | --- |
| Raw PGN import | Complete parser adapter and paste/upload UI; the normalization/validation core already exists |
| Chapter reordering | Persisted order exists, but there is no user-facing reorder action or route |
| Chapter search | Study discovery searches chapter metadata; chapter-local results/navigation remain absent |
| Board previews / multiboard overview | Lightweight chapter metadata exists; visual chapter-board overview remains absent |
| Collaborator presence/activity | Rooms track sockets for delivery and access control; no presence/activity UI |
| Practice with computer | No practice chapter mode |
| Concealment and interactive lessons/gamebook | No hidden-next-move behavior, lesson progression, hints, or deviation messages |
| Opening explorer | Requires an explorer feature for PyChess before Study permission integration becomes useful |
| Study chat | No Study chat channel or chat permission UI |
| GIF export and staff picks | Optional sharing/curation additions |
| Full public API parity | Existing internal HTTP/WS operations do not provide the complete lichess Study API |
| Broadcast/relay | A separate substantial product decision, not a dependency of ordinary Study |
| Two-board chapters | Requires persisted two-board state and move sequencing plus integration with the separate two-board analysis controller |

Remaining engineering/rollout follow-up should be tracked separately from optional
product scope:

- Review Study-specific reporting/moderation needs for public comments and descriptions.
  Account-erasure integration is implemented; a dedicated Study reporting workflow is absent.
- Reconcile the browser scenarios with the current creation dialogs and rerun them
  before relying on their results. The historical review reported two stale scenarios;
  the later source reviews did not rerun the browser suite.
- Measure production resource use and verify visual behavior across themes, viewports,
  and representative variant families when assessing rollout readiness. The source
  review did not establish those results.

## Review status and verification

The final follow-up reviewed fixes through `7a576880e` and assessed all five findings
from its preceding review as addressed: imported evaluation loss, description revision
broadcasts, Study-wide snapshot reconciliation, whole-Study deletion races, and comment
erasure races. Earlier fixes covered atomic websocket authorization, chapter sequencing,
native snapshot admission, duplicate-move reconciliation, chapter broadcasts, PGN
result/clock preservation, and membership capability refresh.

Those reports are historical evidence. The last follow-up was source-only and found
no additional actionable defect within its scope; it did not certify all runtime,
browser, engine, or production behavior. No previously reported defect is carried
forward here as still open without new evidence.

Existing tests live in `tests/test_study_*.py`, `tests/study*.test.ts`, and
`tests/addToStudy.test.ts`. They cover models/storage, permissions, import/export,
tree mutations, synchronization/navigation, Fishnet integration, account erasure,
and browser workflows. Select checks for future changes using
[AGENTS.md](../AGENTS.md) and the
[pychess-testing skill](../.agents/skills/pychess-testing/SKILL.md).

This consolidation checked source and documentation consistency only. It introduced
no application changes and did not rerun application tests or browser suites.
