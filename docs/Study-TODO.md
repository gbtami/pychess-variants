# Study roadmap

PyChess Study should be implemented as a persistence/collaboration layer on top of the
existing analysis feature, **not** as a second analysis implementation.

That is the most important architectural lesson from Lichess. Lichess has one generic
analysis controller/tree/board/engine/navigation stack. A Study optionally plugs a
`StudyCtrl` into that stack and adds persistence, chapters, annotations, permissions,
sharing, and synchronized collaboration. The Study code does not own a separate chess
analysis engine.

For PyChess this implies a prerequisite refactor: make the current single-board analysis
controller reusable enough that post-game analysis, the standalone analysis board,
embeds, puzzles, and later Studies can share the same analysis core without accumulating
more `embed` / `puzzle` / `ongoing` / `isAnalysisBoard` conditionals.

The work should be staged so every milestone is independently useful. In particular,
**do not make realtime collaboration, public discovery, sharing, or advanced lesson
modes prerequisites for the first usable Study**.

## Reference snapshots used for this audit

- PyChess: `pychess-variants-master(20260904-101322).zip`
- Lichess: `lila-master(9).zip`
- Repository instructions: root `AGENTS.md` and `.agents/skills/lichess/SKILL.md`

The Lichess source snapshot is the primary reference for Study behavior and architecture.
The recommendations below intentionally adapt the design to PyChess's aiohttp + MongoDB
+ TypeScript/Snabbdom + Fairy-Stockfish stack rather than attempting a literal port of
Scala/Lila internals.

# Audit conclusion

The proposed feature is practical, but the safest implementation order is:

1. **Refactor the existing analysis core without changing behavior.**
2. **Add owner-only persisted Studies with chapters.**
3. **Add annotations and robust import/export.**
4. **Add read-only sharing/visibility.**
5. **Add collaborators and realtime synchronization.**
6. Add optional parity features only after the core has proven stable.

The highest-value Lichess ideas to reuse are:

- one generic analysis controller with optional feature/controller injection;
- one reusable tree implementation used by ordinary analysis and Study;
- incremental tree operations (`addNode`, `deleteNode`, `promote`, annotations, etc.)
  rather than repeatedly saving a whole PGN;
- Study metadata and chapters stored separately;
- per-Study serialization of mutations;
- separate concepts for **recording edits** and **following the shared position**;
- clients applying small remote operations and falling back to a chapter reload when
  their local tree no longer matches the server;
- lazy/on-demand loading rather than preloading Studies at application startup.

PyChess already has two useful pieces pointing in the same direction:

- `client/analysis/analysisTree.ts` is now a real reusable path-based tree rather than a
  purely linear movelist;
- two-board analysis has already extracted its tree/navigation state into
  `client/two-board/analysis/analysisTree.ts` (`AnalysisTreeController`), while the
  single-board `AnalysisController` still carries equivalent responsibilities itself.

That makes the analysis refactor a natural first task rather than unrelated cleanup.

# What Lichess Study actually contains

A Lichess Study is substantially more than "a saved analysis". The core object is a
container of chapters plus metadata and permissions. A chapter contains an analysis
root/tree plus its setup and annotations.

The current Lichess implementation supports, among other things:

- up to **64 chapters** per Study;
- up to **3,000 tree nodes** per chapter;
- creation from scratch, a game, a FEN, PGN, or another Study;
- multiple PGNs becoming multiple chapters;
- chapter naming, ordering, orientation, descriptions, and PGN tags;
- normal, practice, conceal, and gamebook/interactive-lesson chapter modes;
- variations, variation promotion, forced variations, comments, glyphs/NAGs, shapes,
  and clocks;
- local and server engine analysis;
- opening explorer controls;
- public, unlisted, and private visibility;
- owner/contributor/member roles, with up to 30 members in the current implementation;
- per-feature permissions for computer analysis, explorer, cloning, sharing, and chat;
- realtime multi-user editing;
- synchronized chapter/path following ("sticky" mode) that is independent from whether
  a contributor is currently recording edits;
- chapter and Study PGN export;
- cloning;
- embeddable chapters;
- likes, topics, search, chapter search, chapter previews and multiboard view;
- server analysis requests;
- relay/broadcast functionality and several broadcast-specific views.

PyChess does not need all of this in the first implementation. The important part is to
choose a foundation that does not require throwing away the MVP when collaboration is
added later.

# Lichess Study source and route map

The following files are the most useful reference points when implementing each PyChess
slice. They should be consulted again at the corresponding phase instead of trying to
port the whole Study module at once.

## Server/domain source map

| Lichess source | Responsibility | PyChess analogue/destination |
| --- | --- | --- |
| `conf/routes` Study section | Browser/API Study routes | `server/routes.py` |
| `app/controllers/Study.scala` | HTTP authorization, page creation/import/export/clone | `server/views/study.py` plus Study API/service modules |
| `modules/study/src/main/Study.scala` | Study metadata, visibility/member helpers, 64-chapter cap | Study domain/model |
| `modules/study/src/main/Chapter.scala` | Chapter setup/tree/tags/modes, 3,000-node cap | Chapter domain/model |
| `modules/study/src/main/StudyRepo.scala` | Study Mongo reads/writes/projections | Study repository/helpers |
| `modules/study/src/main/ChapterRepo.scala` | Chapter/tree partial updates | Chapter repository/helpers |
| `modules/study/src/main/StudyApi.scala` | Authorized Study mutations and broadcasts | Study service |
| `modules/study/src/main/StudySocket.scala` | Incremental websocket protocol | `server/study/ws.py` or equivalent |
| `modules/study/src/main/StudySequencer.scala` | Ordered mutations per Study | keyed `asyncio.Lock` registry |
| `modules/study/src/main/StudyForm.scala` | Study config/import forms | server validation + TS forms |
| `modules/study/src/main/ChapterMaker.scala` | Build chapters from game/FEN/PGN | chapter creation/import service |
| `modules/study/src/main/PgnDump.scala` | Chapter/Study PGN export | Study PGN exporter |
| `modules/study/src/main/JsonView.scala` | Permission-aware Study JSON | Study page/API serializer |
| `modules/study/src/main/Settings.scala` | Feature permission selections | later Study settings model |

