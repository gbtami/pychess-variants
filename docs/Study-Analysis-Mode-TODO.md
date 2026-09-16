# Study chapter analysis modes: reference and implementation plan

Status: planned; no application behavior implemented by this document.

Prepared on 2026-09-14 against PyChess `8da156c730b059cc2ff2ba7f25a00c38ee953aee`
and the clean local `/home/tami/lila` checkout at
`39deb036f366f06b3149024728b5039846856455`. Read together with
[Study.md](Study.md), which describes the deployed feature's existing architecture.
These findings come from source inspection, not a live lichess comparison or a
production audit. References below pin lila to the inspected revision.

The objective is a chapter-level **Analysis mode** selector with four choices:
**Normal analysis**, **Practice with computer**, **Hide next moves**, and
**Interactive lesson**. They share a chapter tree but require different navigation,
board input, engine, presentation, and persistence policies. Implement them as small
controllers composed with the existing Study analysis extension.

## 1. What the lila implementation does

### 1.1 Modes and persistence

The creation form's `modeChoices` lists the four choices; chapter editing uses the
same list. The form submits one mode, but the stored chapter represents it with
optional `practice`, `gamebook`, and `conceal` fields. `conceal` is a ply boundary,
not a boolean. Normal analysis is the absence of the other modes.

