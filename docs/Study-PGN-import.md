# Study PGN import

This document tracks the client-side Study PGN parser/importer work and serves as a
handoff for continuing the implementation in a later development session. The stable
user-facing Study documentation remains in [Study.md](Study.md); this file records the
architecture decisions, completed compatibility work, remaining audit checklist, and
recommended next steps.

Status: **core parser/import workflow implemented; real-world Lichess compatibility and
semantic parity audit in progress**.

## Goals and architecture

The importer is intended to accept both ordinary analyzed PGNs and multi-game PGNs such
as exported Lichess Studies while preserving as much Study structure as the source
format contains.

The chosen architecture is deliberately split into two layers:

1. [studyPgnParser.ts](../client/study/studyPgnParser.ts) is a pure TypeScript,
   variant-neutral structural PGN parser. It understands PGN syntax, comments, NAGs,
   recursive annotation variations (RAVs), tags, results, and multiple games, but treats
   move/SAN tokens as opaque strings.
2. [studyPgnImport.ts](../client/study/studyPgnImport.ts) replays every parsed branch with
   Fairy-Stockfish in the browser. Fairy-Stockfish is authoritative for variant-aware
   SAN resolution, legal moves, FENs, and custom-variant behavior. The normalized tree is
   then validated again by the server before persistence.

This separation is important for PyChess Variants. A generic PGN parser should not need
hard-coded assumptions about 8x8 chess, piece letters, drops, fairy pieces, or custom
variants. Fairy-Stockfish already owns those rules.

The importer does **not** build on `ffish.readGamePGN()`. That lightweight reader is useful
for mainline-only use cases but discards the recursive variations and annotations needed
by Study. Lila is used as the main reference for Study import semantics and edge cases,
while the desktop PyChess PGN parser was useful as a reference for the basic scanner /
recursive-parser shape.

Keeping the expensive work client-side also avoids turning large PGN imports into extra
server CPU/memory load on the production Heroku dyno.

## Main source and test files

| Area | Files |
| --- | --- |
| Structural parser | [studyPgnParser.ts](../client/study/studyPgnParser.ts) |
| Replay/normalization/import API | [studyPgnImport.ts](../client/study/studyPgnImport.ts) |
| PGN export / PyChess extensions | [studyPgn.ts](../client/study/studyPgn.ts) |
| Study chapter/new-Study import UI | [studyChapterForm.ts](../client/study/studyChapterForm.ts) and Study creation code |
| Parser tests | [studyPgnParser.test.ts](../tests/studyPgnParser.test.ts) |
| Import/replay tests | [studyPgnImport.test.ts](../tests/studyPgnImport.test.ts) |
| Round-trip tests | [studyPgnRoundTrip.test.ts](../tests/studyPgnRoundTrip.test.ts) |
| Export tests | [studyPgn.test.ts](../tests/studyPgn.test.ts) |
| Interactive lesson behavior | [studyGamebookPlayback.test.ts](../tests/studyGamebookPlayback.test.ts) and related gamebook tests |

## Current parser safety limits

The browser parser currently rejects input beyond these defaults:

- 8,000,000 input characters
- 64 games/chapters
- 3,000 move nodes per game
- variation nesting deeper than 64

These limits are intentionally enforced before server validation so pathological input
cannot make the browser do unbounded work.

## Completed work

### 1. Full structural client-side parser

Implemented a standalone parser that supports:

- tag pairs, including escaped tag values;
- brace comments and semicolon-to-end-of-line comments;
- numeric NAGs and common symbolic NAGs;
- tolerant move-number forms such as `1.`, `1...`, and `1.e4`;
- opaque move tokens suitable for Fairy-Stockfish variants;
- arbitrarily nested RAVs up to the configured safety limit;
- game results;
- multiple games in one PGN document;
- comments before the first move/root comments;
- useful line/column parse errors;
- BOM and PGN `%` escape-line handling.

The parser itself performs no chess legality or SAN interpretation.

### 2. Fairy-Stockfish replay and duplicate-variation merging

