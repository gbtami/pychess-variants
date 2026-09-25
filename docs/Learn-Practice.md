# Learn → Practice

## Status

**In progress. Initial rollout is DEV-only.**

The first goal is to give PyChess content creators a real Practice surface on the DEV
site so they can build, test, and refine high-quality Study-based lessons before any
Practice curriculum is exposed on production.

Practice should follow the architecture used by lichess:

> **Practice is a curated learning/progress layer over Studies, not another Study
> chapter mode or a separate lesson authoring format.**

PyChess already has the two important Study runtimes that Practice needs:

- **Interactive lesson** (`gamebook`): the preferred mainline is the scripted solution;
  learners retry wrong moves, can use hints, and complete the chapter by reaching the
  end of the authored lesson.
- **Practice with computer** (`practice`): the learner plays a disposable game from the
  chapter root against the browser Fairy-Stockfish worker; saved Study continuations do
  not script the computer's replies.

The new feature should mainly add curriculum curation, a variant-aware Practice index,
completion goals, progress/resume behavior, and a Practice-specific learner shell around
those existing Study chapters.

## Lichess reference model

The current lichess implementation confirms that Learn → Practice is built directly on
Studies rather than maintaining a second lesson format.

Relevant upstream source files inspected from lila master on 2026-09-25:

- `modules/practice/src/main/PracticeSections.scala`
  - defines the Practice curriculum as sections containing selected **Study IDs**;
  - keeps a short Practice-specific title/description for each curated Study.
- `modules/practice/src/main/PracticeApi.scala`
  - loads chapters through the normal Study API;
  - opens the first unfinished chapter when entering a Practice Study;
  - strips saved children from `practice` chapters so the authored Study tree does not
    become the computer opponent's script.
- `modules/practice/src/main/PracticeProgress.scala`
  - stores chapter completion per user;
  - remembers the best (lowest) move count;
  - finds the first unfinished chapter for resume behavior.
- `modules/practice/src/main/PracticeGoal.scala`
  - derives the computer-practice objective from the chapter PGN `Termination` tag.
- `ui/analyse/src/study/practice/studyPracticeCtrl.ts`
  - treats the end of an Interactive Lesson as a Practice success;
  - otherwise delegates computer-practice success to the goal evaluator;
  - records completion and can automatically advance to the next chapter.
- `ui/analyse/src/study/practice/studyPracticeSuccess.ts`
  - evaluates dynamic computer-practice goals against the actual played position rather
    than against an authored mainline.

Lichess currently recognizes these `Termination` goals:

- `mate`
- `mate in N`
- `draw in N`
- `equalize in N`
- `+Ncp in M` / `-Ncp in M`
- `promotion with +Ncp` / `promotion with -Ncp`

Interactive Lessons are therefore **scripted in moves**, while Practice-with-computer
chapters are **open-ended in moves but closed-ended in objective**.

That distinction should remain explicit in the PyChess design.

## PyChess-specific product decisions

### 1. DEV-only first

The first implementation must not expose Practice on production.

- Add **Practice** under **Learn** only when `dev` is true.
- Server Practice routes must also reject/404 when `settings.DEV` is false. Hiding the
  menu alone is not sufficient.
- Content creators continue to author lessons with the normal Study editor.
- Practice provides the learner-facing preview/curriculum surface on DEV.
- Production enablement is a separate final decision after enough content exists and the
  feature has been exercised with multiple variants.

This allows us to develop the runtime and curriculum without shipping an empty or weak
Practice menu to users.

### 2. Practice reuses Studies; do not create another lesson editor

The Study remains the source of truth for:

- chapter order and names;
- variant, Chess960/random-start state, initial FEN, orientation, and saved rules
  snapshot;
- preferred mainline and variations;
- comments, hints, wrong-answer explanations, NAGs, drawings, and chapter description;
- PGN tags, including the Practice goal metadata;
- chapter analysis mode.

Practice-specific data should contain only what Study itself should not own:

- curriculum placement/section;
- short Practice card description if needed;
- progress/completion state;
- eventually additional curation metadata.

Editing a Study must immediately update the lesson seen through Practice. We should not
copy Study chapter trees into a Practice collection.

