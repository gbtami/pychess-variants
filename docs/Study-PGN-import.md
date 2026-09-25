# Study PGN import

This document records the completed client-side Study PGN parser/importer work and serves
as the detailed implementation/audit companion to the stable Study documentation in
[Study.md](Study.md). It captures the final architecture decisions, real-world compatibility
audit, safety/performance limits, lossless PyChess extensions, and maintenance rules for
future PGN compatibility fixes.

Status: **feature-complete for the audited interchange scope**. The A-I compatibility and
round-trip plan is complete; future changes should be driven by concrete PGN failures or
new producer conventions rather than speculative extensions.

## Goals and architecture

The importer is intended to accept both ordinary analyzed PGNs and multi-game PGNs such
as exported Lichess Studies while preserving as much Study structure as the source
format contains.

The chosen architecture is deliberately split into two layers:

1. [pgnParser.ts](../client/pgnParser.ts) is a pure TypeScript,
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

Study import does **not** build on `ffish.readGamePGN()`. The same structural parser is now
also used by **Tools -> Import game** for ordinary PGN, so syntax tolerance and tag/result
normalization do not drift between the two user-facing import paths. Fairy-Stockfish remains
authoritative for resolving SAN to legal variant moves and replaying the selected mainline.
Lila is used as the main reference for Study import semantics and edge cases, while the
desktop PyChess PGN parser was useful as a reference for the basic scanner / recursive-parser
shape.

Two deliberately different formats stay outside this shared ordinary-PGN path:

- Bughouse/BPGN is detected before structural PGN parsing and is still posted unchanged to
  the dedicated `/import_bpgn` server importer, whose two-board semantics are substantially
  different from a single-board PGN tree.
- Shogi KIF is still detected before ordinary PGN parsing and handled by the existing
  dedicated `parseKif()` importer. KIF is a Japanese game-record format, not a PGN dialect.

Keeping the expensive work client-side also avoids turning large PGN imports into extra
server CPU/memory load on the production Heroku dyno.

## Main source and test files

| Area | Files |
| --- | --- |
| Structural parser | [pgnParser.ts](../client/pgnParser.ts) |
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
- 30,000 move/variation nodes across one import batch
- variation nesting deeper than 64

Study replay additionally rejects an authored line deeper than **600 plies**. This mirrors
Lichess's independent `Node.MAX_PLIES = 600` guard while retaining the 3,000-node chapter
capacity for useful analysis trees with side variations.

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
- forced-variation boundaries, including a forced preferred continuation that standard
  PGN cannot represent losslessly by itself.

Clock parsing accepts `H:MM:SS(.sss)` as well as Lichess-compatible `H:MM` and `H:MM.SS`
forms, including comma fractional seconds.

Standard PGN cannot distinguish "this preferred child exists but must remain a variation"
from an ordinary preferred continuation. Rendering `forceVariation` directly as a RAV can
also produce non-replayable text such as `1. e4 (1... e5)`, because normal PGN parsers treat
that RAV as a sibling of `e4`. PyChess therefore renders the legal continuation normally and
attaches the versioned `[%pyforcevariation]` directive to the authored node. Re-import
restores the exact forced boundary; ordinary PGN readers can ignore the directive and still
replay a legal move tree.

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
- outcome-less interactive/gamebook chapters with a visible root prompt face the root
  side to move;
- other interactive/gamebook chapters, including puzzle exports that retain the source
  game's `Result`, face the player who made the final authored mainline move;
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

### Additional fix found from the 2026 official puzzle pack: source-game results in gamebooks

The official **FIDE World Rapid & Blitz 2025 - Puzzle Pack** exposed another orientation
ambiguity that the older corpus did not contain. Its 33 interactive chapters are cut from
real tournament games and the exported Study PGN retains the original game's `Result`
(`1-0`, `0-1`, or `1/2-1/2`). Treating every result-bearing chapter as an ordinary finished
game therefore forced all 33 gamebooks to face White, including positions where White's
first authored move is a scripted blunder and the learner is meant to find Black's tactic.

Gamebook orientation is now resolved before the ordinary finished-game convention. A
result-bearing gamebook uses the final-authored-mover fallback, while the narrower
outcome-less root-prompt exception remains for Lichess's lesson-example export. On the
new official pack this recovers 22 White-oriented and 11 Black-oriented lessons instead
of flattening all 33 to White. Explicit `Orientation` tags still take precedence over all
heuristics.

### Additional fix found during root-node audit: root evaluations