Every parsed branch is replayed through the appropriate Fairy-Stockfish WASM module.
Duplicate RAV branches are merged only **after** they resolve to the same legal engine
move, rather than comparing SAN text. This is important for variant notation and mirrors
Lila's Study behavior: the first/mainline occurrence keeps its ordering while later
copies contribute unique children and annotations recursively.

Both ordinary Fairy-Stockfish and the separate Alice module are selected per imported
game when required.

### 3. Existing-Study PGN paste import

The New chapter dialog has Setup / PGN sources. Pasted PGN is parsed and normalized in
the browser, submitted through the batch import endpoint, and the last imported chapter
is opened in-place. Parser, replay, and server-validation failures stay in the dialog.

### 4. Local `.pgn` file loading

The same PGN tab accepts a local `.pgn` file via `FileReader`. The file contents are put
through exactly the same parser/replay path as pasted text.

### 5. Create a new Study directly from PGN

The first-chapter/new-Study dialog also supports PGN input. A multi-game PGN can create
the Study and all initial chapters in one workflow. Creation is rollback-safe: a failed
later chapter must not leave a partially imported new Study behind. Existing Study quota
and chapter-capacity validation still applies.

### 6. Round-trip hardening

Added export -> parser -> Fairy-Stockfish import regression coverage for combinations of:

- recursive variations;
- root and move comments;
- NAGs;
- arrows/circles;
- clocks and evaluations;
- FEN starts;
- Crazyhouse drops;
- multiple chapters;
- move-less chapters;
- Study/gamebook metadata and PyChess extensions.

Clock parsing accepts `H:MM:SS(.sss)` as well as Lichess-compatible `H:MM` and `H:MM.SS`
forms, including comma fractional seconds.

A first Study move marked `forceVariation` is exported as the mainline rather than as an
invalid root RAV, because PGN has no preceding move that such a variation could vary.

### 7. `[%emt]` and clock reconstruction

Lichess-style elapsed move time is consumed during import. For simple `TimeControl`
values (`seconds` or `seconds+increment`), both root clocks are initialized from the time
limit and missing move clocks can be reconstructed as:

`previous clock - elapsed move time + increment`

An explicit `[%clk ...]` remains authoritative. An explicit clock can also become an
anchor for later `%emt` reconstruction. Variations keep independent clock states.
Unsupported multi-stage controls such as `40/7200:3600` are preserved as tags but are not
guessed.

### 8. External comment attribution

Lichess `[Annotator "..."]` and per-comment `[%anno ...]` metadata are preserved as
**source attribution** separately from authenticated PyChess comment authorship. This
prevents imported text from impersonating a PyChess account while retaining provenance
for display and re-export.

### 9. External variant-name compatibility

Common human-readable/Lichess `Variant` values are normalized to PyChess/Fairy-Stockfish
keys before replay while retaining the original tag as metadata. Covered aliases include
Standard / From Position, King of the Hill, Three-check, Racing Kings, and common
Fischer-random/960 spellings.

### 10. Comment coalescing

Multiple imported comments on the same position from the same external author are
coalesced in order. Comments from different authors stay separate. The same rule is
applied after duplicate-variation merging.

### 11. Variant SAN suffix tolerance

Real Lichess Study exports exposed notation differences where Lichess includes a trailing
check/mate suffix but Fairy-Stockfish's canonical SAN does not (for example Atomic
`Qh5+` and a Racing Kings goal-rank `Kd8#`). Import still tries an exact engine SAN match
first; only if that fails does it retry while ignoring a trailing `+`, `++`, or `#`.
The stored Study SAN remains Fairy-Stockfish's canonical SAN.

### 12. Restore `StudyName`

When all games in a multi-game PGN contain the same `StudyName`, creating a brand-new
Study restores that name if the user left the generated `<username>'s Study` title
unchanged. A name explicitly entered by the user always wins. Importing into an existing
Study never renames it.

### 13. Recover chapter orientation when possible

PyChess's own exports include an explicit `Orientation` tag and therefore round-trip
exactly. Lichess's default Study PGN export omits orientation, so the original setting is
not always recoverable. In that case the importer follows the useful parts of Lichess's
automatic-orientation behavior:

- finished games face White;
- normal analysis chapters face the side to move at the end of the preferred mainline;
- interactive/gamebook chapters with a visible root prompt face the root side to move;
- other interactive/gamebook chapters face the player who made the final authored
  mainline move;
- conceal chapters keep the initial side to move;
- move-less interactive chapters keep the root side to move because no learner move
  exists from which to infer an orientation.

### Additional fix found during real-study testing: comment-only gamebook chapters

Some exported Lichess Studies use chapters with no moves at all, only a root comment
(e.g. introductory/title chapters). The importer was already preserving those comments,
but playback classified the resulting gamebook as an empty/unavailable lesson. Playback
now treats a valid root-only gamebook as the normal completed/end state so the comment is
rendered and the usual next/replay/analysis controls remain available.

### Additional fix found during semantic audit: root-prompt gamebook orientation

Lichess's default Study PGN export does not include chapter orientation. The existing
Lichess-style final-mainline-mover heuristic works for lessons that begin with a scripted
opponent move, but it mis-oriented Lichess's own exported lesson example: its instruction
is a root comment asking White to play `1.e4`, while the even-length mainline ends with a
Black move. For gamebooks without an explicit Orientation and without a finished-game
result, a visible root comment now acts as a signal that the learner is the root side to
move. Lessons whose first prompt follows a scripted opponent move have no root prompt and
continue to use the final-mainline-mover heuristic.

## PyChess-specific lossless extensions

