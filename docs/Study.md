# Study

Study adds persistent chapters, annotations, sharing, and collaboration to PyChess's
single-board analysis. It reuses the ordinary analysis board, move tree, navigation,
and engine tools through an optional analysis extension.

This is the implementation reference and remaining-feature inventory, updated on
2026-09-19 after the chapter analysis-mode rollout. It replaces the phased roadmap and
repeated review reports as the description of shipped behavior. Their detailed plans,
reproductions, and findings remain in Git history. Update this document when behavior
changes; possible future features below are not commitments or a release schedule.

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

Chapters are single-board only. Existing Studies can add chapters by pasting PGN in the
New chapter dialog. PGN file upload and creating a brand-new Study directly from PGN
remain follow-up work described below.

### Annotations and analysis

- Root and move comments with stable IDs and server-authoritative authorship;
  autosaving comment editors and comments displayed in the move tree.
- Root and move arrows/circles and NAGs, including a picker for the 24 named lichess
  glyphs. Comments, glyphs, PGN tags, descriptions, and sharing have dedicated tools.
- Chapter-wide Clear annotations and Clear variations actions.
- Local engine analysis, subject to the viewer's computer-analysis permission.
- Contributor requests for Fishnet analysis of a chapter's preferred mainline, with
  at least five moves, a five-minute repeat guard, one pending Study analysis per
  account, and rolling per-account analysis budgets.
- Persisted partial/completed server evaluations, live progress, the shared analysis
  chart, generated mistake glyphs/advice comments, and best-line variations. Existing
  human comments and variations are preserved/reused.

Changing the analyzed mainline invalidates stale server analysis and cancels queued
work. Fishnet jobs remain in memory: after a server restart, saved partial results
remain visible, but unfinished work is no longer pending and can be requested again
after the cooldown. Historical custom-variant analysis uses the saved rules snapshot
in its worker payload.

### Chapter analysis modes

Every chapter has an **Analysis mode**. New/edit chapter dialogs offer the deployed
subset of four schema-supported modes, and **Orientation / learner side** explicitly
chooses which color the learner controls in the training modes.

| Mode | Reader/player behavior | Contributor behavior |
| --- | --- | --- |
| Normal analysis | Full tree, navigation and ordinary allowed analysis tools | Normal REC/SYNC collaboration and persistent edits |
| Practice with computer | Disposable game against the browser engine from the chapter root | Same practice player by default; writers may leave practice for ordinary analysis |
| Hide next moves | Only the revealed/current line is visible; legal board exploration is local | Full tree with unrevealed moves faded, plus **Hide moves again** reset |
| Interactive lesson | Scripted mainline playback with feedback, hints and solution reveal | Full lesson editor plus a local **Preview** mode |

Training/preview sessions never overwrite the user's saved REC/SYNC preferences. They
turn persistence/shared navigation off locally as needed, and returning to ordinary
analysis reloads the authoritative chapter before restoring the saved behavior.

#### Hide next moves

Concealment stores `concealPly`, the number of preferred-mainline moves revealed from
the chapter's own root. This intentionally differs from lichess's absolute FEN ply,
so a custom FEN's move number does not affect what is hidden. A new concealed chapter
starts at depth 0.

Readers can move backward through already revealed positions and can try one legal
board move from their current position without first seeing its SAN. That exploration
is browser-local and disappears when they leave/reload it. A contributor publishing a
later position on the preferred mainline advances the shared reveal boundary; publishing
side variations or moving backward does not. **Hide moves again** resets the boundary
and shared position to the chapter root. Like lichess, contributors stay in the normal
Study authoring shell: unrevealed continuation moves are faded in the move tree, while
readers simply do not see them. Drawings on the currently visible position remain
visible to readers, matching lichess live-coaching behavior. There is no separate
conceal-mode status/preview panel.

#### Interactive lesson authoring

Interactive lessons treat the preferred mainline as the answer script. The chapter
orientation is the learner's color. To author one:

1. Select **Interactive lesson** and choose the learner side with chapter orientation.
2. Build the expected sequence as the preferred mainline. If the opponent moves first,
   put that scripted move on the mainline before the learner's first prompt.
3. Use ordinary position comments for introduction text, explanations after opponent
   moves, and feedback after the learner finds the expected move.
4. At learner-turn positions, optionally add a **Hint**. On the expected learner move,
   optionally add a **Fallback wrong-answer explanation** for other moves.
5. Add variations from a learner position when a particular wrong move needs its own
   ordinary comment. Promote the intended answer to the preferred mainline.
6. Use **Preview** before publishing. Preview starts at the root and remains local.

Playback accepts the preferred-mainline move as the scripted correct answer. Wrong
moves get a move-specific variation comment when present, otherwise the fallback
explanation, and can be retried. The player can toggle the authored hint, reveal the
solution, continue/replay, and advance to the next chapter. Contributors can return to
the lesson editor; readers may enter ordinary analysis only after completing the lesson.
Author edits received during an attempt freeze/reload the disposable player rather than
mixing an old script with the new authoritative chapter.

Only one preferred answer is currently accepted at each learner prompt. Supporting
multiple accepted answers is a separate future feature; authored side variations are
wrong-answer/explanation branches, not additional correct solutions.

#### Practice with computer

Practice starts a disposable game from the chapter root; saved chapter continuations do
not become the opponent's script. The learner controls the saved orientation and the
browser engine controls the opposite color. The runtime keeps a separate full-history
rules board for legality, repetition-sensitive outcomes and variant results, while all
attempt moves remain local and absent from Study persistence/shared navigation.

The playback layout follows lichess practice rather than replacing the whole analysis
panel: the engine header, local attempt move tree, move-navigation controls, and normal
Study under-board tools remain visible, while the ordinary multi-PV output is hidden and
a compact **Practice with computer** status/feedback box sits below the move tree.

The page reuses the existing Fairy-Stockfish browser worker rather than starting a
second worker. Learner-position feedback/hints use bounded 400,000-node searches and
the computer reply uses a bounded 600,000-node search, one owned search at a time.
Search ownership is drained through `bestmove` plus `isready`/`readyok` before another
position is started, with independent wall-clock limits and stale-result rejection.
Ordinary infinite local analysis and practice do not run concurrently.

Move feedback is intentionally approximate for variants: **good**, **inaccuracy**,
**mistake** and **blunder** use the same winning-chance-loss thresholds as the inspected
lichess implementation. Exact best-move matches and terminal outcomes are handled
directly; missing/bounded scores are reported as ungraded instead of inventing a
verdict. Like lichess, grading does not stop the game for a separate confirmation step:
the computer reply continues automatically and the verdict stays in the compact feedback
strip. A best-move suggestion remains clickable so the learner can jump back and retry it
even after the computer has replied. Hints escalate on the board from a source piece/drop
indication to the full move; the practice box only changes its **Get a hint** / **See best
move** / **Hide best move** action instead of duplicating the hint as explanatory text.

Practice requires the viewer's computer-analysis permission, no conflicting active
eligible live game, and a variant supported by the browser Fairy-Stockfish instance.
Saved custom rules are passed to the browser engine. Two-board variants are explicitly
unsupported, and engine/permission/time-out failures show an unavailable state rather
than falling back to server Fishnet work. A failed engine drain barrier fails closed
until the page is remounted.

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