`[%eval ...]` was already parsed for every PGN comment, but the normalization path only
attached it to move nodes. A root-position evaluation was therefore silently discarded.
Study trees now carry a first-class root evaluation through client DTO conversion, server
validation/storage, mutations, analysis-tree reconstruction, and PGN re-export. As with
move-node evaluations, imported PGN values are converted from White POV to the side-to-move
POV used internally, then converted back to White POV when exported.

### Additional fix found during root-node audit: gamebook drawings after navigation

Lichess's lesson-example export contains authored arrows on the root prompt. The PGN data
was imported correctly, but interactive playback could lose those drawings after a board
position change such as a wrong attempt followed by Retry. Normal Study navigation restores
authored shapes after Chessground receives the new FEN; gamebook playback intentionally owns
that restoration path, but previously only restored drawings after a drawing-change event.
Playback now restores the active authored shapes both when it starts and after every position
change, while keeping solution hints in separate auto-shapes. This also matches lila's
gamebook behavior, which retains the original node shapes while a lesson is being played.

### Shared ordinary-game PGN import path

The **Tools -> Import game** page now uses the same [pgnParser.ts](../client/pgnParser.ts)
scanner/parser as Study import for ordinary PGN instead of delegating PGN text parsing to
`ffish.readGamePGN()`. The page still imports one game and only follows the preferred
mainline; comments and RAVs are structurally parsed but intentionally not stored in the
saved game. Each SAN token is resolved against Fairy-Stockfish legal moves with the same
normalization used by Study import, then the resulting variant-native moves are submitted
to the existing `/import` endpoint.

This means future compatibility work for PGNs produced by other chess sites can normally be
implemented once in the shared structural parser or PGN normalization helpers and benefit
both Study import and Tools -> Import game. Dedicated BPGN/Bughouse and KIF paths remain
separate by design and have regression coverage preventing them from accidentally entering
the shared ordinary-PGN path.

The first cross-path regression is the non-standard but common draw shorthand `1/2`: after
its parser support was added for Study imports, Tools -> Import game now receives the same
canonical `1/2-1/2` result automatically. The ordinary importer also has regression coverage
that a RAV is ignored in favor of the source mainline when creating a saved game.

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
  shapes, NAGs, and many move clocks;
- **CWC 2020 Puzzles** — 50+ Crazyhouse chapters, mostly interactive/gamebook material.
- **FIDE World Rapid & Blitz 2025 - Puzzle Pack** — 33 official Lichess gamebook chapters
  created in 2026 from real FIDE event games, with arbitrary FEN starts, retained game
  results, multi-author `[%anno]` attribution, variations, clocks, and root introductions.

When a real-world incompatibility is found, prefer reducing it to a small synthetic
regression fixture rather than committing an entire third-party Study export.

## Completed compatibility and acceptance checklist

The planned A-I implementation/audit pass is complete. The sections below record the
acceptance evidence and the concrete compatibility bugs fixed along the way. Future work
should be driven primarily by semantic differences found in new real PGNs rather than by
adding speculative metadata.

### A. Real-study semantic parity audit — **complete for the current corpus**

The six-study corpus has now been compared structurally and semantically rather than only
checked for parse/replay success. The audit verified that:

- every source arrow/circle in the corpus lands on the same authored position;
- all 170 Lichess clock directives in the clock-heavy Crazyhouse study survive import;
- NAG placement matches the parsed source tree after accounting for intentional
  duplicate-variation merging (including a duplicated `Rxa3 $2` branch in the rook study);
- preferred-mainline/variation ordering remains stable after engine normalization;
- FEN differences are only expected Fairy-Stockfish canonicalization, such as Crazyhouse
  pocket syntax, Chess960 castling rights, and Three-check counters;
- root/move comments, root/move evaluations, and source attribution survive at the intended
  positions;
- the outcome-less root-prompt orientation exception is exercised by Lichess's lesson
  example, while the newer official puzzle pack demonstrates that retained source-game
  results must not force interactive chapters to White;
- the official 2026 puzzle pack normalizes all 33 chapters successfully and recovers both
  learner colors (22 White, 11 Black) instead of flattening them to White;
- all 99 gamebook chapters in the six-study corpus can follow their canonical authored
  line through the deterministic lesson controller to completion.

A mechanical import -> PyChess export -> re-import comparison across all six studies also
preserves the authored tree semantics that the source PGNs contain. Future work on this
item should therefore be bug-driven by a new real export that demonstrates a semantic
difference rather than by adding speculative parser behavior.

### B. Interactive/gamebook metadata parity — **complete within PGN interchange limits**