### 3. Curated registry first, like lichess

For the DEV phase, use a small server-side curated registry modeled after
`PracticeSections.scala` rather than building an administration UI first.

A conceptual entry is:

```text
PracticeSection
  id
  name
  studies[]
    studyId
    variant
    chess960/random-start identity where relevant
    shortDescription
```

The Study name and chapters should be loaded from Study storage. The registry only says
that a Study is part of Practice and where it belongs.

A hard-coded registry is desirable for the first phase because it is:

- simple to review in git;
- impossible for arbitrary users to publish directly into Learn → Practice;
- close to the lichess architecture;
- easy to replace with admin-backed curation later if manual registry edits become a
  bottleneck.

Only **public** Studies should be accepted into the curated Practice registry. An
unlisted Study becomes discoverable once it appears on the Practice page anyway, so
requiring public visibility avoids confusing privacy semantics.

### 4. DEV Practice preview for content creators

Curation and authoring should remain separate.

A Study owner/contributor should eventually have a DEV-only **Preview in Practice**
action that opens the current Study in the Practice learner shell even if the Study has
not yet been added to the curated registry. Preview should not create curriculum
progress.

This gives content creators a fast workflow:

1. Create/edit a Study normally.
2. Preview it as a learner in Practice.
3. Fix lesson text, move branches, goals, orientation, or chapter modes.
4. Share the Study link for curation.
5. Add its Study ID to the DEV Practice registry when it is ready.

The preview action is useful but should not block the first index implementation; it can
be added shortly after the Practice viewer exists.

### 5. Variant selector is a first-class PyChess requirement

Unlike lichess Practice, PyChess Practice must be variant-aware from the beginning.

The Practice index should have a **Variant** dropdown following the Puzzle page UX. The
current Puzzle implementation in `client/puzzle.ts` uses `selectVariant(...)` and routes
to `/puzzle/<variant>`; Practice should use the same interaction pattern where practical.

Important differences from Puzzle:

- The dropdown should expose **only variants that currently have curated Practice
  content**, not every playable variant.
- Practice content comes from Study chapters, so the selector must eventually handle the
  same first-class and catalogued/custom variant metadata that Study can display.
- If the existing static `selectVariant(...)` helper cannot represent a curated
  catalogued variant cleanly, match the Puzzle UI/behavior without forcing Practice into
  the helper's static assumptions.

P3 follows that latter path: the server renders only validated curated variant keys, and
`client/practice.ts` applies the same immediate-on-change navigation pattern as Puzzle.
Built-in randomized starts use the normal `<variant>960` site key, while catalogued
variants keep their catalogued names.

Suggested routes:

```text
/practice
/practice/<variant>
/practice/<variant>/<studyId>
/practice/<variant>/<studyId>/<chapterId>
```

`/practice` can redirect to the current `menu_variant` when it has Practice content,
otherwise to the first available Practice variant.

The selected variant should remain stable while navigating back to the Practice index.

### 6. Curated Practice Studies should be single-variant initially

A normal PyChess Study may contain chapters from different variants. That flexibility is
useful in Study, but it would make the Practice variant selector and progress hierarchy
ambiguous.

For the first Practice release, a curated Practice Study should therefore satisfy:

- all chapters use the same Study variant;
- all chapters use a compatible Chess960/random-start identity where applicable;
- the registry variant matches the chapter data.

This should be a **curation validation rule**, not a new restriction on ordinary
Studies.

Mixed-variant Practice Studies can be reconsidered later if a concrete educational use
case appears.

### 7. Initial eligible chapter modes

For the first Practice curriculum, chapters should be either:

- `gamebook` / **Interactive lesson**; or
- `practice` / **Practice with computer**.

`normal` and `conceal` remain valid Study modes but should initially fail Practice
curation validation because they have no unambiguous Practice completion rule.

A comment-only introduction can still be represented as an Interactive Lesson chapter,
which already matches imported lichess lesson material and our existing gamebook
playback behavior.

### 8. Completion semantics

#### Interactive lesson

Completion is straightforward:

- success = learner reaches the end of the authored preferred mainline;
- wrong moves remain retryable and do not persist into the Study;
- the next Practice chapter becomes available/active after completion;
- optional auto-next may advance after the success state, as on lichess.

This should reuse the existing `studyGamebook` playback state instead of creating a
second answer checker.

#### Practice with computer

The existing PyChess Study practice mode is deliberately open-ended: it plays against
Fairy-Stockfish and grades moves, but it currently does not define a chapter objective.
Learn → Practice needs an additional **goal evaluator**.

The first implementation should parse the same lichess-compatible `Termination` values
listed above so imported/ported Practice studies keep their meaning.

However, PyChess must not assume that every variant is won by checkmate. Before
production we should also add generic variant-safe goals, for example:

```text
[Termination "win"]
[Termination "win in 12"]
```

where **win** means a terminal win according to the chapter's actual Fairy-Stockfish
variant rules. This covers Racing Kings, extinction-style variants, region wins,
connect-N variants, and other non-checkmate goals without hard-coding chess semantics.

Proposed goal model:

```text
Win
WinIn(N)
Mate
MateIn(N)
DrawIn(N)
EqualIn(N)
EvalIn(cp, N)
Promotion(cp)
```

Notes:

- `mate`/`mate in N` remain useful aliases for checkmate-based content and lichess PGN
  compatibility.
- `win`/`win in N` are PyChess extensions and use variant-native terminal results.
- `draw in N` and `equalize in N` require repetition/outcome/evaluation awareness.
- centipawn goals are meaningful only when the browser engine returns a usable score;
  unsupported/bounded evaluation must remain **ongoing/unknown**, not invent success.
- promotion goals need to respect variants whose promotion notation/rules differ.
- computer-practice goals continue to use the bounded browser engine. Learn → Practice
  must never turn this into unrestricted server Fishnet work.

For curated Practice content, a `practice` chapter with a missing or invalid goal should
be reported as a curation error rather than silently defaulting to checkmate. This is a
deliberate PyChess difference from lichess and avoids nonsensical defaults for variants.

### 9. Progress model

Authenticated users should have persistent Practice progress. Anonymous users may use
Practice, but the first implementation does not need persistent anonymous progress.

A small dedicated collection is preferable to adding more fields to the normal User
document. Conceptually:

```text
practice
  _id: username
  chapters:
    <chapterId>:
      bestMoves: <optional integer>
      completedAt: <optional timestamp>
  createdAt
  updatedAt
```

The exact BSON shape can be kept smaller if desired; the important behavior is:

- completion is tracked per chapter;
- completing a chapter again never makes the stored best move count worse;
- progress can count completed chapters per Practice Study;
- entering a Practice Study resumes at the first unfinished chapter;
- a completed Study can reopen at its first chapter (matching lichess behavior) or last
  visited chapter if we later decide that is a better UX;
- users can reset Practice progress explicitly.

If chapter IDs are not guaranteed globally unique in PyChess, key progress by
`<studyId>:<chapterId>` instead of chapter ID alone.

The DEV phase does not require ratings, leaderboards, streaks, achievements, or other
Puzzle-style competitive mechanics. Practice is learning progress, not a competition.

### 10. Practice index UX

The first index can closely follow the successful lichess structure while keeping
PyChess variant selection prominent.

Suggested layout:

- page title: **Practice**;
- left/sidebar area:
  - Variant dropdown;
  - overall progress for the selected variant;
  - reset-progress action for signed-in users;
- content area:
  - curriculum sections;
  - Study cards with title and short description;
  - `done / total` chapter progress;
  - visual states for untouched / in progress / complete.

The page should not show an empty section after variant filtering.

If a variant has no curated content, it should not normally appear in the selector. A
direct stale URL such as `/practice/<variant-without-content>` can render a friendly
"No Practice lessons yet" state or redirect to the first available variant.

### 11. Practice Study/player UX

Opening a Practice Study should reuse the Study analysis machinery, but in a dedicated
learner context:

- load the Study and chapter through normal Study storage/building code;
- use existing Interactive Lesson or Practice-with-computer runtime;
- show chapter completion state in the chapter list;
- provide previous/next chapter navigation;
- resume at the first unfinished chapter when entering through the Study card;
- after success, record progress and offer/perform next-chapter advancement;
- keep learner attempts disposable and out of Study REC/SYNC persistence;
- do not expose Study contributor editing controls merely because the viewer is also the
  author—Practice route means learner view;