## Client source map

| Lichess source | Responsibility | PyChess lesson |
| --- | --- | --- |
| `ui/analyse/src/start.ts` | Generic analysis bootstrap with optional Study dependency | one reusable analysis bootstrap |
| `ui/analyse/src/analyse.user.ts` | Ordinary analysis entry | current analysis entry |
| `ui/analyse/src/study/analyse.study.ts` | Study-specific entry, socket + same analysis start | Study entry supplies extension/deps |
| `ui/analyse/src/study/studyDeps.ts` | Lazy Study dependency boundary | keep Study bundle-specific code out of generic analysis where possible |
| `ui/analyse/src/ctrl.ts` | Generic analysis host | refactored `AnalysisController` |
| `ui/analyse/src/socket.ts` | Generic socket + Study delegation | extension socket hook |
| `ui/analyse/src/view/main.ts` | Dispatch generic vs Study/relay view | generic analysis shell + Study composition |
| `ui/lib/src/tree/*` | Shared tree/path/ops/wrapper | `client/analysis/analysisTree.ts` + extracted tree controller |
| `ui/analyse/src/study/studyCtrl.ts` | Study orchestration, sticky/write, socket handlers | future `StudyController` |
| `ui/analyse/src/study/studyChapters.ts` | Chapter list/switching/local paths | chapter controller |
| `ui/analyse/src/study/studyMembers.ts` | roles/presence/member UI | collaboration phase |
| `ui/analyse/src/study/studyComments.ts` / `commentForm.ts` | node comments | annotation phase |
| `ui/analyse/src/study/studyGlyph.ts` | NAG/glyph editing | annotation phase |
| `ui/analyse/src/study/studyTags.ts` | PGN tags | annotation/import phase |
| `ui/analyse/src/study/studyShare.ts` | export/embed/share UI | sharing phase |
| `ui/analyse/src/study/practice/*` | practice mode | optional later phase |
| `ui/analyse/src/study/gamebook/*` | interactive lesson mode | optional later phase |
| `ui/analyse/src/study/relay/*` | broadcast/relay product | explicit non-goal initially |

## Lichess browser route inventory

The current Lichess route set demonstrates the main user scenarios. PyChess should not
implement all of these initially, but the grouping is useful when checking eventual
parity.

### Discovery and personal lists

```text
GET /study
GET /study/staff-picks
GET /study/all/:order
GET /study/mine/:order
GET /study/member/:order
GET /study/public/:order
GET /study/private/:order
GET /study/likes/:order
GET /study/by/:username[/:order]
GET /study/search
GET /study/topic[/...]
```

### Open/create/chapter lifecycle

```text
GET  /study/:id
POST /study
POST /study/as                 create new Study or add to an existing Study
GET  /study/:id/:chapterId
GET  /study/:id/:chapterId/config
POST /study/:id/delete
POST /study/:id/import-pgn
```

### Sharing/export/clone/embed

```text
GET  /study/:id.pgn
GET  /study/:id/:chapterId.pgn
GET  /study/:id/:chapterId.gif
GET  /study/:id/clone
POST /study/:id/cloneApply
GET  /study/embed/:id/:chapterId
```

Lichess also exposes Study API routes for create, export/listing, chapter delete,
multi-PGN import, tag update and move replacement. Those should be viewed as later public
API parity rather than MVP requirements for PyChess.

## Lichess creation/use scenarios worth preserving conceptually

The Lichess controller/form flow supports all of these without creating a second
analysis implementation:

- create a new Study from scratch;
- create from a game ID/URL;
- create from FEN;
- create from pasted PGN;
- choose New Study or add the material as a chapter of a recent owned/contributed Study;
- import multiple PGNs and turn them into multiple chapters, capped by the Study chapter
  limit;
- switch chapters while either following the shared Study state or browsing locally;
- make local analysis moves immediately, then persist/broadcast them if recording is on;
- add/edit/delete/reorder chapters;
- annotate arbitrary tree nodes;
- export/share/clone subject to Study settings;
- invite collaborators with read/write roles and edit concurrently;
- recover from a stale local tree by reloading the authoritative chapter.

This scenario inventory is more important to preserve than exact Lichess URL names or
UI placement.

# How Lichess reuses analysis

## One generic `AnalyseCtrl`

Lichess's `ui/analyse/src/ctrl.ts` owns the ordinary analysis machinery: the analysis
position/tree, navigation, board state, local evaluation, explorer, autoplay, forks,
promotion, settings, and other generic analysis behavior.

It has an optional `study?: StudyCtrl`. The controller is constructed with a Study
constructor only when the Study entry point is used. Ordinary analysis never loads or
instantiates the Study controller.

The important shape is conceptually:

```text
analysis entry point
    -> AnalyseCtrl
       -> generic tree
       -> board / navigation / ceval / explorer / settings / ...
       -> optional StudyCtrl
```

Study is therefore an extension of analysis, not a sibling copy of analysis.

## Dependency injection at the entry point

`ui/analyse/src/start.ts` accepts optional Study dependencies. Ordinary analysis invokes
the same start function without them. `ui/analyse/src/study/analyse.study.ts` supplies
`studyDeps`, establishes the Study websocket, and starts the same analysis application.

`studyDeps.ts` is deliberately the boundary that pulls Study-specific code into the
bundle. This keeps the ordinary analysis bundle and controller independent from most of
the large Study feature surface.

PyChess should copy this *idea*, not necessarily the exact module names: Study should be
an optional dependency/controller attached to an analysis host.

## One generic tree library

Lichess's `ui/lib/src/tree/` contains generic tree types, path handling, tree operations,
and a wrapper. Analysis and Study operate on the same tree.

The wrapper exposes small operations such as:

- add node(s);
- delete a node;
- promote a variation;
- force/unforce a variation;
- set shapes;
- set/delete comments;
- set glyphs;
- navigate/query paths;
- merge a reloaded tree.

Study persistence is built around these same operations.