Real lesson exports now have an import-to-playback regression covering root prompts,
move-specific wrong-answer comments, correct-answer feedback, scripted opponent replies,
subsequent learner prompts, and terminal completion. The larger real-study corpus also
reaches the expected gamebook end state on every canonical lesson line, including
root-only/comment-only chapters.

One important limitation is upstream rather than an importer bug: Lila's Study PGN export
includes `ChapterMode "gamebook"`, ordinary comments, and RAVs, but does **not** serialize
its internal gamebook hint/deviation fields. Those fields therefore cannot be reconstructed
from an ordinary Lichess PGN export. PyChess's own lossless PGN extensions continue to
preserve PyChess gamebook hint/deviation data on PyChess -> PyChess round trips.

Only add another Lichess-specific gamebook directive if a future real export actually
contains information that the current importer loses or misinterprets.

### Additional real-corpus fix: official Lichess Practice mode recovery

The official Lichess Practice Studies expose another deliberate PGN interchange loss.
Lila's Study exporter writes `ChapterMode "gamebook"` for Interactive Lesson chapters,
but it does not write the internal Practice-with-computer mode. A plain import therefore
cannot distinguish one of those computer exercises from an ordinary `normal` Study
chapter by chapter mode alone.

The current lila Practice curriculum gives us a narrow authoritative recovery signal:
each exported chapter still contains its `ChapterURL`, whose Study ID can be checked
against `modules/practice/src/main/PracticeSections.scala`. For those known Practice
Study IDs only, PyChess now imports an otherwise-unmarked chapter as `practice` while
leaving explicit `ChapterMode "gamebook"` chapters as `gamebook`. Explicit versioned
PyChess chapter mode metadata remains authoritative, and unknown Lichess Study IDs keep
the ordinary `normal` fallback.

Lila's `PracticeGoal` also defaults a missing or unrecognized `Termination` value to
mate. The supplied real Practice corpus includes official computer-practice chapters
whose PGN omits `Termination` entirely. When PyChess has recovered `practice` mode from
the known official Lichess curriculum and the exported chapter has no non-empty
`Termination`, the importer materializes `Termination "mate"`. This compatibility rule
does not weaken PyChess's normal Practice validation: newly authored or unrelated
Practice chapters still need an explicit valid goal.

Mode recovery happens while importing the PGN. A Study imported before this compatibility
rule was added has already stored those chapters as `normal`; re-import that source PGN
(or explicitly change the affected chapter modes) before using it as Practice content.

### C. Root-node annotation audit — **complete**

Root-position data now has explicit import/export coverage for comments, circles/arrows,
full clocks, evaluations, PyChess root NAGs, lesson metadata, and external comment
attribution. A corpus-wide root-only import -> PyChess export -> re-import comparison also
preserves root comment text, `sourceAuthor` / `sourceAuthorId`, shapes, evals, clocks, and
gamebook metadata for all six supplied real Studies. The real corpus exercises root arrows
and circles as well as both default `[Annotator ...]` and per-comment `[%anno ...]` sources,
including the 2026 official Lichess puzzle pack.

Standard Lichess `[%clk]` / `[%emt]` comments are move-time annotations; lila's importer also
ignores them as a standalone root clock. PyChess therefore keeps the lossless two-sided root
clock state in its `[%pyclocks whiteMs,blackMs]` extension rather than inventing a missing
opponent clock.

The visual audit found one playback-only loss: gamebook navigation could clear authored
root drawings after Chessground applied a new FEN. Interactive playback now restores the
active position's authored shapes on startup and after every position change, so root
prompt arrows such as those in Lichess's lesson example survive wrong-answer/retry flow.

### D. Chapter metadata audit — **complete**

The six-study corpus (182 chapters) has been checked for chapter/Study names, FEN/SetUp,
variant, orientation, mode, player/result data, Event/Site/Date/Round, ratings/titles/FIDE
IDs, TimeControl, Termination, ECO/Opening, Annotator, and other retained tags. The audit
verified that:

- a consistent Lichess `StudyName` restores the Study title for new-Study imports, while
  conflicting/missing values are not guessed;
- `ChapterName` becomes the chapter name, with the existing player/Event fallbacks used
  only when it is absent;
- behavioral/structural tags (`FEN`, `SetUp`, `Variant`, orientation, mode and PyChess
  extension tags) are consumed into authoritative chapter fields and regenerated from the
  saved chapter on export rather than trusted as free-form overrides;
- ordinary source metadata is kept even when PyChess does not interpret it, including the
  newer official puzzle pack's player ratings, titles, FIDE IDs, broadcast `Site`, `Round`,
  `TimeControl`, `ECO`/`Opening`, and literal unknown values such as `?`;