- content creators edit through the normal Study route and use DEV Practice Preview to
  verify the learner experience.

The underlying Study visibility/access checks must still be respected. Curated entries
are public by policy, while DEV preview may use the normal owner's/member's access.

### 12. Content validation must fail safely

Because the Practice registry references mutable Studies, a later Study edit can make a
previously valid curriculum entry invalid.

Runtime loading must therefore tolerate:

- missing/deleted Study;
- private/unlisted visibility after curation;
- zero chapters;
- mixed variants;
- unsupported chapter mode;
- malformed/missing `Termination` goal on a `practice` chapter;
- browser-engine unsupported variant;
- two-board chapter;
- unreadable catalogued-variant snapshot.

On DEV, invalid curated content should ideally remain visible to maintainers/content
creators with a clear **invalid Practice Study** reason rather than causing a 500 or
silently corrupting progress. A production implementation may instead hide invalid
entries from ordinary users while logging the validation failure.

## Step-by-step implementation plan

Work through these as small reviewable patches. Do not combine the entire feature into
one large change.

### P0 — Documentation and architecture — **done**

- [x] Record that Practice is a curated Study layer, not a new Study mode.
- [x] Record the DEV-only rollout policy.
- [x] Record the variant-selector requirement.
- [x] Record lichess Practice goals and the need for PyChess variant-native `win` goals.
- [x] Define the initial single-variant and eligible-chapter-mode constraints.

**No runtime change.**

### P1 — Curated Practice registry and validator — **done**

- [x] Add Practice section/study data structures on the server.
- [x] Start with an empty or tiny DEV registry of Study IDs.
- [x] Load Study/chapter metadata from the existing Study storage rather than duplicating
      it.
- [x] Validate existence, public visibility, chapter count, single-variant identity, and
      eligible chapter modes.
- [x] Return useful validation reasons for bad registry entries.
- [x] Add focused unit tests for valid/missing/private/mixed-variant/bad-mode Studies.

**Acceptance:** server code can build a validated Practice curriculum from Study IDs,
but there is no user-facing page yet.

### P2 — DEV-only routes, Learn menu entry, and Practice index shell — **done**

- [x] Add `/practice` and `/practice/<variant>` routes.
- [x] Guard the routes with `settings.DEV`; production should return 404/not expose the
      feature.
- [x] Add **Practice** under **Learn** only on DEV.
- [x] Render a basic Practice page from the validated registry.
- [x] Do not implement progress yet.

**Acceptance:** DEV users can open Learn → Practice and see curated sections/studies;
production behavior is unchanged.

### P3 — Variant selector and filtering — **done**

- [x] Add the Puzzle-like **Variant** dropdown.
- [x] Filter sections/cards to the selected variant and remove empty sections.
- [x] Populate choices only from variants that currently have valid curated content.
- [x] Preserve the variant in URLs/navigation.
- [x] Match the Puzzle selector interaction while using curated Study variant keys rather
      than forcing Practice through `selectVariant(...)`'s full static catalogue. This
      keeps sparse Practice choices, built-in `...960` keys, and catalogued variant names
      representable without exposing unrelated variants.
- [x] Add tests for variant filtering and stale/no-content variant URLs.

**Acceptance:** creators can switch between Practice curricula for different PyChess
variants without mixing their Studies.

### P4 — Practice learner route and chapter navigation — **done**

- [x] Add `/practice/<variant>/<studyId>` and chapter-specific route support.
- [x] Reuse Study loading/building and the existing Study analysis client.
- [x] Add a Practice context/model telling the client it is in curriculum learner mode.
- [x] Render the curated Study's chapter list with previous/next navigation.
- [x] Restrict initial curated chapters to `gamebook` and `practice` modes.
- [x] Ensure Practice learner attempts never enable Study REC/SYNC persistence.

**Acceptance:** a curated Study can be opened and navigated in a dedicated Practice
learner shell, but completion is not persisted yet.

### P5 — Interactive Lesson completion — **done**