Sources:
[chapterNewForm.ts](https://github.com/lichess-org/lila/blob/39deb036f366f06b3149024728b5039846856455/ui/analyse/src/study/chapterNewForm.ts),
[chapterEditForm.ts](https://github.com/lichess-org/lila/blob/39deb036f366f06b3149024728b5039846856455/ui/analyse/src/study/chapterEditForm.ts),
[Chapter.scala](https://github.com/lichess-org/lila/blob/39deb036f366f06b3149024728b5039846856455/modules/study/src/main/Chapter.scala),
[ChapterMaker.scala](https://github.com/lichess-org/lila/blob/39deb036f366f06b3149024728b5039846856455/modules/study/src/main/ChapterMaker.scala).

`ChapterMaker` initializes concealment at the root position's actual ply, which can
be nonzero for a FEN chapter. `StudyApi.editChapter` initializes it when enabling
concealment, removes it when disabling concealment, and resets the shared path to
the root when concealment is newly enabled on the current chapter. Mode and
orientation changes reload clients. Mode configuration requires contribution rights.

Orientation also determines training behavior. Lesson playback uses the saved
orientation as the learner's color; generic computer practice uses the current
bottom color. Automatic chapter orientation has additional heuristics: concealed
chapters prefer the initial side to move, and gamebooks can infer the learner's side
from the final mainline node. PyChess should make the learner's side clear in the
form rather than copy those heuristics without explanation.

Source:
[StudyApi.scala](https://github.com/lichess-org/lila/blob/39deb036f366f06b3149024728b5039846856455/modules/study/src/main/StudyApi.scala)
(`editChapter`), and `ChapterMaker.resolveOrientation` above.

### 1.2 Normal analysis

Ordinary collaborative analysis remains the default: browse the complete tree,
make local moves, record authorized edits, follow/publish shared positions, and use
analysis tools according to Study permissions. None of the teaching controllers is
required. This is the regression baseline for every stage below.

### 1.3 Practice with computer

This is live play against the browser engine from an analysis position. It is not
an exercise in guessing the author's next saved move. The engine may continue
beyond the saved line or choose a different continuation.

The chapter flag enables the general analysis `PracticeCtrl`. It:

- Lets the human play the bottom side and makes engine replies for the other side.
- Uses a single principal variation and waits for sufficient engine output before
  grading or playing. In this snapshot, casual defaults are roughly 400,000 nodes
  or one second for feedback and 600,000 nodes or two seconds for play, with other
  readiness conditions such as a completed best move. These are reference tuning
  values, not PyChess requirements.
- Grades a human move as good, inaccuracy, mistake, or blunder by comparing
  evaluations from the human's perspective. Winning-chance loss thresholds in this
  snapshot are 0.025, 0.06, and 0.14. A best-move match avoids a negative verdict.
- Offers a best-move explanation/retry and escalating hints: indicate the piece,
  show the move, hide the hint.
- Pauses when browsing away, offers Resume practice, and resumes in certain
  navigation situations when it is the human's turn.
- Handles outcomes and repetition, and consults supported tablebases. A mastery
  option changes the search budget. These dependencies cannot all be copied to
  PyChess, which has different variants and no equivalent tablebase integration.
- Suppresses ordinary PV lines while practice runs. The engine is still working;
  engine execution and engine-output presentation are separate concerns.

Sources:
[practiceCtrl.ts](https://github.com/lichess-org/lila/blob/39deb036f366f06b3149024728b5039846856455/ui/analyse/src/practice/practiceCtrl.ts),
[practiceView.ts](https://github.com/lichess-org/lila/blob/39deb036f366f06b3149024728b5039846856455/ui/analyse/src/practice/practiceView.ts),
[ctrl.ts](https://github.com/lichess-org/lila/blob/39deb036f366f06b3149024728b5039846856455/ui/analyse/src/ctrl.ts)
(`togglePractice`, `allowLines`, `userJump`),
[studyCtrl.ts](https://github.com/lichess-org/lila/blob/39deb036f366f06b3149024728b5039846856455/ui/analyse/src/study/studyCtrl.ts)
(`configurePractice`, `isCevalAllowed`).

Two distinctions matter:

1. Lila permits the engine for a practice chapter even when the ordinary chapter
   computer feature is unavailable: `features.computer || chapter.practice`.
   This is a deliberate permission difference to decide for PyChess.
2. The separate `/practice` course system supplies `practiceData`, goals, completion
   records, best move counts, and automatic next exercises. Its
   `study/practice/StudyPracticeCtrl` is only created when that extra data exists.
   Adding the Study chapter mode does **not** require implementing that course system.

Source:
[studyPracticeCtrl.ts](https://github.com/lichess-org/lila/blob/39deb036f366f06b3149024728b5039846856455/ui/analyse/src/study/practice/studyPracticeCtrl.ts).

### 1.4 Hide next moves

This is concealment of authored continuations while allowing someone to explore
the board. It does not assign correct/wrong verdicts or automatically play an
opponent's authored reply.

The inspected client combines a saved boundary and the viewer's current path:

- Mainline nodes through `chapter.conceal` can be rendered normally.
- The current path and its ancestors remain visible, so moves actually played or
  positions already navigated to are visible on that path.
- Other nodes are hidden for viewers. The chapter owner can see them with a
  concealment class indicating that they are concealed from others.
- Navigation checks allow going backward. Otherwise they check the target's last
  mainline ancestor against the boundary, with a chapter-owner exemption.
- Ordinary engine lines are disabled by `allowLines()` in conceal mode. This is
  not equivalent to revoking all engine permissions.

Sources:
[view/components.ts](https://github.com/lichess-org/lila/blob/39deb036f366f06b3149024728b5039846856455/ui/analyse/src/view/components.ts)
(`makeConcealOf`),
[treeView/columnView.ts](https://github.com/lichess-org/lila/blob/39deb036f366f06b3149024728b5039846856455/ui/analyse/src/treeView/columnView.ts),
and `StudyCtrl.canJumpTo`, `isChapterOwner`, and `AnalyseCtrl.allowLines` above.

**Reference limitation:** this checkout defines `ChapterRepo.setConceal` and
`removeConceal`, a `StudySocket.setConceal` event sender, and a client `conceal`
event handler. Searching the inspected server sources found no active callers
advancing/removing the boundary through those helpers. `StudyApi.setPath` and
`doAddNode` update shared position but do not advance concealment. Therefore an
automatic reveal-on-author-navigation lifecycle is **not established by this
snapshot**. Section 3 proposes an explicit PyChess lifecycle; do not present it as
verified current lichess behavior.

Sources:
[ChapterRepo.scala](https://github.com/lichess-org/lila/blob/39deb036f366f06b3149024728b5039846856455/modules/study/src/main/ChapterRepo.scala),
[StudySocket.scala](https://github.com/lichess-org/lila/blob/39deb036f366f06b3149024728b5039846856455/modules/study/src/main/StudySocket.scala),
and `StudyApi` above.

### 1.5 Interactive lesson: authoring

Lila calls an interactive lesson a **gamebook**. The existing move tree is the
lesson script:

| Authored data | Meaning during playback |
| --- | --- |
| First-child mainline | Expected learner moves and scripted opponent replies |
| Comment on the root/current position | Introduction, prompt, or explanation |
| Comment after a correct learner move | Feedback that pauses before the opponent reply |
| Comment on a wrong variation move | Feedback specific to that wrong move |
| `gamebook.hint` on a learner-to-move position | Optional hint shown on request |
| `gamebook.deviation` on the expected child move | Fallback explanation when another move is played |
| End of the authored mainline | Lesson completion, even without a game-ending result |

Only the mainline is correct in this implementation. Adding a second engine-good
variation does not make it a second accepted answer. The editor explicitly tells
authors to promote a variation if it is the correct move.

The deviation field's placement is easy to get wrong: the player is at position
P, the intended move is child C, and a wrong move W gets its own comment if present;
otherwise playback uses **C's** deviation text. The hint belongs to **P**.

Contributors see authoring guidance by default and can Preview the learner view.
Readers enter playback by default. Ordinary comments/shapes remain the underlying
annotations. Lesson-specific text is stored on root/branch nodes as
`Gamebook(deviation, hint)` and saved through `setGamebook` under contribution
authorization. The inspected `StudyApi.setGamebook` persists the change but does
not broadcast a dedicated canonical annotation update; PyChess should retain its
existing stronger synchronization conventions.

Sources:
[gamebookEdit.ts](https://github.com/lichess-org/lila/blob/39deb036f366f06b3149024728b5039846856455/ui/analyse/src/study/gamebook/gamebookEdit.ts),
[gamebookButtons.ts](https://github.com/lichess-org/lila/blob/39deb036f366f06b3149024728b5039846856455/ui/analyse/src/study/gamebook/gamebookButtons.ts),
[tree.scala](https://github.com/lichess-org/lila/blob/39deb036f366f06b3149024728b5039846856455/modules/tree/src/main/tree.scala)
(`Node.Gamebook`, root/branch serializers), and `StudyApi.setGamebook` above.

### 1.6 Interactive lesson: playback

`GamebookPlayCtrl` uses four feedback states: `play`, `good`, `bad`, and `end`.
The human's turn comes from the position and saved chapter orientation.

| Situation | Feedback/action |
| --- | --- |
| Learner to move on the script | Show prompt, optional hint, and solution control |
| Expected move, with continuation | Good move; wait for Next if there is a comment |
| Expected move without a comment | Automatically advance the opponent reply after a short delay |
| Wrong move with a specific/fallback explanation | Show explanation and Retry |
| Wrong move without an explanation | Automatically retry after a short delay |
| Authored mainline leaf | Completed; offer next chapter, play again, and analysis |

The current node's first comment supplies the playback text. The solution control
draws the expected move; it does not immediately play it. Retry returns to the
nearest mainline ancestor. The initial opponent move can also be scripted and
commented. Space handles next/retry/next chapter, and premoves have special handling.
There is also a guard treating a position whose parent is already off-mainline as
`end`; that is an implementation edge case, not evidence of branching lessons.

Playback disables normal computer evaluation, prevents Study recording via
`isWriting()`, and turns off sticky synchronization. It provides a dedicated lesson
panel and restricts navigation into unseen continuations. Author Preview and reader
Analysis are local overrides, not persisted changes to chapter mode. Readers can
switch to analysis after completion. Original shapes are copied for restoration
when temporary drawings are cleared.

Sources:
[gamebookPlayCtrl.ts](https://github.com/lichess-org/lila/blob/39deb036f366f06b3149024728b5039846856455/ui/analyse/src/study/gamebook/gamebookPlayCtrl.ts),
[gamebookPlayView.ts](https://github.com/lichess-org/lila/blob/39deb036f366f06b3149024728b5039846856455/ui/analyse/src/study/gamebook/gamebookPlayView.ts),
and `StudyCtrl.isGamebookPlay`, `instantiateGamebookPlay`, `setGamebookOverride`,
`isWriting`, `isCevalAllowed` above.

### 1.7 Scope and interchange boundaries

These modes provide a teaching experience, not secret answer storage. The inspected
tree JSON writer includes children and gamebook metadata. A permitted viewer can
inspect the downloaded data. PGN/export/clone permissions remain separate.

Lila's `PgnDump` emits `[ChapterMode "gamebook"]` for gamebooks. That tag alone
cannot preserve hints, deviation text, or the entire training configuration.
Do not claim lossless lichess lesson interchange based on that tag.

Source:
[PgnDump.scala](https://github.com/lichess-org/lila/blob/39deb036f366f06b3149024728b5039846856455/modules/study/src/main/PgnDump.scala).

## 2. PyChess integration map and gaps

| Area | Existing foundation | Required work |
| --- | --- | --- |
| Chapter storage | `StudyChapter`, drafts, per-chapter MongoDB documents | Mode, reveal boundary, compatible defaults, clone preservation |
| Chapter UI/HTTP | Creation form and chapter settings | Shared selector, learner side explanation, validation and broadcasts |
| Study DTOs | Full active chapter plus lightweight previews | Include mode in both; keep snapshot verification coherent |
| Shared analysis | `AnalysisExtension` and `AnalysisContext` | Runtime teaching policy, input/evaluation/lifecycle hooks |
| Tree | Opaque IDs, ordered children, root annotations | Lesson metadata at root and nodes; distinguish script from attempts |
| Navigation | `canActivatePath` hook and tree controller | Enforce policy across buttons, keys, charts, history and other entry points |
| Collaboration | REC/SYNC, operation queue, canonical revisions | Local training sessions, mode changes, lesson mutation reconciliation |
| Engine | Local Fairy-Stockfish analysis and readiness handshake | Bounded practice searches, structured results, grading and reply control |
| PGN | Browser exporter and normalized import contract | Explicit mode/lesson preservation; raw parser UI remains separate |

Read/edit locations for implementation:

- Models and persistence: [models.py](../server/study/models.py),
  [builder.py](../server/study/builder.py), [storage.py](../server/study/storage.py),
  [tree.py](../server/study/tree.py), [annotations.py](../server/study/annotations.py).
- Routes and protocol: [views/study.py](../server/views/study.py),
  [mutations.py](../server/study/mutations.py), [ws.py](../server/study/ws.py),
  [snapshot.py](../server/study/snapshot.py), [permissions.py](../server/study/permissions.py).
- Client state: [types.ts](../client/types.ts), [studyTree.ts](../client/study/studyTree.ts),
  [studySync.ts](../client/study/studySync.ts), [chapterNavigation.ts](../client/study/chapterNavigation.ts).
- UI: [studyView.ts](../client/study/studyView.ts),
  [studyChapterForm.ts](../client/study/studyChapterForm.ts),
  [commentEditor.ts](../client/study/commentEditor.ts), [movelist.ts](../client/movelist.ts).
- Analysis host: [analysisExtension.ts](../client/analysis/analysisExtension.ts),
  [analysisContext.ts](../client/analysis/analysisContext.ts),
  [analysisCtrl.ts](../client/analysis/analysisCtrl.ts),
  [analysisTreeCtrl.ts](../client/analysis/analysisTreeCtrl.ts),
  [analysisTree.ts](../client/analysis/analysisTree.ts).
- Interchange: [studyPgn.ts](../client/study/studyPgn.ts),
  [studyPgnImport.ts](../client/study/studyPgnImport.ts).

Concrete traps found in the current source:

1. `AnalysisContext.AnalysisMode` already names the host context (`study`, `puzzle`,
   etc.). Use a separate `StudyChapterMode` type; do not overload that enum.
2. `canActivatePath` only guards selected navigation paths. In
   `AnalysisTreeController.activateTreePath`, `userNavigation=false` bypasses it.
   Loading, moves, shared positions, and resets need deliberate trusted entry points.
3. `onNodeAdded` fires only for new nodes, not when selecting an existing child.
   Lesson grading must also run when a learner plays an already-authored move.
   `onPathChanged` currently fires before `goPly` refreshes the board: it is not a
   safe stand-in for a completed-position callback.
4. The practice engine cannot just listen to the displayed PV. `onFSFline` parses
   evaluation lines and ignores unmatched lines, including ordinary `bestmove`
   output. `engineGo` uses the analysis depth/time settings, not a practice budget.
   Its legality check rejects some stale PVs, but a stale move can also be legal in
   the new position. Reply execution needs stricter search ownership.
5. Chapter navigation reuses the controller/engine, replaces model fields, verifies
   HTTP/WS snapshots, then restores shared or remembered paths. Training policy must
   be installed before any restoring path or engine starts revealing answers.
6. Tree mutations reconstruct `StudyTree` in several places. Adding a root field
   only to deserialization will silently lose it on later edits. Audit every
   reconstruction, clone, clear action, merge, and import conversion.
7. Chapter metadata updates currently increment chapter revision for description
   changes, while previews carry orientation/name. Mode changes need an explicit
   revision/broadcast contract, not only a new form field.

## 3. Recommended PyChess behavior and data contract

These are proposed implementation defaults, including intentional differences from
lila. They make the tasks actionable; adjust a decision here before implementing a
different behavior.

### 3.1 Stored fields

Use one validated chapter discriminator rather than three competing flags:

```ts
type StudyChapterMode = 'normal' | 'practice' | 'conceal' | 'gamebook';

// Proposed chapter DTO additions.
type StudyChapterTeaching = {
    mode: StudyChapterMode;
    concealPly?: number;
};

// Proposed optional root/node lesson metadata, separate from normal comments.
type StudyGamebook = {
    hint?: string;
    deviation?: string;
};
```

Use `mode` in storage and full/lightweight chapter payloads; missing stored mode
means `normal`. Missing mode in an existing chapter edit request means preserve it;
missing mode in creation means `normal`. Reject unknown values in writes.

For PyChess, define `concealPly` as **depth from the chapter root**, with root depth
0. This intentionally differs from lila's absolute FEN ply. Compute it from parent
links, not FEN move numbers, color alternation, SAN, or compact UCI path lengths.
Store it only for conceal mode, validate an integer within the mainline's depth,
and treat a missing boundary in a concealed chapter as 0. Document the representation
in both model and DTO code.

Add `gamebook` to tree nodes and `rootGamebook` to the root DTO/model. Preserve lesson
metadata when changing chapter mode; authors can temporarily use normal analysis
without losing their script. Empty text removes the field. Reuse existing text
sanitization and comment-length bounds; include new data in encoded chapter limits.
The canonical tree structure/order remains the source of the expected line.

Do not store learner paths, wrong attempts, engine replies, hint visibility, retry
counts, Preview/Analysis overrides, timers, or completion state in chapter documents.

### 3.2 Author/player roles, REC and SYNC

Use `canWrite` for authoring, including a full-tree author view in concealed chapters.
This differs from lila's concealment exemption for the chapter creator specifically;
it matches PyChess's current chapter-management permissions.

| Session | REC | SYNC | Tree/tool behavior |
| --- | --- | --- | --- |
| Normal analysis | Existing preference | Existing preference | Existing behavior |
| Conceal author view | Existing preference | Existing preference | Full tree, concealed-region indicators |
| Conceal reader | No persisted edits | May follow presenter | Hidden future, local exploratory moves |
| Interactive lesson authoring | Existing preference | Existing preference | Script tree and lesson editor |
| Interactive lesson play/Preview | Effectively off | Effectively off | Local attempt and lesson panel |
| Computer practice play | Effectively off | Effectively off | Local moves/replies and practice feedback |

Contributors open interactive lessons in authoring mode; readers start at the root
in playback. Preview explicitly starts a fresh attempt at the root. Practice chapters
start a local practice session at the root for readers and contributors; contributors
get an explicit Edit chapter/Return to analysis action to author the position/tree.
Conceal readers start at the root unless an allowed shared position is being followed.

Keep saved REC/SYNC preferences separate from their effective training values. Before
entering play, flush the comment editor and settle queued authorized writes. Entering
training is not the same as clearing pending edits. On exit, discard local attempts,
reload a verified authoritative chapter, then restore preferences if still permitted.
Never let engine replies or preview moves become saved by switching REC back on.

Training should still receive access revocation, deletion, and chapter-content events.
Content/orientation/mode changes invalidate the attempt: cancel callbacks, reload,
show a short restart message, and start under the new policy. Membership changes
recompute author/player rights. Shared presenter navigation does not pull an active
lesson/practice attempt elsewhere.

### 3.3 Concealment and reveal lifecycle

Proposed behavior, independent of the missing lila server transition:

- Enabling concealment starts with boundary 0. If this is the shared chapter, reset
  the shared path to the root in the same serialized operation.
- A contributor publishing a shared **mainline** position through REC+SYNC advances
  the boundary to `max(oldBoundary, publishedDepth)`. Local browsing with SYNC off
  and side-variation publication do not advance it.
- Add an author action **Hide moves again** that resets boundary and shared path to
  the root. Backward navigation alone does not conceal already revealed moves.
- Broadcast and persist boundary changes through the existing Study sequencer.
  Reloaded viewers see the same boundary. A reader playing an expected move locally
  reveals that path only for themselves and does not update the stored boundary.
- In the reader move list, show revealed mainline and the current attempted path;
  omit unrevealed variations, their comments, NAGs, and fork choices. The reader
  can explore legal alternatives from visible positions without correct/wrong grading.
- If a mainline edit changes the revealed sequence, reset the boundary to the last
  unchanged mainline prefix, or root if none remains. Clamp paths/boundaries after
  deletion and clear-variation operations. A fresh clone resets reveal progress to 0.

Offer an author Preview using the reader policy without changing permissions or
shared state. Reset is an explicit operation; it must not be inferred from ordinary
navigation backward.

### 3.4 Engine permissions, results, and variant support

Recommended first release: preserve PyChess's computer-analysis audience permission
for practice too. If disallowed, show why practice cannot start; do not silently
broaden access when an author changes chapter mode. This differs from lila's practice
override. Also retain PyChess's active-game anti-cheat restriction, including changes
while a practice search is running.

The practice engine is browser-local. Fishnet's queued chapter analysis, minimum
line length, account budgets, and persisted analysis annotations are unrelated to
live replies. Practice must work with an empty saved tree and a valid initial FEN.

Hide engine PVs, evaluation charts, score/mate annotations, and automatic engine
arrows during lesson play and conceal-reader play. Lesson play needs legal-move
validation but no search engine. Computer practice uses internal evaluations and
controlled hint/feedback output; hide ordinary PVs and unsolicited best-move arrows.
Explicitly entering permitted analysis restores the normal tools.

Use Fairy-Stockfish/ffish and the saved variant snapshot for legal moves, move
encoding, SAN, side to move, and outcomes. In particular:

- Do not assume an 8x8 board, alternating colors from depth parity, four-character
  coordinate moves, ordinary promotions/castling, or checkmate as the only win.
- Route learner moves, drops, promotions, and engine replies through the same
  validated move-application pipeline. Match against canonical legal move encoding,
  not display SAN or board-animation coordinates.
- Hints must support drops, gating and unusual move representations; a text move
  hint is an acceptable fallback when a single ordinary arrow is inadequate.
- Query game-end/draw semantics with the full relevant move history. A FEN-only
  reconstruction loses repetition context. Do not copy lila's literal 50-move FEN
  check or label every variant win as checkmate.
- Treat evaluation-based grading as approximate. Reuse/test PyChess's evaluation
  perspective conventions; lila's numerical thresholds are an initial tuning
  reference, not proven calibration for every variant.
- Gate practice on actual browser engine support, snapshot loading, readiness, and
  permissions. A working ffish legal-move board does not guarantee the search engine
  supports the same variant. Show unavailable/retry states instead of a spinner
  that never ends. Keep two-board chapters out of scope.

For implementation, use the
[Fairy-Stockfish debugging skill](../.agents/skills/fairy-stockfish-debugging/SKILL.md)
and its variant-standard references when validating these engine contracts.

### 3.5 Lesson authoring and completion rules

Use the authored preferred mainline as the single correct script. Wrong variations
are feedback examples, including engine-equal alternatives. Forced-variation display
flags must not accidentally redefine correct answers: use one tested canonical
mainline helper consistently for authoring, playback, and validation.

Select the first nonempty comment in persisted order for lesson text, matching
lila's single-comment presentation closely. Keep existing comment IDs/authors intact.
Expose hint at the learner-to-move position and fallback deviation at the intended
child. Authoring guidance must explain that placement and provide a shortcut to
edit the corresponding ordinary comment.

At the first release, support one expected line, scripted opponent replies, optional
hints, move-specific/fallback wrong feedback, Retry, View solution, Play again,
Next chapter, and Analysis after completion. A solution hint does not count as
playing the move. Mainline exhaustion completes a nonempty lesson; an empty root
gets an explicit “This lesson has no moves yet” state rather than a success screen.

Keep learner color fixed to the saved orientation during the attempt. A visual
board flip does not transfer control to the other side. Use the same rule for
PyChess practice, a deliberate difference from lila's bottom-color practice behavior.

Warn authors about missing continuations and lessons ending after an opponent move,
but allow explanations and deliberately short lessons. Do not require engine analysis
to approve a lesson. Multi-answer correctness, branching successful endings,
randomized replies, graded scores, and persistent course progress are later features.

### 3.6 Exports, embeds, and destructive annotation actions

Native clone must preserve mode, tree lesson metadata, orientation, and rules;
reset conceal reveal progress and local attempt state. Update normalized import and
Add to Study conversions wherever they round-trip the new metadata.

Before exposing lesson authoring, define a versioned PyChess PGN extension for
mode/root/node lesson text and implement export plus normalized-import preservation.
Reserve `[ChapterMode "gamebook"]` compatibility, but document that other programs
may discard teaching extensions. Validate encoding, sizes, brace/newline escaping,
and malformed input. This does not require completing the separate raw PGN UI.

Define Clear annotations to remove ordinary annotations **and** hint/deviation text,
with confirmation explicitly mentioning lesson instructions. Clear variations
removes wrong-answer branches but keeps mainline lesson metadata. Switching to normal
mode preserves lesson data. A lesson author's export uses the canonical script;
never silently export temporary wrong attempts as the saved lesson.

For embeds, use the reader policy for concealment and interactive lessons. If the
compact shell cannot host computer practice, show the root with an explicit link to
open practice in the full Study. Do not fall back to displaying the complete lesson
solution tree. Existing visibility/share/export/clone permissions still apply.

## 4. Implementation tasks, in recommended order

Each numbered task is a reviewable change with its own completion criterion. Check
it off only after its behavior and relevant tests pass. Proposed new filenames are
suggestions; existing file links above are the concrete integration points.

### A. Common mode infrastructure

- [x] **A1 — Chapter schema and payloads.** Add validated mode and conceal boundary
  to models/drafts/storage/full payloads/previews/types. Cover every chapter creation
  path, clone, export-data, metadata edit and snapshot fingerprint. Preserve old
  chapter/edit defaults. Mode changes bump chapter revision and trigger an
  authoritative reload; identical edits are idempotent. Add model/storage/HTTP/WS
  tests for all values, invalid input, old documents, and permission failures.
  **Done:** old chapters remain normal and mode survives a server reload/clone.
- [x] **A2 — Effective session policy.** Add `studyMode.ts` (suggested) to derive
  author/play/preview behavior, allowed tools, recording, synchronization and start
  path from stored mode, permissions and local override. Test the matrix in 3.2,
  active-game restrictions, and revoked permissions. Avoid spreading raw mode
  checks across the large `studyView.ts`.
  **Done:** one policy answers whether an action is allowed without changing saved
  REC/SYNC preferences.
- [x] **A3 — Analysis host seams and lifecycle.** Extend `AnalysisExtension` only
  where needed: before user move application, after completed move/position change,
  board input policy, evaluation delivery, visible-tree policy and cleanup. Supply
  explicit navigation origins for user browsing, played move, scripted/engine reply,
  shared position and reset. Keep the plain analysis host behavior unchanged when
  no extension is installed. Add a session generation and cancellation cleanup.
  **Done:** existing-child moves are observable and every navigation/move route
  follows the intended policy; normal analysis and puzzles still work.
- [x] **A4 — Forms and safe activation.** Add one shared translated Analysis mode
  selector to initial/add/edit chapter flows, explanatory text and learner-side
  labels. Install policy before navigation or evaluation rendering. Settle pending
  writes before mode/session transitions and reload before restoring recording.
  Expose only modes whose runtime stage is complete; do not advertise an unfinished
  mode as functional.
  **Done:** two connected clients agree after a mode/orientation edit without
  accidental writes, answer flashes or stale engine activity.

Dependencies: A1 and A2 precede A3/A4 integration. Concealment can ship once A and B
are complete; it need not wait for computer practice.

### B. Hide next moves

- [x] **B1 — Reveal state protocol.** Implement 3.3 in shared-position publication
  and a dedicated reset operation. Serialize authorization, boundary/path persistence,
  revisions, and broadcasts together. Include root/custom-FEN depth, stale updates,
  non-mainline publication, edits, deletion and reconnect cases.
  **Done:** only authorized presentation advances the shared boundary; reset and
  late joiners get deterministic state.
- [x] **B2 — Reader presentation and exploration.** Add `studyConceal.ts`
  (suggested) and filtered move/fork/comment rendering. Block unseen navigation from
  keyboard, wheel, chart, context menu, move number, URL/history, remembered path,
  and auto-advance. Allow legal attempted moves, matched stored moves and backward
  exploration. Suppress unsolicited evaluations/solution hints. Implement author
  indicators and reader Preview.
  **Done:** readers can try moves without learning the next SAN from another UI
  surface; their guesses do not modify the chapter or shared reveal state.
- [x] **B3 — Multi-client acceptance.** Exercise owner, write member, reader,
  anonymous public viewer and embedded reader with REC/SYNC combinations. Test
  present/reveal/back/reset/rejoin and chapter switches with browser history.
  **Done:** browser tests verify rendered omission and allowed navigation, while
  database assertions verify guesses do not persist.

### C. Interactive lesson data and editor

- [x] **C1 — Lossless root/node metadata.** Add bounded canonical `gamebook` data
  to Python and TypeScript representations and all tree conversions. Audit each
  `StudyTree(...)` reconstruction, merge, ID remap, clone, clear action and PGN
  conversion. Add `study_set_gamebook` using existing mutation acknowledgments,
  operation IDs, revisions and canonical broadcasts. A queued save captures
  chapter ID, path, field and value when edited; it must not resolve the current
  path later. Test duplicate-node reconciliation and a deleted target.
  **Done:** two contributors see the same hint/deviation; unrelated tree edits
  never erase root metadata or save text on a different node.
- [x] **C2 — Editor and instructional guidance.** Add `studyGamebookEdit.ts`
  (suggested), borrowing the small lila editor workflow. Integrate ordinary comment
  editing, expected-mainline guidance, optional hint, fallback deviation, wrong
  variation explanation and Preview. Add empty-script warnings and keyboard labels.
  Implement the agreed clear-annotation behavior and PGN preservation from 3.6.
  **Done:** an author can create a lesson with introduction, correct feedback, a
  specific wrong-answer explanation, fallback explanation and hint, then reload or
  clone it without loss.

Dependencies: A precedes C. C1/C2 can be implemented independently of B, but expose
Interactive lesson only with D completed.

### D. Interactive lesson player

- [x] **D1 — Deterministic playback controller.** Add `studyGamebookPlay.ts`
  (suggested) with explicit prompt, correct-feedback, wrong-feedback, opponent-wait,
  complete and unavailable states. Use a stable authored script plus disposable
  attempt state. Grade canonical played moves, not just node additions. Implement
  first opponent move, comment pauses, guarded delays, hint/solution, retry, replay,
  next chapter and completion. Capture generation/chapter/path in every delayed
  action and cancel on switch/retry/destroy. Do not accept a move simply because it
  became first child in a locally extended tree.
  **Done:** pure controller tests cover all transitions without real timers or an
  engine search, including empty/final roots and repeated wrong attempts.
- [x] **D2 — Lesson view and controlled board input.** Add the lesson panel,
  one-side input, accessible feedback/controls and safe variant move hints. Prevent
  move-tree/PV/chart/menu/keyboard disclosures and preserve author drawings when
  temporary hints are cleared. Integrate Preview/author return and reader Analysis
  after completion. Prevent rapid clicks or premoves from applying multiple replies;
  if premoves are unsupported initially, explicitly disable them during playback.
  **Done:** the dedicated lesson panel now owns learner feedback and controls, restricts
  board input to the learner side, disables premoves, blocks ordinary tree/navigation
  disclosures, keeps solution auto-shapes separate from authored drawings, supports
  variant-board coordinates, author Preview return, and reader Analysis after completion.
  Focused adapter tests cover mouse/button and keyboard continuation paths plus input,
  navigation, drawing, and completion guards.
- [x] **D3 — Collaboration and variant acceptance.** Test wrong existing variation,
  wrong new move, expected existing move, black learner, opponent-to-move start,
  promotion, drop and nonstandard board geometry. Run simultaneous independent
  attempts while a contributor edits/reorders/deletes the script, changes mode or
  orientation, and revokes access. Verify reconnect/retry and completion in the last
  chapter. Check no preview/learner move or hint alters DB tree/revisions/shared path.
  **Done:** learner/Preview attempts remain local and independent; remote script edits,
  promotions or deletions freeze input and reload the authoritative chapter before
  play can continue. Existing reload/access/reconnect guards cover mode, orientation
  and membership changes, while focused playback tests cover black-side learning,
  opponent-first starts, promotion, drops, nonstandard boards and last-chapter finish.
  Interactive lesson is now exposed by the shared chapter-mode selector.

### E. Computer practice

- [x] **E1 — Reusable bounded engine adapter.** Add `analysisPracticeEngine.ts`
  (suggested) over the existing engine. Preserve parsed nodes/time and expose
  structured score/PV/bestmove events with search ownership. Run one bounded search
  at a time, synchronize stop/drain/new-position, and tag client session/search
  generations. UCI output does not itself carry those tags: define the protocol
  barriers that ensure an old response cannot be assigned to a new search.
  Handle final `bestmove`, no legal move, timeout, unsupported rules, permission
  changes and browser teardown. Do not create a second uncoordinated global engine.
  **Done:** the adapter accepts the existing engine transport instead of creating a
  worker, clamps every nodes/movetime/depth request plus a wall-clock timeout, emits
  tagged structured info/bestmove/unavailable events, and requires both the stopped
  search's final `bestmove` and an `isready`/`readyok` drain before launching the next
  position. Deterministic protocol tests reject stale replies that are legal in both
  positions, including rapid same-FEN/session resets, and cover terminal bestmove,
  timeout, drain failure, support/permission changes, engine errors, and teardown.
- [ ] **E2 — Practice session and engine replies.** Add `studyPractice.ts`
  (suggested) with initializing, human-turn, engine-thinking, paused, ended and
  unavailable states. Start at the root, control the opposite side, validate and
  apply exactly one engine reply, and retain full attempt history for outcomes.
  Implement reset, pause/resume/browse and permitted return to normal analysis.
  Training uses local state and never queues Study edits or Fishnet work.
  **Done:** engine play works from a FEN-only chapter for either learner color;
  chapter switch, anti-cheat change and terminal positions stop play correctly.
- [ ] **E3 — Hints and move feedback.** Evaluate parent and resulting position
  with a defined budget before comparing scores. Handle insufficient information
  without inventing a verdict. Add approximate good/inaccuracy/mistake/blunder
  feedback, alternative-best-move explanation, retry-best-move action and escalating
  hints. Cover mate scores, perspective reversal, immediate variant wins/draws,
  promotion/castling aliases and drops. Use variant-aware outcome text.
  **Done:** deterministic score fixtures and move fixtures verify feedback, while
  live-engine checks establish that actual output reaches the same path.
- [ ] **E4 — Browser acceptance and resource bounds.** Verify a real supported
  browser engine, slow initialization, disabled computer permission, active-game
  blocking, engine failure, custom rules, rapid chapter switching and repeat reset.
  Ensure stable worker/listener/ffish-board counts and no engine activity after exit.
  Test multiple variant families and an unsupported variant's explicit fallback.
  **Done:** normal analysis settings are restored and no practice attempt reaches
  the persisted tree or server-analysis queue.

Dependencies: A precedes E. E1 is the largest technical uncertainty and can be
prototyped early; ship practice only after E2–E4. C/D do not depend on E.

### F. Release and documentation

- [ ] **F1 — Full interaction review.** Run the acceptance matrix below for every
  enabled mode. Confirm embed and export behavior, translated messages, light/dark
  themes, small screens, keyboard focus and screen-reader feedback. Use the
  [CSS debugging skill](../.agents/skills/pychess-css-debugging/SKILL.md) for actual
  styling changes, including served stylesheets and browser computed styles.
- [ ] **F2 — Deployment compatibility.** Deploy tolerant readers/preserving writers
  before enabling creation of new mode/lesson data. Test documents without the new
  fields and an existing client submitting older forms. Plan an enabled-modes switch
  for staged exposure; do not use a pre-support server as a routine rollback once
  lesson data exists, because old deserialization/reconstruction may drop fields.
  Rollback should disable feature entry while keeping the schema-preserving code.
  Snapshot representative chapters before any future bulk migration; this design
  requires no eager production backfill.
- [ ] **F3 — Update feature documentation.** Move shipped behavior into
  [Study.md](Study.md), mark completed tasks here, record remaining deliberate lila
  differences and unsupported variants, and add author-facing lesson instructions.
  Keep `/practice` courses, multiple accepted answers and raw PGN UI tracked separately.

## 5. Verification matrix and commands

Use focused fixtures, not a full Cartesian product of all variants and settings.
For each behavior-sensitive axis, include at least one case that would expose an
incorrect assumption:

| Axis | Required representative cases |
| --- | --- |
| Access | Owner, writer, reader, anonymous public viewer, denied private viewer |
| Permission refresh | Computer denied, writer demoted, member removed, visibility changed |
| Chapter entry | Fresh load, in-place switch, URL/history, reconnect, last chapter |
| Root | Standard start, nonzero FEN move number, black to move, empty script, terminal position |
| Tree | Mainline, existing wrong variation, novel attempt, forced variation, promotion/deletion |
| Moves/rules | Standard/960, drop variant, promotion family, large board, saved custom rules |
| Controls | Mouse, keyboard, wheel, chart, context menu, premove/double action |
| Concurrency | Two readers solving independently, author edit during timer/search, stale snapshot |
| Lifecycle | Retry/reset, mode change, permission change, page exit, engine stop/restart |
| Presentation | Desktop/mobile, themes, embed, no answer flash, focus and announced feedback |
| Persistence | Reload/clone/export round-trip, local attempts absent from DB/shared navigation |

Extend existing `tests/test_study_models.py`, `test_study_storage.py`,
`test_study_tree.py`, `test_study_mutations.py`, `test_study_ws.py`,
`test_study_workflows.py`, `test_study_permissions.py`, `test_study_import.py`,
`test_study_export.py`, and `test_study_gui.py` as appropriate. Reuse
`studyTree.test.ts`, `studySync.test.ts`, `studyChapterNavigation.test.ts`, and PGN
tests. Add focused controller/protocol tests such as `studyModes.test.ts`,
`studyConceal.test.ts`, `studyGamebook.test.ts`, and `studyPractice.test.ts`.

Follow [AGENTS.md](../AGENTS.md) and the
[testing skill](../.agents/skills/pychess-testing/SKILL.md) for each implementation
change. The repository instructions require these frontend checks:

```bash
yarn lint
yarn typecheck
yarn md
yarn test
```

Full Node CI also includes `yarn dev`; run all five for that gate and build before
browser verification. Python/server changes additionally require:

```bash
uv run ruff format --target-version py313 .
uv run ruff check .
uv run pyrefly check
```

Run targeted Python modules through `uv run`, with `PYTHONPATH=server:tests` for
direct unittest selection, and relevant Study browser tests. Shared analysis-host
changes also require existing standalone analysis/puzzle browser coverage. Reserve
full Python discovery for broad/shared changes or insufficient targeted coverage;
when selected, include the pytest-only Simul suite and use the documented shards
in a Python 3.13 sandbox. Tournament coverage is needed only where shared changes
can affect it.

This document itself changes no runtime code or rendered application. Its validation
is source/reference and Markdown/diff review; implementation and browser test results
must be recorded with the individual future tasks.