Study embeds are intentionally lightweight. Normal-analysis chapters keep the ordinary
interactive embedded viewer. Non-Normal chapters are locked to a root-position preview:
Interactive lessons show **Start**, while Practice and Hide-next-moves show **Open
study**, all opening the full Study in a new tab. The iframe does not instantiate lesson
playback, Practice engine work, answer-bearing tree navigation, annotations, or computer
search. This is close to lichess's gamebook embed behavior and deliberately extends the
root-only lock to the other training modes for disclosure/resource safety.

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
| `PyChessStudyVersion=1`, `PyChessChapterMode` | Versioned Study teaching extension and exact chapter analysis mode |
| `PyChessConcealPly` | Root-relative reveal boundary for Hide-next-moves chapters |
| `ChapterMode=gamebook` | Compatibility marker for interactive lessons; it does not contain the lesson text by itself |
| `[%pygamebook BASE64]` | UTF-8 JSON containing a position's optional lesson `hint` / `deviation` text |
| `[%pynag ...]` | Root-position NAGs |
| `[%pyclocks whiteMs,blackMs]` | Both clock values, including root clocks and sub-second precision |

The teaching extension is intentionally opaque to ordinary PGN software. Other programs
may ignore or discard the PyChess tags/directives, so lossless mode/lesson round-tripping
is only guaranteed when the versioned PyChess extension is preserved. `ChapterMode=gamebook`
alone is only a compatibility hint and is not a lossless lesson interchange format.
Practice attempts, lesson attempts and reader conceal exploration are disposable runtime
state and are never exported as authored chapter moves.

### Import: parser, validation, and paste workflow

[studyPgnParser.ts](../client/study/studyPgnParser.ts) is the client-side structural PGN
parser. It keeps SAN/move tokens variant-neutral while preserving recursive RAVs,
comments, NAGs, tags, and multiple games. It also applies browser-safety limits for
input size, chapter count, tree size, and variation depth. This deliberately avoids
using Fairy-Stockfish's lightweight `readGamePGN()` reader, which only exposes the
mainline and would discard Study data.

[studyPgnImport.ts](../client/study/studyPgnImport.ts) defines the parser-neutral recursive
PGN contract and converts parsed games into Study trees. It preserves variations,
comments, NAGs, shapes, clocks, evaluations, and the supported PyChess extensions.
Every branch is replayed through Fairy-Stockfish in the browser and validated again
server-side. Repeated RAV branches that resolve to the same legal move are merged after
that replay, preserving the first/mainline ordering while recursively combining their
children and annotations, matching lila's Study import behavior. The import endpoint
accepts normalized chapter data, validates the batch before insertion, and enforces
remaining chapter capacity.

The existing-Study **Add a new chapter** dialog now has a PGN source tab. Pasted text is
parsed and replayed entirely in the browser, then the normalized batch is sent to the
existing import endpoint. Parse, legality, and server-validation errors stay in the dialog
with their detailed diagnostics. Mixed ordinary/Alice PGN batches load the matching
Fairy-Stockfish WASM module per game, and successful imports open the final imported
chapter through the in-place chapter navigator. File upload and importing PGN as the first
chapter while creating a brand-new Study remain separate UI follow-up.

## Implementation and source map

| Area | Main sources |
| --- | --- |
| Shared analysis host, tree, context, extension | [analysisCtrl.ts](../client/analysis/analysisCtrl.ts), [analysisTreeCtrl.ts](../client/analysis/analysisTreeCtrl.ts), [analysisContext.ts](../client/analysis/analysisContext.ts), [analysisExtension.ts](../client/analysis/analysisExtension.ts) |
| Study page, tools, chapter navigation | [studyView.ts](../client/study/studyView.ts), [chapterNavigation.ts](../client/study/chapterNavigation.ts), [studyChapterForm.ts](../client/study/studyChapterForm.ts) |
| Chapter mode policy and concealment | [studyMode.ts](../client/study/studyMode.ts), [studyConceal.ts](../client/study/studyConceal.ts) |
| Interactive lesson authoring/playback | [studyGamebook.ts](../client/study/studyGamebook.ts), [studyGamebookEdit.ts](../client/study/studyGamebookEdit.ts), [studyGamebookPlayback.ts](../client/study/studyGamebookPlayback.ts) |
| Computer practice and bounded engine protocol | [studyPractice.ts](../client/study/studyPractice.ts), [studyPracticeFeedback.ts](../client/study/studyPracticeFeedback.ts), [analysisPracticeEngine.ts](../client/analysis/analysisPracticeEngine.ts) |
| Lists and Add to Study | [studyIndex.ts](../client/study/studyIndex.ts), [addToStudy.ts](../client/study/addToStudy.ts) |
| Study PGN import/export | [studyPgnParser.ts](../client/study/studyPgnParser.ts), [studyPgnImport.ts](../client/study/studyPgnImport.ts), [studyPgn.ts](../client/study/studyPgn.ts) |
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
metadata have additional bounded counts/lengths. Cloning streams chapters through the
database one at a time rather than materializing a maximal Study in the web process.