- [x] Connect existing gamebook playback `end` state to Practice chapter success.
- [x] Add success UI and next-chapter action.
- [x] Add optional auto-next behavior after success. The browser preference defaults to
      enabled (matching lichess) and can be toggled from the lesson controls.
- [x] Keep wrong-answer retry/hint/solution behavior owned by the existing gamebook
      implementation.
- [x] Keep completed chapter markers in browser-session memory only; persistent/user
      progress intentionally remains P6.
- [x] Add tests proving that an Interactive Lesson is complete only when its authored
      lesson reaches the end.

**Acceptance:** gamebook-only Practice Studies are fully usable in one browser session.

### P6 — Persistent progress, resume, and reset — **done**

- [x] Add the dedicated Practice progress collection/model. Progress is one compact
      document per username, so Mongo's built-in `_id` index is sufficient.
- [x] Persist authenticated Interactive Lesson chapter completion. The same record shape
      reserves optional `bestMoves` for P8 computer-practice scoring.
- [x] Count `done / total` per Study and total progress for the selected variant.
- [x] Enter a Study at its first unfinished chapter; a fully completed Study reopens at
      its first chapter.
- [x] Show untouched / ongoing / done card/chapter states.
- [x] Add explicit reset-progress action for the selected variant.
- [x] Keep anonymous Practice functional without server-persisted progress.
- [x] Add database/model/view tests. No secondary index is required by the chosen
      one-document-per-user shape.

**Acceptance:** a signed-in DEV user can leave Practice, return later, and resume from
the correct chapter.

### P7 — Practice goal parser — **done**

- [x] Add a small typed goal model.
- [x] Parse lichess-compatible `Termination` syntax:
      `mate`, `mate in N`, `draw in N`, `equalize in N`, eval-in-N, promotion-with-eval.
- [x] Add PyChess `win` and `win in N` generic terminal-result goals.
- [x] Expose the validated typed goal in the Practice learner payload for P8.
- [x] Treat missing/invalid goals as Practice curation errors for `practice` chapters.
- [x] Add parser tests including whitespace/case handling and invalid input.

**Acceptance:** every curated computer-practice chapter has a validated typed objective
before it is presented to learners.

### P8 — Dynamic Practice-with-computer success evaluator — **done**

- [x] Feed the typed Practice goal into the existing `studyPractice` runtime.
- [x] Implement terminal `win`, mate, draw/equalize, eval, move-limit, and promotion
      success/failure checks.
- [x] Use the existing full-history local rules board for repetition and variant-native
      results.
- [x] Reuse the bounded browser engine and its current ownership/drain/time-out rules.
- [x] Never fall back to Fishnet merely to decide Practice completion.
- [x] Keep an indeterminate state when an evaluation is not deep/reliable enough.
- [x] Record completion and best move count only on actual success.
- [x] Add tests for both orthodox chess and at least one non-checkmate variant-native
      `win` goal.

**Acceptance:** Practice-with-computer chapters are open-ended in move choice but can be
completed against explicit objectives.

### P9 — DEV content-creator Practice Preview — **done**

- [x] Add a DEV-only **Preview in Practice** action for Study owners/write contributors.
- [x] Open the Study in the same learner shell without requiring registry membership.
- [x] Do not hydrate or write curriculum progress while previewing.
- [x] Surface validation problems directly to the creator before entering the learner
      runtime.
- [x] Keep normal Study access checks and load the real Study chapter/saved variant
      snapshot through the same Study builder used by curated Practice.
- [x] Keep preview out of Study REC/SYNC and websocket persistence by using the same
      learner-only Practice context as curated lessons.

**Acceptance:** a content creator can author → preview → fix a lesson without asking for
a registry edit after every change.

### P10 — Practice UX/parity polish — **done**

- [x] Refine the Practice index/card layout against lichess without blindly copying
      chess-only assumptions. The index borrows lila's side-progress/card-state ideas
      while keeping the PyChess variant selector and Study artwork.
- [x] Add clear goal text to computer-practice chapters, both on curriculum cards and in
      the live browser-engine Practice panel. Goal wording stays variant-safe for generic
      wins and promotions.