- imported `Annotator` is preserved as source provenance and used as the default author
  when comments are exported. Previously the exporter replaced all 182 real-corpus
  `Annotator` tags with the current PyChess Study owner, forcing otherwise-default source
  comments to be rewritten with redundant `[%anno ...]` directives. PyChess now matches
  Lichess here: an existing Annotator survives, while native chapters without one still
  receive the current Study owner.

A reduced regression based on the 2026 official FIDE puzzle pack covers the rich metadata
case without committing the full third-party Study export. Future work on chapter metadata
should be driven by a concrete export that demonstrates a new loss or ambiguity.

### E. Malformed-but-common PGN tolerance — **complete**

A compatibility pass used the desktop PyChess `testing/gamefiles/*.pgn` corpus as an
additional stress source. With only `maxGames` raised for the audit, all 26 non-corrupt
files parse structurally; `badpgn.pgn` remains rejected because its tag structure is not
recoverable without guessing. Under the normal Study limits, four database-sized files
correctly stop at the 64-chapter safety cap rather than bypassing the browser guard.

The reduced regression coverage now includes the useful malformed-but-unambiguous forms
found in that corpus and its PGN tests:

- unusual move numbering such as `2.. d6`;
- repeated numeric/symbolic NAGs without duplicate annotations;
- a line beginning with `%` inside a brace comment, which must remain comment text rather
  than being mistaken for a PGN escape line;
- bracket-like text inside comments;
- the non-standard shorthand draw terminator/result `1/2`, explicitly tolerated by the
  desktop PyChess parser and now normalized to canonical `1/2-1/2`;
- existing castling/check/mate SAN decoration normalization during engine-backed replay.

Tolerance remains conservative: malformed tag pairs, unmatched variation/comment
delimiters, and unknown/illegal move tokens are still errors rather than being skipped.
Future additions to this item should therefore require a concrete common producer or a
real import failure, not generic error recovery.

### F. Large-import/browser-performance verification — **complete**

The browser-side importer was exercised with synthetic inputs close to the configured
limits and compared with current lila's Study guards. Lichess allows 64 chapters and 3,000
Study nodes per chapter, but independently caps one line at 600 plies and rejects an
individual imported chapter PGN above 100,000 characters. Its expensive replay runs on the
server, so copying only the chapter/node limits would leave PyChess with a much larger
main-thread worst case.

Measured on the development sandbox with the same Fairy-Stockfish WASM used by the tests:

- 64 chapters x 120 plies (7,680 moves) normalize in about **1.76 s** while yielding between
  chapters;
- a near-ceiling 64 x 468-ply batch (29,952 moves) normalizes in about **4.71 s** and adds
  roughly **30 MiB** of heap in that run;
- the previous theoretical 64 x 3,000-node envelope was measured at roughly 30 seconds /
  145 MiB and is no longer accepted as one browser import;
- parsing one synthetic 7.5 MB brace comment improved from about **554 ms / +243 MiB**
  transient heap to about **38 ms / +7 MiB** after replacing per-character string
  concatenation with source slicing/chunking.

The resulting safeguards are:

- retain the existing 64-chapter and 3,000-node-per-chapter limits;
- add a 30,000-node total batch ceiling so the browser cannot reach the pathological
  64 x 3,000 replay case in one import;
- mirror Lichess's 600-ply single-line guard, preventing the previous deep-mainline
  `RangeError: Maximum call stack size exceeded`;
- keep the 8,000,000-character document limit, with the scanner optimized so a large plain
  comment no longer causes quadratic-style string allocation amplification;
- yield to the event loop between chapter replays when a UI progress callback is present,
  allowing the browser to repaint and accept input during large multi-chapter imports.

These measurements are development/sandbox figures rather than browser performance promises,
but they establish that the configured worst case now fails before the previously observed
excessive CPU/memory envelope. Do not raise these limits without a new measured reason.

### G. Import UX polish — **complete**

Study PGN import now renders a thin green progress bar in the chapter dialog. Structural
parsing and the final server save are shown as indeterminate phases; chapter replay is
determinate and advances chapter-by-chapter. The importer yields before parsing so the
initial state can paint, then between CPU-bound chapter replays so the progress bar can
actually update instead of being blocked by the main thread. The same progress path is used
when a PGN creates a brand-new Study.

Lila's current Study import form does not expose a comparable percentage bar: it posts the
PGN to the server and closes the form while server-side import performs the replay. PyChess
keeps replay client-side to protect the small production server, so client progress/yielding
is intentionally a PyChess-specific adaptation rather than copied server machinery.