Study creation and server analysis also have account-level resource-fairness budgets.
A normal creation consumes one of 30 rolling credits per 24 hours; cloning costs three
credits. Study Fishnet analysis defaults to 40 requests per rolling day and 200 per
rolling week, with at most one pending Study analysis per account. These are abuse and
capacity guards, not a paid-usage model. Deployments can tune them without a code
change through `STUDY_CREATION_CREDITS_PER_24H`, `STUDY_CLONE_CREATION_COST`,
`STUDY_ANALYSIS_MAX_PER_DAY`, and `STUDY_ANALYSIS_MAX_PER_WEEK`. Failed creation, clone,
or queue admission rolls its claimed budget entry back.

Computer Practice is a separate client-side resource path: it never creates Fishnet
jobs and reuses the page-global browser engine with bounded searches. Repeated reset,
chapter switch and teardown dispose transient rules boards/search ownership; after exit,
Practice emits no further bounded-search work. The engine adapter also caps arbitrary
callers at one million nodes, 10 seconds movetime, depth 30, MultiPV 3 and a 12-second
wall-clock search limit by default.

`STUDY_ENABLED_CHAPTER_MODES` is a comma-separated deployment gate over
`normal,practice,conceal,gamebook`. It defaults to `normal,gamebook` so Normal analysis
and Interactive lesson can be rolled out first, and it always keeps `normal` as an
escape hatch. Set the variable explicitly to enable Practice with computer and/or Hide
next moves later. The switch gates **new entry** into a mode: existing chapters in a
disabled mode remain readable/playable and preserving edits remain schema-aware, while
new chapters, imports, copies/clones and mode transitions cannot introduce disabled
mode data. For rollback, keep this schema-preserving server deployed and narrow the
variable (for example to `normal`) rather than deploying code from before analysis-mode
support. No eager migration/backfill is required.

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

The original architecture and analysis-mode work used lila as the behavioral reference,
including the supplied 2026-09-19 source snapshot. This is source-level comparison, not
a claim of pixel-perfect parity with the current lichess deployment.

The shared principles are an analysis host extended by Study, separate Study/chapter
documents, incremental edits, serialized writes, independent recording/following,
membership/feature permissions, chapter-level Normal/Practice/Conceal/Gamebook modes,
and reload-based recovery from inconsistent state.

| Area | PyChess adaptation or deliberate difference |
| --- | --- |
| Runtime and sequencing | Python/aiohttp with process-local asyncio locks instead of lila's Scala sequencing infrastructure |
| Tree identity | Opaque IDs accommodate Fairy-Stockfish move encodings instead of lichess's compact move-derived IDs; duplicate moves require reconciliation |
| Variant persistence | Immutable custom-rule snapshots preserve historical catalogued/user-defined variants |
| Learner side | Saved chapter orientation explicitly selects the learner color for both Practice and Interactive lesson instead of copying all lila orientation heuristics |
| Conceal boundary | Root-relative preferred-mainline depth; lila stores an absolute ply initialized from the FEN/root ply |
| Computer Practice | Bounded browser Fairy-Stockfish with variant-aware full-history legality/outcomes; no tablebase/mastery integration and no Fishnet fallback |
| Interactive lesson | Preferred mainline supplies one accepted answer per prompt; side variations provide wrong-answer explanations, not multiple accepted solutions |
| Embeds | Normal is interactive; every non-Normal PyChess embed is root-only. Lichess specially locks gamebook embeds with a **Start** link; PyChess applies the same safety model to Practice/Conceal too |
| PGN | Browser-generated downloads plus versioned PyChess mode/lesson/conceal extensions; lila's PGN dump only emits `ChapterMode=gamebook` for these chapter modes |
| Discovery | Bounded prefix search; personal topic shortcuts derived from memberships/ownership instead of a separate topic-preference collection |
| Explorer | Permission is stored/evaluated, but PyChess has no opening explorer UI and hides its setting |
| Practice courses | Chapter Practice is implemented, but lichess's separate `/practice` curriculum/course progression is not |
| Public API / relay | Internal Study HTTP/WS behavior is implemented; full lichess Study API and Broadcast/relay are separate product work |