PyChess Study export has extensions for information ordinary PGN cannot fully express,
including exact variant keys/custom INI, chapter descriptions, exact chapter mode,
conceal boundaries, gamebook hint/deviation data, root NAGs, and both root clock values.
See [Study.md](Study.md#pgn-and-interchange) for the authoritative user-facing list.

Ordinary PGN software may discard those extensions. Lossless PyChess -> PyChess Study
round trips therefore require the PyChess extension tags/comments to survive.

## Real-world compatibility corpus used so far

The development pass has exercised exported PGNs from these Lichess Studies (kept as
local test inputs, not committed wholesale as repository fixtures):

- **Rook Endgames You Must Know!** — many chapters, interactive/gamebook material,
  FEN positions, and several comment-only introductory chapters;
- **Lichess Lesson Example** — compact lesson/gamebook example;
- **The Guide to Variants** — chapters covering Standard, King of the Hill, Three-check,
  Antichess, Atomic, Racing Kings, Chess960, Horde, and Crazyhouse;
- **Instructive ZH Positions** — annotation-heavy Crazyhouse positions with comments,
  shapes, NAGs, and many move/root clocks;
- **CWC 2020 Puzzles** — 50+ Crazyhouse chapters, mostly interactive/gamebook material.

When a real-world incompatibility is found, prefer reducing it to a small synthetic
regression fixture rather than committing an entire third-party Study export.

## Remaining compatibility checklist

The core feature is implemented. Remaining work should be driven primarily by concrete
semantic differences found in real PGNs rather than by adding speculative metadata.

### A. Real-study semantic parity audit — **in progress**

Compare imported chapters from the current real-study corpus with their Lichess source,
looking for information that imports successfully but lands on the wrong position or is
rendered differently. Check especially:

- root comment vs move comment placement;
- arrow/circle placement;
- root vs move evaluations;
- root vs move clocks;
- NAG placement;
- preferred-mainline/variation ordering;
- chapter mode and gamebook behavior (including root-prompt vs scripted-opponent orientation);
- FEN/root-position handling;
- chapter tags and description-like metadata.

The current corpus now parses/replays cleanly and has been mechanically audited for these
annotation classes. That pass found and fixed the root-prompt gamebook orientation loss
described above. Continue this item with position-by-position semantic comparison against
the Lichess source, because silent semantic loss is now more likely than syntax/replay
failure.

### B. Interactive/gamebook metadata parity

Audit real lesson exports for feedback/control metadata and verify that:

- correct/incorrect/deviation branches retain the intended comments;
- hints/deviation text are attached to the intended position;
- terminal lesson positions reach the same end-state behavior;
- retry/solution behavior is not accidentally changed by import;
- root-only lesson chapters remain valid.

Only implement Lichess-specific directives after finding a real example that the current
importer loses or misinterprets.

### C. Root-node annotation audit

Add explicit import/round-trip cases for every annotation type that is meaningful on the
root position, especially comments, circles/arrows, clocks, evaluations, and PyChess root
NAG extensions. Root positions are an easy place for otherwise-correct move-oriented code
to lose metadata.

### D. Chapter metadata audit

Verify real-world handling of chapter name, Study name, FEN/SetUp, variant, orientation,
mode, player/result data, Event/Site/Date, and other tags. Preserve tags even when PyChess
does not interpret them. Infer behavioral fields only when the source gives enough
information; do not invent missing metadata.

### E. Malformed-but-common PGN tolerance

After the real corpus is clean, consider a small compatibility suite for recoverable
syntax emitted by common tools, such as unusual move-number spacing, repeated NAGs,
escaped text, or harmless SAN decoration differences. Keep this conservative: malformed
input should not silently become a different game.

### F. Large-import/browser-performance verification

Exercise inputs near the configured limits: many chapters, deep RAVs, annotation-heavy
trees, and large comments. Confirm that parsing/replay stays responsive enough and that
failures happen before excessive browser memory/CPU use. Do not raise limits without a
measured reason.

### G. Import UX polish

Once semantic behavior is stable, consider small UI improvements such as clearer progress
for multi-chapter imports and better per-chapter failure context. Avoid adding UI that
requires server-heavy progress machinery unless there is a demonstrated need.

### H. Final round-trip fixture

Build one compact PyChess Study fixture containing essentially every supported
import/export feature and assert export -> parse -> normalize equivalence for the authored
DTO/tree data that should survive. This should become the main regression guard for
future Study changes.

### I. Final documentation cleanup / feature-complete stop point

When the real-world corpus imports cleanly and the comprehensive round-trip fixture is
stable:

- update [Study.md](Study.md) with any newly supported conventions or unavoidable losses;
- mark the remaining items in this document complete;
- stop adding PGN extensions speculatively;
- treat later failures as concrete compatibility bugs with minimized regression cases.

## Known limitations / design constraints

- Lichess default Study PGN does not contain every Study setting. Missing orientation is
  one concrete example; heuristics cannot reconstruct author intent perfectly.
- Ordinary PGN cannot losslessly encode all PyChess teaching-mode/gamebook state without
  the PyChess extension comments/tags.
- Multi-stage `TimeControl` clock reconstruction is intentionally not guessed yet.
- The parser is structural, not a substitute for Fairy-Stockfish. Variant legality and
  SAN interpretation must remain engine-backed.
- Do not merge duplicate branches by SAN string before replay; merge by resolved legal
  move after Fairy-Stockfish normalization.
- Do not let external comment attribution become authenticated PyChess authorship.
- Keep full third-party Study PGNs out of the repository when a small regression case can
  reproduce the issue.

## How to continue this work in a new ChatGPT session

For a clean handoff, provide the latest `pychess-variants` source ZIP and point the new
session to this file and `AGENTS.md`. If the next task is Lichess parity, also provide the
matching Lila source ZIP and whichever real exported PGN reproduces the issue. Offline
JavaScript/Python wheelhouses are useful when full validation is needed.

The continuation workflow should be:

1. Read `AGENTS.md`, this document, and the PGN section of `docs/Study.md`.
2. Start from **Remaining compatibility checklist A** unless a newly reported concrete
   import bug takes priority.
3. Compare with current Lila behavior when implementing Lichess compatibility rather than
   inventing a new convention.
4. Add/minimize a regression test for each discovered incompatibility.
5. Keep parsing variant-neutral; use Fairy-Stockfish for SAN/legal-move normalization.
6. Make one focused change at a time and provide an incremental `.patch` for local testing
   before proceeding to the next item.
7. Include a suggested git commit message with every patch.

For TypeScript/Study changes, follow the current project verification policy in
`AGENTS.md` / `.agents/skills/pychess-testing/SKILL.md`; the normal frontend gates are
`yarn lint`, `yarn typecheck`, `yarn dev`, `yarn md`, and `yarn test`. For documentation-only
changes, at minimum run the relevant documentation generation/check plus `git diff --check`.