The current chapter-numbered replay diagnostics are sufficient for the completed scope.
If future real imports show that per-chapter failure context is insufficient, improve that
specific error path rather than adding generic import UI complexity preemptively.

### H. Final round-trip fixture — **complete**

A compact four-chapter PyChess fixture is now the main lossless Study-PGN regression. It
exports the whole Study, parses it with the shared structural parser, replays every branch
through Fairy-Stockfish, and compares the authored semantic tree after normalization rather
than relying on generated node/comment IDs.

Together the fixture exercises:

- all four chapter modes (`normal`, `practice`, `conceal`, `gamebook`) and the conceal
  boundary;
- Study/chapter ordering and Study-name recovery;
- Standard, Chess960 with a Black-to-move FEN, and an embedded custom-variant snapshot;
- chapter descriptions plus rich ordinary metadata and imported `Annotator` provenance;
- preferred lines and side variations;
- root/move comments, per-comment source attribution, circles/arrows and root/move NAGs;
- root/move clocks and centipawn/mate evaluations;
- root/node gamebook hint/deviation data, including lesson metadata retained while a chapter
  is in Normal mode;
- Unicode and PGN-sensitive braces/backslashes inside extension-backed text;
- forced-variation boundaries.

Building this final fixture exposed the last concrete lossless-PGN gap found in the audit:
`forceVariation` was persisted by Study but deliberately omitted by the older semantic
round-trip helper, and a forced preferred continuation could not be parsed back into the
same tree. The versioned `[%pyforcevariation]` directive now preserves that authored flag
while the surrounding PGN remains legal for ordinary readers.

### I. Final documentation cleanup / feature-complete stop point — **complete**

The real-world corpus imports cleanly, the comprehensive lossless round-trip fixture is
stable, and [Study.md](Study.md) documents the final shared-parser architecture, browser
limits, orientation/interchange behavior, progress UI, and unavoidable PGN losses. This is
the feature-complete stop point for the planned importer work.

From here:

- do not add PGN extensions speculatively;
- treat later failures as concrete compatibility bugs with minimized regression cases;
- keep ordinary PGN syntax/normalization shared between Study import and Tools -> Import
  game;
- keep Bughouse/BPGN and Shogi KIF on their dedicated import paths;
- re-measure browser CPU/memory behavior before raising any parser or replay limit.

## Known limitations / design constraints

- Lichess default Study PGN does not contain every Study setting. Missing orientation is
  one concrete example; heuristics cannot reconstruct author intent perfectly.
- Ordinary PGN cannot losslessly encode all PyChess teaching-mode/gamebook state without
  the PyChess extension comments/tags.
- Multi-stage `TimeControl` clock reconstruction is intentionally not guessed yet.
- The parser is structural, not a substitute for Fairy-Stockfish. Variant legality and
  SAN interpretation must remain engine-backed.
- Keep Bughouse/BPGN on its dedicated server-side import path; do not flatten its two-board
  record into the ordinary single-board parser/replay workflow.
- Keep Shogi KIF on its dedicated KIF parser; site-specific PGN tolerance should not turn KIF
  into a pseudo-PGN format.
- Do not merge duplicate branches by SAN string before replay; merge by resolved legal
  move after Fairy-Stockfish normalization.
- Do not let external comment attribution become authenticated PyChess authorship.
- Keep full third-party Study PGNs out of the repository when a small regression case can
  reproduce the issue.

## Future maintenance workflow

For a future compatibility bug, start with the latest source plus the smallest PGN that
reproduces the failure. If the issue concerns Lichess parity, compare with the matching
current Lila behavior/source rather than inventing a new convention. The maintenance flow
is:

1. Read `AGENTS.md`, this document, and the PGN section of `docs/Study.md`.
2. Reproduce the concrete import/export failure before changing parser tolerance or an
   extension.
3. Reduce the producer PGN to a small regression case where practical.
4. Keep structural parsing variant-neutral and use Fairy-Stockfish for SAN/legal-move
   normalization.
5. Check whether an ordinary-PGN fix should benefit both Study import and Tools -> Import
   game; preserve the dedicated BPGN and KIF paths.
6. Run the change-scoped quality gates from `AGENTS.md`, plus corpus/round-trip checks when
   the affected semantics warrant them.
7. Revisit the documented browser limits only with new measurements showing that a change
   is safe and useful.

For TypeScript/Study changes, follow the current project verification policy in
`AGENTS.md` / `.agents/skills/pychess-testing/SKILL.md`; the normal frontend gates are
`yarn lint`, `yarn typecheck`, `yarn dev`, `yarn md`, and `yarn test`. For documentation-only
changes, at minimum run the relevant documentation generation/check plus `git diff --check`.