Lichess paths are compact concatenations of two-character node IDs. Those IDs are
computed from chess UCI moves. That is a clever chess-specific optimization, but it
should **not** be copied literally to PyChess: Fairy-Stockfish variants have a wider set
of move encodings, including drops, multi-leg moves, special board semantics, and
potential future formats.

## Study owns Study behavior only

`ui/analyse/src/study/studyCtrl.ts` owns Study-specific state and subcontrollers:

- chapter list/current chapter;
- members and roles;
- Study configuration;
- comments, glyphs, tags, descriptions and topics;
- sharing;
- Study search/multiboard;
- server evaluation;
- optional practice/gamebook/relay logic;
- Study websocket events.

Generic move/navigation operations remain in `AnalyseCtrl`. The generic controller calls
optional Study hooks when an operation needs Study persistence or Study-specific policy.
Examples include move/drop persistence, deleting/promoting a node, path changes,
permissions, and Study-specific restrictions.

This is the model PyChess should target.

## Generic socket with Study delegation

Lichess's generic analysis socket handles generic analysis events and delegates
unhandled Study messages to `ctrl.study?.socketHandler(...)`.

When a move/drop is made, the generic analysis code performs the normal local analysis
operation immediately. If Study is active, the socket adds Study-specific context such
as chapter/path and sends the corresponding incremental operation.

The result is optimistic and responsive: analysis does not become a server-roundtrip UI
just because it is persisted.

## Separate "write" and "sticky" modes

This is an especially useful Lichess design that should be retained.

Study has two independent user concepts:

- **write/record**: whether this contributor's changes are persisted to the Study;
- **sticky/sync**: whether this viewer follows the Study's shared current chapter/path.

A collaborator can stop following the presenter and inspect another branch locally
without disconnecting from the Study. Likewise a contributor can browse without
accidentally recording every experimental move.

This distinction matters much more once collaboration exists. Do not reduce it to one
"editing" boolean.

# How Lichess persists and synchronizes Studies

## Study and Chapter are separate Mongo documents

The Study document contains lightweight Study-wide data: ID, name, members, owner,
visibility/settings, shared current chapter/path, origin, likes, descriptions/topics,
and timestamps.

Each chapter is a separate document containing chapter setup, its analysis root/tree,
tags, ordering, owner, optional mode flags/description, and derived preview state.

This separation is important for PyChess as well:

- a 64-chapter Study should not become one giant MongoDB document;
- loading a Study page normally needs one chapter plus chapter previews, not every full
  chapter tree;
- one chapter mutation should not rewrite the metadata and every other chapter;
- MongoDB's document-size limit remains easier to control.

## Incremental mutation protocol

Lichess does not upload the complete PGN/tree after every edit. It sends operations such
as:

- `anaMove` / `anaDrop`;
- `deleteNode`;
- `promote`;
- `forceVariation`;
- `shapes`;
- `setComment` / `deleteComment`;
- `toggleGlyph`;
- `setPath` / `setChapter`;
- add/edit/delete/sort chapter;
- set tags/descriptions/topics;
- member and Study configuration changes.

The server validates and persists the affected state and broadcasts an equivalent event
to connected clients.

This is a much better basis for PyChess collaboration than "save current PGN" because it
naturally describes what changed and keeps websocket payloads small.

## Serialized writes per Study

Lichess runs Study mutations through a per-Study asynchronous sequencer. This prevents
two collaborators from concurrently rewriting the same Study/chapter state in an
undefined order.

For PyChess the equivalent should be much simpler: an `asyncio.Lock` keyed by Study ID is
sufficient initially. All mutations for one Study execute under that lock; different
Studies remain independent.

Given the production server constraints, the lock registry and active socket rooms should
be lazy and evicted/removed when unused. **Studies should never be globally preloaded on
startup.** MongoDB remains the source of truth, with only active Study state cached if a
later performance need justifies it.

## Desync fallback

Lichess applies remote operations only when the referenced chapter/path/node exists in
the local tree. If an operation cannot be reconciled, the client reloads the authoritative
chapter instead of trying increasingly complicated conflict repair.

PyChess should use the same philosophy. A lightweight chapter revision number can make
this even clearer:

1. server serializes a mutation;
2. validates it and increments `chapterRevision`;
3. persists it;
4. broadcasts `{ operation, revision }`;
5. client applies the next expected revision;
6. if a revision is skipped or the referenced node/path is missing, reload the chapter.

Realtime collaboration does not require a general CRDT for this use case.

# Current PyChess analysis architecture

## Current consumers

The single-board `AnalysisController` already serves several distinct modes:

| Use case | Current entry/route | Important differences |
| --- | --- | --- |
| Post-game / replay analysis | finished game with analysis view / `?ply=` | game metadata, charts, crosstable, persisted game mainline |
| Standalone analysis board | `/analysis/{variant}` and FEN form | no saved game, fully local tree |
| Correspondence analysis | `/corranalysis/{gameId}` | game-derived analysis with correspondence semantics |
| Embed | `/embed/{gameId}` | reduced UI, read-oriented presentation |
| Puzzle | `/puzzle...` | `PuzzleController extends AnalysisController`, solution/rating workflow |

Two-board analysis is a separate client stack under `client/two-board/analysis/`, but it
already reuses `client/analysis/analysisTree.ts` for the underlying tree structure.

## What is already good

`client/analysis/analysisTree.ts` now provides a genuine reusable tree with:

- stable path lookup for the lifetime of the tree;
- mainline and variation children;
- navigation helpers;
- variation promotion and forced variation support;
- collapsed branches;
- PGN/tree rendering helpers.

`client/movelist.ts` also already avoids requiring a concrete `AnalysisController` for
all tree operations and instead consumes optional tree capabilities in several places.
That is a useful direction for the rest of the refactor.

Two-board analysis has gone one step further: its `AnalysisTreeController` owns the tree,
path/navigation/context-menu/collapse state around the shared functional tree.
Single-board analysis still keeps those responsibilities directly inside the large
`AnalysisController`.

## Main problem before Study

The single-board controller is currently responsible for too many layers at once:

- page/mode detection;
- generic board interaction;
- the analysis tree and current path;
- movelist tree UI state;
- Fairy-Stockfish browser engine lifecycle;
- charts and FEN/PGN panels;
- post-game-specific websocket behavior;
- embed differences;
- puzzle compatibility;
- standalone-analysis behavior.

The booleans `embed`, `puzzle`, `ongoing`, and `isAnalysisBoard` are then combined in
many conditionals. Adding `study` to those combinations would work initially but would
make every later Study feature harder and riskier.

The goal is **not** to replace `AnalysisController` with an elaborate framework. The goal
is to move generic reusable responsibilities below it and make page-specific behavior an
optional extension, similar to Lichess.

# Proposed PyChess analysis target architecture

## 1. Extract a single-board `AnalysisTreeController`

This is the safest first refactor because PyChess already has a working two-board
example.

The extracted controller should own, as appropriate:

- `AnalysisTree` instance;
- current `path`;
- fork index / branch navigation;
- context-menu state;
- collapse state and local-storage persistence;
- add/select/delete/promote/force-variation operations;
- path-to-current-line projection;
- tree navigation used by the movelist/keyboard.

The underlying pure operations stay in `analysisTree.ts`.

Do this without changing the public behavior of `AnalysisController`. Initially it can
expose delegating methods/properties so `movelist.ts` and existing tests need only small
changes.

After this extraction, both one-board and two-board analysis should either use the same
controller or use a small shared base/helper around their genuinely different board
semantics. Do not force a premature unification if two-board move ordering makes that
awkward.

## 2. Replace boolean combinations with an explicit analysis context/capabilities

Do not perform a flag-day rewrite. First compute one explicit context from the model, for
example:

```text
postGame | analysisBoard | correspondence | embed | puzzle | study
```

Then centralize capabilities derived from that context, for example:

```text
canUseLocalEngine
canEditTree
showsCharts
showsGameInfo
usesRoundConnection
showsFenPgn
isReadOnly
```

Existing code can migrate from raw combinations to these named capabilities gradually.
This is primarily about making intent visible and preventing `if (!embed && !puzzle &&
!study && ...)` growth.

## 3. Add a small optional analysis extension interface

Lichess only needs a Study extension, so PyChess should resist inventing a generic plugin
system with dozens of abstractions. A narrow interface is enough.

Conceptually the host needs optional hooks like:

```text
onNodeAdded(parentPath, node)
onNodeDeleted(path)
onVariationPromoted(path, toMainline)
onForceVariation(path, force)
onPathChanged(path)
canJumpTo(path)
configureBoardShapes(...)
socketHandler(type, data)
destroy()
```

The concrete Study controller implements the hooks it needs. Ordinary analysis has no
extension.

Later, if it clearly simplifies Puzzle, puzzle-specific behavior can move from
inheritance to an extension/controller as well. **That conversion should not block Study
Phase 1.** `PuzzleController extends AnalysisController` is a reason to keep the first
refactor conservative, not a reason to redesign puzzle and Study simultaneously.

## 4. Keep the analysis host responsible for analysis

The generic analysis host should continue to own:

- Chessground/Fairy-Stockfish board interaction;
- making a legal local move/drop and producing the resulting runtime node;
- engine analysis and PV rendering;
- generic navigation;
- generic tree rendering;
- generic FEN/PGN representation;
- settings that apply to all analysis modes.

`StudyController` should own only Study-specific concerns:

- Study/chapter metadata;
- persistence commands;
- annotations that exist because the tree is persisted/shared;
- permissions;
- chapter list and switching;
- sharing/members later;
- Study websocket/revision state;
- sticky/write state later.

This split is the architectural objective of Phase 0.

## 5. Separate runtime analysis nodes from persisted Study nodes

`Step` currently contains many fields that are useful at runtime but should not become a
Study storage contract: local ceval, scores, clocks, chat, two-board diagnostics, and
other transient properties.

Do **not** serialize `Step` wholesale into MongoDB.

Define a compact Study node DTO and an adapter between it and the runtime analysis tree.
The persisted representation should contain only stable information required to restore
and annotate the tree, for example:

- stable node ID;
- canonical move (and any required board/multi-leg move information);
- server-computed SAN/display notation if useful;
- optionally server-computed resulting FEN/check metadata if the storage cost is
  acceptable;
- children;
- later: comments, glyphs, shapes, `forceVariation`, gamebook data, etc.

Local engine evaluation should stay local unless a future explicit "save evaluation" or
server-analysis feature is implemented.

# Stable node identity before persistence

The current `analysisTree.ts` allocates dotted path segments from a client-local
`nextId`. That is fine for an in-memory tree but should not become the permanent identity
scheme of a collaborative Study.

Two clients can allocate the same sequential ID independently, and IDs are regenerated
when a tree is reconstructed.

Before persisted Studies are introduced, define a Study-safe identity strategy. Good
options are:

1. a deterministic ID derived from the canonical move identity under its parent, with a
   server-side collision check; or
2. a high-entropy client-generated node ID accepted/canonicalized by the server, while
   the server deduplicates siblings by canonical move.

Lichess's two-character ID is deterministic from chess UCI and supports optimistic local
updates, but its exact encoding is too chess-specific for PyChess. Preserve the property
(stable identity) rather than the encoding.

The UI may continue using dotted paths, but persisted/broadcast paths must be made from
stable node IDs.

# Proposed MongoDB model

Use two collections from the beginning.

## `study`

Suggested initial fields:

```text
_id                 8-char Study ID
name                Study name
owner               username
members             embedded map/list; owner only in Phase 1
visibility          private initially; public/unlisted/private later
currentChapter      optional shared chapter ID (collaboration phase)
currentPath         optional shared stable path (collaboration phase)
settings            future Study feature permissions
source              scratch/game/study/import metadata as useful
createdAt
updatedAt
revision            Study-metadata/chapter-list revision
```

Keeping a small member map embedded in Study is reasonable because membership is bounded
and frequently needed for authorization. Lichess uses 30 as its member cap; that is a
sensible future upper bound.

## `study_chapter`

Suggested fields:

```text
_id                 8-char chapter ID
studyId             parent Study ID
name
order
owner               creator/owner username
variant              PyChess variant key
chess960
initialFen
orientation
variantIni           snapshot for catalogued/custom variants when required
root                 compact persisted analysis tree
tags                 PGN tags (Phase 2)
description          Phase 2+
mode                 normal initially; future practice/conceal/gamebook
createdAt
updatedAt
revision             monotonically increasing chapter mutation revision
```

### Indexes

Register collections/indexes in `server/database/schema.py`, not ad-hoc feature startup
code.

At minimum:

- `study.owner + updatedAt desc` for "my Studies";
- `study.members` or an equivalent contributor lookup when collaboration arrives;
- `study.visibility + updatedAt desc` only when public discovery arrives;
- `study_chapter.studyId + order` for chapter lists;
- optionally unique `(studyId, order)` is **not** recommended if reorder is implemented
  as several writes; chapter `_id` remains the identity and order can be normalized.

The exact public-discovery indexes should be added when that query exists rather than
burdening production MongoDB during the owner-only MVP.

## Size limits

Lichess uses 64 chapters and 3,000 nodes/chapter. Those are useful reference limits, but
PyChess has variants with much longer FENs than orthodox chess and runs on a much smaller
server.

Recommended policy:

- `MAX_STUDY_CHAPTERS = 64` is reasonable because chapters are separate documents;
- use a configurable node cap, with 3,000 as the parity ceiling;
- also enforce an encoded/BSON-size safety limit well below MongoDB's 16 MiB document
  limit (for example an 8 MiB Study-chapter payload guard);
- never let a custom large-board/custom-pocket variant create a chapter that approaches
  the MongoDB hard limit merely because it is below the node count.

A separate document per node would avoid the document-size issue but would create far
more Mongo operations/documents and is a poor default for PyChess's small production
server. A compact tree per chapter is the better starting tradeoff.

# Catalogued/user-defined variant persistence

This is a PyChess-specific requirement with no direct Lichess equivalent.

A Study chapter must remain reproducible if the catalogued variant's author later edits,
archives, renames, or deletes the catalogue entry. Storing only the current variant name
is not sufficient.

Reuse the existing saved-game principle around `vini`:

- snapshot the exact variant definition required by the chapter;
- rehydrate it through the existing catalogued-variant/saved-game compatibility path
  rather than inventing unrelated Study-only variant registration;
- keep the user-facing variant name/metadata separately from the immutable rules
  snapshot when necessary.

Built-in variants should not duplicate INI data unnecessarily.

Public catalogue access policy and Study visibility are separate questions: once a user
has legitimately created a chapter from a public variant, the saved Study should not
break because the catalogue listing changes later.

# Server validation and trust boundary

The browser can make moves locally for responsiveness, but MongoDB must not trust a
client-supplied FEN/tree blindly.

For `addNode` the server should:

1. load Study + chapter under the per-Study lock;
2. authorize the user;
3. resolve the stable parent path;
4. reconstruct/validate the position with the chapter's variant snapshot and
   `FairyBoard`;
5. validate the canonical move;
6. compute the resulting canonical state/SAN needed for persistence;
7. deduplicate an already-existing identical child;
8. enforce node/document-size caps;
9. persist the changed chapter and increment its revision;
10. broadcast/acknowledge the accepted operation.

For variants whose legal moves depend on history, reconstruct the move history along the
selected branch rather than validating solely from a FEN. The path already provides the
required move sequence.

Comments/descriptions/tags must use the normal PyChess sanitization/length-limit policy
when they are introduced.

# Proposed Study websocket model

Even the owner-only MVP should shape tree persistence as incremental commands so
collaboration does not require replacing the storage protocol later.

A dedicated websocket such as `/wsstudy/{studyId}` can reuse `process_ws()` and the
existing typed-message approach.

The first protocol only needs a small set of operations:

```text
study_user_connected
study_add_node
study_delete_node
study_promote
study_force_variation
study_set_chapter            (once shared chapter state exists)
study_set_path               (once sticky sync exists)
study_error
study_reload
```

Annotations add their own operations later.

Useful fields on mutations:

```text
studyId
chapterId
path / parentPath
clientOpId
expectedRevision
operation-specific payload
```

Server responses/broadcasts include the authoritative new revision and canonical node
payload when relevant.

In Phase 1 only the owner may connect/write, so the same protocol is easy to exercise
without solving collaboration yet. In Phase 4 the room simply gains multiple authorized
clients and broadcast semantics.

Chapter creation/deletion/renaming and Study metadata can remain normal HTTP POST actions
initially; they do not need to be forced through the tree-edit websocket until realtime
collaborative metadata editing is valuable.

# Proposed pages and routes

Do not implement the whole Lichess route surface at once.

## Phase 1 routes

A useful owner-only MVP can start with:

```text
GET   /study                         My Studies / create entry
POST  /study                         Create Study
GET   /study/{studyId}               Open current/first chapter
GET   /study/{studyId}/{chapterId}   Open chapter
POST  /study/{studyId}/delete        Delete Study
POST  /study/{studyId}/chapter       Add chapter
POST  /study/{studyId}/{chapterId}/edit
POST  /study/{studyId}/{chapterId}/delete
GET   /wsstudy/{studyId}             Study tree websocket
```

The exact mutation URL naming can follow whichever current PyChess convention reads best;
what matters is keeping page routes and mutation APIs explicit.

## Later parity routes

Add only when the corresponding feature exists:

```text
GET   /study/{studyId}.pgn
GET   /study/{studyId}/{chapterId}.pgn
POST  /study/{studyId}/import-pgn
GET   /study/embed/{studyId}/{chapterId}
GET   /study/by/{username}
GET   /study/search
POST  /study/{studyId}/clone
```

A public API can be designed after the browser feature is stable. There is no need to
mirror Lichess's API endpoints before PyChess itself uses the underlying behavior.

# Creation scenarios and recommended rollout

Lichess supports many creation sources in one flow. PyChess should add them in order of
implementation risk.

## MVP

- New empty Study from the normal starting position.
- New Study from an arbitrary valid FEN.
- New Study/chapter from a saved PyChess game.
- "Save as Study" / "Add to Study" from an existing analysis page once the Study model
  is stable.