- [x] Add chapter completion icons/status and progress bars. The index has overall and
      per-Study native progress bars; the Practice learner sidebar marks complete,
      current, and unfinished chapters.
- [x] Verify responsive/mobile layout through dedicated 799px/520px Practice breakpoints
      that collapse the side panel and cards without relying on lichess's chess-only
      fixed card width.
- [x] Verify browser back/forward navigation and variant-dropdown state. The selector
      now re-syncs its server-rendered variant on `pageshow`, covering bfcache restores
      after a variant change.
- [x] Check keyboard/accessible labels for selector, cards, progress, chapter state, and
      the existing success actions. Native `<progress>` elements expose completion to
      assistive technology and card overlays keep explicit open-study labels.
- [x] Reuse existing PyChess icons/styles where possible; lila's Practice layout was used
      as the behavior/style reference without copying its chess-specific lesson artwork.

**Acceptance:** Practice feels like a deliberate Learn feature rather than a Study page
with extra links.

### P11 — Real curriculum/content pass on DEV — **in progress**

- [ ] Ask content creators to prepare several real Practice Studies.
- [ ] Include more than one variant so the selector and variant assumptions are actually
      exercised.
- [ ] Include both Interactive Lesson and Practice-with-computer content.
- [ ] Include custom FEN/orientation cases.
- [ ] Include at least one catalogued/custom variant Study if we intend to support those
      at production launch.
- [x] Fix the first real Lichess-corpus compatibility issue: ordinary Lichess Study PGN
      omits the internal computer-Practice chapter mode. For Study IDs in lila's current
      Practice curriculum, import now recovers `practice` from `ChapterURL`, preserves
      explicit `gamebook`, and materializes Lichess's default `Termination "mate"` when
      an inferred computer-Practice chapter exported no goal.
- [ ] Fix authoring/runtime issues found by real lesson creation rather than expanding
      the feature spec speculatively.

**Acceptance:** DEV contains enough useful material that we can judge navigation,
progress, goal semantics, and author workflow from actual lessons instead of fixtures.

### P12 — Production readiness decision

Do **not** enable production automatically after P11.

Review:

- [ ] Is there enough curated content to justify the menu item?
- [ ] Are the selected Studies public, stable, and reviewed?
- [ ] Are goal semantics correct across the variants we expose?
- [ ] Are browser-engine limits safe under concurrent use?
- [ ] Are invalid/deleted Study references handled gracefully?
- [ ] Is progress persistence/indexing cheap enough for the Heroku/Mongo setup?
- [ ] Are anonymous and logged-in flows both sensible?
- [ ] Are accessibility/mobile/browser tests satisfactory?
- [ ] Do we want hard-coded curation to remain, or is an admin curation UI now justified?

Only after that review should we remove/relax the DEV route/menu gate.

## Suggested initial source ownership

Exact names can change during implementation, but keeping Practice separate from Study
storage while reusing Study runtime should lead to a structure roughly like:

```text
server/practice.py                  curated structure and validation
server/practice_goal.py             typed `Termination` goal parser
client/study/studyPracticeGoal.ts   typed browser goal evaluator
server/practice_progress.py         persistent learner progress helpers
server/views/practice.py            DEV routes/view models
client/practice.ts                  Practice index + variant selector
client/study/...                    minimal hooks for Practice curriculum context
static/... / CSS                    Practice index/player styling
```

Study trees, annotations, chapter mutation, variant snapshots, gamebook playback, and the
bounded practice engine should remain in their existing Study/analysis modules rather
than being forked into Practice copies.

## Non-goals for the DEV phase

Do not block the initial Practice launch on:

- ratings or leaderboards;
- achievements/streaks;
- automatic Study recommendation/ranking;
- public submission workflow;
- admin curation UI;
- mixed-variant Studies;
- arbitrary new chapter modes;
- server-side engine analysis for Practice;
- a second lesson authoring format.

The smallest useful architecture is deliberately:

> **Studies author the content → curated registry organizes it → Practice runs the
> existing learner modes → progress records completion.**

That gives PyChess a lichess-proven model while adding the one dimension lichess Practice
does not need: a first-class chess-variant curriculum selector.