## Remaining features and decisions

These are known gaps or possible extensions. Their presence here does not imply that
PyChess will implement them all or reproduce every lichess workflow.

| Feature | Current gap / next decision |
| --- | --- |
| Raw PGN import | Existing Studies support pasted multi-game PGN in New chapter; file upload and first-chapter/new-Study PGN import remain |
| Multiple accepted lesson answers | Interactive lesson currently accepts only the preferred-mainline move at each prompt |
| Practice courses | No lichess-style `/practice` curriculum, exercise goals/progress, mastery option or tablebase-backed course integration |
| Chapter reordering | Persisted order exists, but there is no user-facing reorder action or route |
| Chapter search | Study discovery searches chapter metadata; chapter-local results/navigation remain absent |
| Board previews / multiboard overview | Lightweight chapter metadata exists; visual chapter-board overview remains absent |
| Collaborator presence/activity | Rooms track sockets for delivery and access control; no presence/activity UI |
| Opening explorer | Requires an explorer feature for PyChess before Study permission integration becomes useful |
| Study chat | No Study chat channel or chat permission UI |
| GIF export and staff picks | Optional sharing/curation additions |
| Full public API parity | Existing internal HTTP/WS operations do not provide the complete lichess Study API |
| Broadcast/relay | A separate substantial product decision, not a dependency of ordinary Study |
| Two-board chapters | Study chapters remain single-board; supporting two-board state/move sequencing would require integration with the separate two-board analysis controller |

Remaining engineering/rollout follow-up should be tracked separately from optional
product scope:

- Review Study-specific reporting/moderation needs for public comments and descriptions.
  Account-erasure integration is implemented; a dedicated Study reporting workflow is absent.
- Keep browser acceptance scenarios aligned with the current chapter dialogs and mode
  behavior, including the root-only training embeds.
- Measure production resource use and verify rendered behavior across themes, viewports,
  and representative variant families during rollout. Source/tests establish resource
  bounds and lifecycle invariants, not production memory/CPU measurements.
- If a future schema migration becomes necessary, snapshot representative production
  chapters first. The current analysis-mode rollout requires no eager backfill.

## Review status and verification

This document is the maintained source of truth for shipped Study behavior. The completed
analysis-mode implementation history is preserved in Git rather than in a separate finished
TODO document. The source and tests establish the implemented contracts, but they are not
independent certification of every production environment.

Existing tests live in `tests/test_study_*.py`, `tests/study*.test.ts`, and
`tests/addToStudy.test.ts`. In addition to models/storage, permissions, import/export,
tree mutations, synchronization/navigation, Fishnet integration and account erasure,
they now cover mode policy, conceal disclosure, lesson authoring/playback/collaboration,
Practice engine ownership/feedback/lifecycle, real Fairy-Stockfish WASM searches across
multiple variant families, deployment gates, and Study browser workflows.

The browser acceptance suite is the place to validate rendered behavior and lifecycle in
an environment that permits localhost Chromium. Source/unit checks alone cannot prove
computed styling, focus behavior or browser-worker teardown on every deployment.
Select checks for future changes using [AGENTS.md](../AGENTS.md) and the
[pychess-testing skill](../.agents/skills/pychess-testing/SKILL.md).