Creating from a saved game is particularly useful because the server already owns the
canonical variant, initial FEN, moves, and custom-variant snapshot.

## Next

- Add a chapter from the current analysis tree, including local variations.
- PGN import of one game.
- Multi-PGN import, capped by remaining chapter capacity.
- clone Study.

The current `/paste` flow uses Fairy-Stockfish's PGN reader mainly to obtain headers and
`mainlineMoves()`. Full Study import must preserve variations/comments/NAGs, so the
existing importer should not be assumed to solve that problem already.

Do not make full variation-aware PGN parsing a Phase 1 blocker. It deserves a focused
Phase 2 task. If Fairy-Stockfish's JS API cannot expose the complete PGN tree, either
extend that bridge or introduce a variant-aware parser/adapter; avoid using a
chess-only parser that silently drops non-orthodox variant notation.

# Phased implementation plan

# Phase 0 — analysis-core refactor (no Study behavior yet)

This phase should be merged in several small, behavior-preserving commits.

## 0A. Extract single-board tree state

- [ ] Add a single-board `AnalysisTreeController` (or equivalent name) around
  `client/analysis/analysisTree.ts`.
- [ ] Move current path, branch navigation, context-menu state and variation/collapse
  operations out of the giant `AnalysisController` where practical.
- [ ] Keep delegating methods on `AnalysisController` temporarily to minimize churn.
- [ ] Compare the result with two-board `AnalysisTreeController`; share helpers where it
  is natural, but do not force one class to understand both board models.
- [ ] Keep `movelist.ts` dependent on a small tree/navigation capability surface rather
  than concrete controller internals.

### Regression coverage for 0A

- [ ] Existing persisted mainline navigation remains unchanged.
- [ ] Add/select variation.
- [ ] Nested variations.
- [ ] Promote variation / promote to mainline.
- [ ] Force/convert variation.
- [ ] Delete branch and jump to valid parent.
- [ ] Collapse/expand persistence.
- [ ] Keyboard variation navigation.
- [ ] Post-game, standalone analysis and Puzzle still behave identically.

## 0B. Introduce explicit analysis context/capabilities

- [ ] Define one explicit analysis context from `PyChessModel` rather than deriving mode
  independently in many methods.
- [ ] Centralize common questions such as local-engine availability, editable-tree state,
  chart visibility and round websocket usage.
- [ ] Gradually replace combinations of `embed`, `puzzle`, `ongoing`, and
  `isAnalysisBoard` with named capability checks.
- [ ] Do not delete compatibility properties until callers are migrated.

## 0C. Add optional extension hooks

- [ ] Define a narrow optional `AnalysisExtension`/`AnalysisModeController` contract.
- [ ] Add hooks only for operations Study actually needs; avoid speculative plugin APIs.
- [ ] Make generic tree mutations call the extension after/before local mutation as
  appropriate.
- [ ] Allow extension websocket event delegation.
- [ ] Allow an extension to veto navigation/action only where a future Study lesson mode
  genuinely needs it.
- [ ] Keep ordinary analysis working with `extension === undefined`.

## 0D. Split views only where it reduces mode branching

- [ ] Keep shared board/movelist/engine controls in generic analysis rendering.
- [ ] Extract page-specific side/under-board panels when doing so removes current mode
  conditionals.
- [ ] Make a future Study renderer able to compose the generic analysis board/tools with
  a Study side panel, analogous to Lichess's `analyseView` vs `studyView` dispatcher.
- [ ] Do not redesign all CSS/layout as part of Phase 0.

## 0E. Puzzle follow-up, non-blocking

- [ ] Re-evaluate `PuzzleController extends AnalysisController` after the generic host
  boundary exists.
- [ ] Convert puzzle to composition/extension only if it materially simplifies the code.
- [ ] Do **not** make this a prerequisite for starting Study Phase 1.

# Phase 1 — persisted owner-only Study MVP

Goal: one user can create a Study, keep multiple chapters, edit analysis trees, leave the
page, return later, and see the same analysis.

No public listing, no collaborators, no chat, no likes/topics, no lesson modes.

## 1A. Database/domain foundation

- [ ] Add `study` and `study_chapter` collections to `server/database/schema.py`.
- [ ] Add the minimal owner/chapter-list indexes.
- [ ] Add typed Study/Chapter data models and compact serialization helpers.
- [ ] Add configurable chapter/node/document-size limits.
- [ ] Use `new_id()` / existing 8-character ID convention for Study and chapter IDs.
- [ ] Do not preload Studies during `PychessGlobalAppState.init_from_db()`.
- [ ] Add lazy per-Study mutation locks and active socket rooms only as needed.

## 1B. Stable tree persistence contract

- [ ] Replace/augment client-local sequential tree IDs with stable Study-safe IDs.
- [ ] Define persisted Study node DTO separately from runtime `Step`.
- [ ] Add tree encode/decode adapters.
- [ ] Ensure decode preserves mainline ordering and variation ordering.
- [ ] Preserve `forceVariation`.
- [ ] Add chapter `revision` and Study metadata `revision`.

## 1C. Server tree mutation service

- [ ] Implement owner authorization.
- [ ] Implement `addNode` with server-side `FairyBoard` validation.
- [ ] Implement delete branch.
- [ ] Implement promote variation / promote to mainline.
- [ ] Implement force/unforce variation.
- [ ] Enforce path validity, node cap and BSON-size guard.
- [ ] Increment revision for every accepted mutation.
- [ ] Deduplicate repeated identical child moves safely.
- [ ] Return a structured reload/error response rather than leaving a client half-mutated.

## 1D. Study websocket

- [ ] Add a dedicated Study websocket using `process_ws()` and typed message decoders.
- [ ] Connect Study page through the optional analysis extension.
- [ ] Persist tree mutations through incremental commands.
- [ ] Include `clientOpId` and expected/current revision.
- [ ] Reload authoritative chapter on revision/path mismatch.
- [ ] Owner-only is sufficient in this phase; broadcast can initially be only the
  origin/other tabs of the same owner.
- [ ] Clean socket room state when the last connection leaves.

Supporting multiple tabs for the same owner is a useful early synchronization test even
before collaborators exist.

## 1E. Study/chapter pages

- [ ] Add `/study` owner list with Create Study action.
- [ ] Add Study page built from the generic analysis shell plus a Study chapter panel.
- [ ] Add chapter list and current chapter selection.
- [ ] Add chapter create/rename/delete.
- [ ] Add Study rename/delete.
- [ ] Add orientation setting if cheap; otherwise use initial side-to-move/default first.
- [ ] Update browser address when chapter changes.
- [ ] Load only current chapter tree plus lightweight chapter previews/names.

## 1F. Initial creation sources

- [ ] Empty chapter from variant start position.
- [ ] Chapter from validated FEN.
- [ ] Study/chapter from a saved PyChess game.
- [ ] Snapshot `vini`/custom rules for catalogued variants.
- [ ] Add a basic "Save to Study" entry point from post-game/standalone analysis only
  after tree serialization is proven stable.

## Phase 1 acceptance criteria

- [ ] Create a Study with at least several chapters.
- [ ] Make nested variations, promote/delete them, reload the page, and get exactly the
  same tree.
- [ ] Open the same Study in two tabs; accepted edits converge or trigger an explicit
  reload rather than corrupting the tree.
- [ ] Restart the server and load the Study without any startup preload/recovery step.
- [ ] A catalogued-variant chapter still works after the live catalogue definition is
  edited/archived, using its saved rules snapshot.
- [ ] Anonymous/other users cannot read or mutate the owner-only Phase 1 Study.

# Phase 2 — annotations and import/export

Goal: turn persisted trees into genuinely useful saved analysis documents.

## 2A. Node annotations

- [ ] Arrow/circle shapes persisted per node.
- [ ] Text comments per node.
- [ ] Glyphs/NAGs per node.
- [ ] Chapter description.
- [ ] PGN tags.
- [ ] Clear annotations action.
- [ ] Appropriate text limits/sanitization.

Persist these as incremental operations, not whole-tree replacement.

## 2B. PGN export

- [ ] Export one chapter including variations.
- [ ] Export comments, NAGs and supported annotations in compatible PGN form.
- [ ] Export Study as multiple PGNs/chapters.
- [ ] Preserve Variant/FEN tags required by PyChess variants.
- [ ] Preserve/snapshot custom variant identity where standard PGN cannot describe it;
  document any PyChess-specific tag extension.

## 2C. PGN import

- [ ] Import one PGN with complete variation tree, not only mainline.
- [ ] Import comments and NAGs.
- [ ] Validate every branch using the selected variant.
- [ ] Import multiple PGNs as multiple chapters up to remaining capacity.
- [ ] Produce actionable errors for unsupported/ambiguous variant notation.
- [ ] Do not silently flatten or discard variations.

## 2D. "Add to Study" workflows

- [ ] From a finished game.
- [ ] From standalone analysis/FEN.
- [ ] From an existing local analysis tree with variations.
- [ ] Choose New Study or an existing owned/contributed Study.
- [ ] Preserve current orientation and relevant PGN tags.

# Phase 3 — read-only sharing and visibility

Goal: other users can consume a Study safely before they can edit it.

This is a deliberately separate milestone from collaboration.

- [ ] Add visibility enum: private / unlisted / public.
- [ ] Centralize `canViewStudy()` authorization server-side and use it for page, chapter,
  websocket, export and future APIs.
- [ ] Private: only authorized members/owner.
- [ ] Unlisted: anyone with the link may view, but do not list publicly.
- [ ] Public: eligible for public owner/profile/list pages.
- [ ] Ensure changing a Study to private immediately protects chapter routes/export/ws.
- [ ] Add share link UI.
- [ ] Add chapter embed only after read-only permission behavior is solid.
- [ ] Add Study/chapter PGN download permission.
- [ ] Add clone permission and cloning only after sharing rules are explicit.
- [ ] Consider profile "Studies" listing and `/study/by/{username}`.
- [ ] Add public search/discovery indexes only when public listing/search is implemented.

Do not couple visibility with editing rights. A public Study is not publicly editable.

# Phase 4 — collaborators and realtime synchronization

Goal: several authorized users can edit the same Study safely at the same time.

The Phase 1 incremental protocol and per-Study lock should make this an extension rather
than a rewrite.

## 4A. Members and roles

- [ ] Owner role.
- [ ] Contributor/write role.
- [ ] Read-only member role.
- [ ] Invite/add member.
- [ ] Change role.
- [ ] Remove/kick member.
- [ ] Leave Study.
- [ ] Member cap (Lichess uses 30; use a conservative configurable PyChess cap).
- [ ] Server-side authorization for every mutation; never rely on hidden buttons.

## 4B. Room synchronization

- [ ] Broadcast accepted incremental mutations to every connected Study client.
- [ ] Track origin/session or `clientOpId` so optimistic local edits are not applied twice.
- [ ] Maintain monotonic revisions.
- [ ] Reload on missing path/revision gap/failed local application.
- [ ] Show collaborator presence/activity only if it remains inexpensive.
- [ ] Test two contributors making moves on different branches simultaneously.
- [ ] Test two contributors trying to add/promote/delete around the same branch.

## 4C. Separate record and follow modes

Copy the Lichess concept explicitly:

- [ ] `write`: contributor's analysis edits are recorded.
- [ ] `sticky`: viewer follows the shared Study chapter/path.
- [ ] Turning sticky off lets a viewer browse independently.
- [ ] Turning write off lets a contributor experiment locally without modifying Study.
- [ ] Remote shared-path changes while non-sticky increment a simple "behind" indication
  rather than stealing the user's board.
- [ ] Rejoining sticky mode reloads/jumps to authoritative shared position.

## 4D. Shared chapter/path

- [ ] Study stores current shared chapter/path.
- [ ] Authorized sticky navigation updates it.
- [ ] Chapter changes and path changes are serialized with the other Study operations.
- [ ] Non-sticky clients keep a local last path for each chapter.

# Phase 5 — optional high-value parity

Add these based on actual PyChess usage rather than parity for its own sake.

## Likely high value

- [ ] Clone Study.
- [ ] Better Study lists: mine, contributed, public.
- [ ] Search by Study name/owner.
- [ ] Chapter search.
- [ ] Likes/favorites.
- [ ] Topics/tags for discovery.
- [ ] Chapter previews / multiboard overview.
- [ ] Per-feature permissions (local engine, explorer, clone, export/share).
- [ ] Server/Fishnet analysis request for a chapter.

## Lesson/training modes

These are powerful but should come only after ordinary Study editing is mature:

- [ ] Practice with computer.
- [ ] Conceal next moves.
- [ ] Interactive lesson/gamebook mode.
- [ ] Hints/deviation messages.

The generic analysis extension must be able to restrict jump/move behavior for these
modes, but Phase 0 should add such hooks only when there is a concrete caller.

## Low-priority / special-purpose parity

- [ ] Study chat.
- [ ] GIF export.
- [ ] Staff picks.
- [ ] Full public API parity.
- [ ] Broadcast/relay functionality.

Relay is effectively another major product built on Study. It should not influence the
first PyChess Study implementation beyond keeping the architecture extensible.

# Two-board Studies

Two-board analysis already exists, but Study should **start single-board only**.

Reasons:

- two-board chapters need two FENs/board state and different move sequencing;
- their runtime analysis controller is already distinct;
- collaboration/revision bugs are much easier to isolate with one board first;
- Study itself is large enough without simultaneously designing persisted Bughouse trees.

This is a deferral, not a permanent exclusion. After single-board Study is stable, audit
whether the shared tree DTO/Study controller can accept a board-specific node codec and
reuse the same Study/chapter/membership infrastructure.

Do not compromise the single-board data model with speculative two-board fields now;
keep the persisted-node codec extensible instead.

# Server resource policy

Study must fit PyChess's production constraints rather than Lichess's infrastructure.

- Never preload all Studies or all chapters at startup.
- Load Study metadata + current chapter on demand.
- Chapter list should use lightweight projections, not full `root` payloads.
- Keep active socket rooms only while connected.
- Use one cheap per-Study lock instead of actor infrastructure.
- Avoid one Mongo document per node unless real measurements show chapter documents are
  a problem.
- Debounce high-frequency annotation writes such as descriptions/shapes where sensible.
- Bound websocket payload size, comment/description size, chapter count, node count and
  encoded chapter size.
- Do not persist transient browser ceval on every engine update.
- Public list/search queries get indexes only when those features land.

# Deletion, account erasure and moderation

These are not Phase 1 blockers beyond owner deletion, but the data model must make them
straightforward.

- Owner deleting an owner-only Study can delete its chapter documents.
- When collaboration exists, account deletion must define whether an owned Study is
  deleted, transferred, or anonymized if other collaborators depend on it.
- Member/comment authorship must be erasable/anonymizable under the existing account
  deletion flow.
- Public Study descriptions/comments/chat become user-generated public content and must
  be included in moderation/reporting policy.
- Private visibility must be checked on every direct chapter/export/embed endpoint, not
  just the Study landing page.

Before public rollout, add a focused GDPR/moderation checklist similar to the Simul/Team
production-hardening work.

# Testing strategy

Unlike small CSS/UI changes, Study persistence and collaboration deserve targeted tests
because regressions can corrupt saved user work.

## Client unit tests

- tree encode/decode round trip;
- stable node/path identity;
- add/delete/promote/force operations through the extracted tree controller;
- extension hook invocation and ordinary-analysis no-op behavior;
- applying Study remote operations;
- revision gap -> reload path;
- sticky/write mode behavior once added;
- annotations round trip.

## Server tests

- authorization for every Study/chapter mutation;
- chapter count/node/document-size caps;
- legal/illegal move validation across representative variant families;
- history-dependent variants;
- catalogued variant snapshot reload;
- mutation revision increments;
- concurrent operations serialized by one Study lock;
- delete/promote invalid path does not corrupt tree;
- private/unlisted/public access matrix when visibility lands;
- collaborator role matrix when roles land;
- server restart requires no Study recovery.

## Integration/browser scenarios

- ordinary post-game analysis unchanged after Phase 0;
- standalone analysis unchanged;
- embed unchanged;
- puzzles unchanged;
- save Study -> reload -> identical nested tree;
- two tabs editing one owner Study;
- two collaborator browsers once Phase 4 lands;
- server restart while a Study exists;
- catalogued variant changed after Study creation;
- mobile chapter switching and analysis layout.

# Suggested implementation commit sequence

The first development cycle should stop well before collaboration:

1. `refactor analysis tree state into AnalysisTreeController`
2. `centralize analysis context and capabilities`
3. `add optional analysis extension hooks`
4. `add Study/Chapter Mongo schema and persistence types`
5. `add owner-only Study pages and chapter CRUD`
6. `persist Study tree mutations over incremental websocket commands`
7. `create Study from game/FEN and add Save to Study workflow`
8. `add comments/shapes/glyphs and PGN export`
9. `add full variation-aware PGN import`
10. only then start visibility/sharing/collaboration work

Each of the first three commits should contain no Study feature behavior and should be
reviewable as an analysis refactor on its own.

# Intentional first-release non-goals

A first production-capable Study does **not** need:

- simultaneous collaborators;
- public discovery/search;
- likes/topics;
- chat;
- clone;
- embed;
- server analysis;
- practice/conceal/gamebook;
- relay/broadcast;
- two-board chapters;
- full Lichess API parity.

A successful first release is much simpler: **a user can save a rich analysis tree into
multiple persistent chapters, reopen it reliably, annotate it, and export it, while all
existing analysis modes continue to use the same reusable analysis core.**

# Recommended first task

Start with **Phase 0A only**: extract the single-board tree/navigation state from
`AnalysisController` into an `AnalysisTreeController`, using the existing two-board
controller as a PyChess-native reference and Lichess's generic tree wrapper as the
architectural reference.

Do not add Study database code in the same patch. Once that refactor is merged and the
existing analysis/puzzle/embed behavior is green, proceed to 0B/0C. That gives Study a
clean host API before any persistence contract becomes difficult to change.
