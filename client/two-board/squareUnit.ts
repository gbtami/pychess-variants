import { BugBoardName } from '../types';

/**
 * The square unit that drives the bughouse short-landscape round layout.
 *
 * That mode stacks ten square-sized rows in the viewport height — one pocket
 * row, eight board rows, one pocket row — so the largest usable square is a
 * tenth of the available height, quantised the same way chessgroundx quantises
 * a board.
 *
 * Publishing this lets the grid reserve exactly what the board will occupy,
 * instead of reserving a fluid `vh` slot that the board then under-fills. The
 * leftover of that mismatch is what renders as stray lines between the boards
 * and under them, and what makes pocket squares half a pixel taller than board
 * squares.
 */

const CSS_PROPERTY = '--bug-sq';

/**
 * Short landscape's RIGHT board, when the width cannot hold two of the left one.
 *
 * This mode forces both boards to the full height — ten rows of it — so it reaches the
 * width limit sooner than tall landscape does, not later: nothing there is negotiable
 * except which board is smaller. The rule is the same one tall landscape follows, and it
 * is stated once in `rightStackWidthAllowance()`: boards first, the left board never
 * yields, the tools are owed half a square, and the right board takes what is left.
 *
 * Published separately rather than by scaling `--bug-sq`, because a scaled unit is no
 * longer a whole number of device pixels per square and chessgroundx would floor it again
 * — the same trap `TALL_LANDSCAPE_PROPERTY` documents. This one is quantised in its own
 * right.
 */
const SHORT_LANDSCAPE_RIGHT_PROPERTY = '--bug-sq-b';

/** Board rows plus the pocket row above and below. */
const ROWS_IN_SHORT_LANDSCAPE = 10;

/**
 * Portrait sizes its two boards from different axes, so each needs its own unit.
 *
 * The player's own board is full width, so its square comes from the viewport
 * WIDTH divided by the file count. The partner's board is a fifth of the viewport
 * height and square, so its square comes from that height.
 *
 * Both are published for the same reason as the short-landscape unit: the grid
 * must reserve exactly what the board will occupy. `cg-board` is
 * `position: absolute`, so it contributes no layout height and the surrounding box
 * is sized entirely by CSS — reserve a rounder number than the board takes and the
 * remainder shows as a line between the board and the pocket beneath it. Measured
 * at 386x835: a 378px box against a 373.33px board left a 4.66px band.
 */
const PORTRAIT_MAIN_PROPERTY = '--bug-portrait-sq';
const PORTRAIT_PARTNER_PROPERTY = '--bug-portrait-partner-sq';

/** Files on a standard board; both portrait boards are 8x8. */
const FILES = 8;

/** The partner board's share of the viewport height. Matches the CSS. */
const PARTNER_HEIGHT_FRACTION = 0.2;

/**
 * THE WIDTH BELOW WHICH THE TOOLS ARE NOT WORTH A COLUMN, in squares of the left board at
 * full zoom.
 *
 * This was half a square, and half a square was never a usability measure. Measured across
 * ordinary viewports the tools receive between 2.4 and 4.8 squares of column and then fall
 * STRAIGHT to that floor below about 1000px of width — 195 to 628px and then 24 to 33px, with
 * nothing in between. The layout had a maximum and a floor and no minimum, so it fell off a
 * cliff rather than degrading. Two squares puts the minimum just under the bottom of the upper
 * band, which makes that cliff the DECISION POINT — the width at which the tools go looking for
 * somewhere better — instead of a place the layout lands in.
 *
 * Squares of the left board AT FULL ZOOM, deliberately: tie the promise to the current zoom and
 * zooming a board down would quietly shrink what the tools are owed, which is the opposite of
 * what a zoom is for.
 *
 * The gap mirrors `column-gap: 2vmin` in `bughouse.css`, two gaps between three columns. Stated
 * here as a number for the same reason `PARTNER_HEIGHT_FRACTION` is: the unit has to know what
 * the width will be spent on BEFORE the grid exists, and the grid cannot be measured to find out
 * without the circularity this module avoids.
 */
const TOOLS_MIN_SQUARES = 2;

/**
 * THE HEIGHT THE TOOLS NEED to be worth a row of their own beneath both boards, in the same
 * squares of the left board that `TOOLS_MIN_SQUARES` counts across.
 *
 * Both numbers were read off what the layout actually has to spend rather than chosen — see
 * `toolsHome()`. Two squares is the widest column that still leaves every ordinary desktop the
 * column it already has; three rows sits inside the band that separates a viewport with 0.74
 * squares beneath its boards, which must NOT qualify for a row, from one with 5.45, which must.
 *
 * COUNTED IN SQUARES, deliberately, and against the alternative. The square is the unit the whole
 * layout is built from and the one a reader can see, so "are there enough spare squares here to
 * put the tools in" is one question asked of every candidate region. The cost is that the promise
 * shrinks with the board — two squares is 204px on a 1920x1080 screen and 132px on a small one,
 * against a tab strip that wants 240px for legible labels — which is accepted because truncation
 * is already how both the strip and the movelist degrade, and because a screen that small is one
 * where the tools are about to be moved somewhere better anyway.
 */
const TOOLS_MIN_ROWS = 3;

/**
 * THE FLOOR A BOARD MAY BE ZOOMED TO, in squares of the LEFT board at full zoom.
 *
 * A percentage cannot express this. The two columns no longer mean the same thing by 100% —
 * the right board's full zoom is capped by the width and can be much the smaller square — so a
 * flat "no less than 50%" lets one board shrink to half of a big square and the other to half
 * of an already small one, and only the second becomes unusable. The floor has to be a SIZE.
 *
 * FOUR squares of the left board — Nikolay's number, 2026-09-05. The left board's canonical
 * square is the one the height alone decides, so the floor is stated in a unit that does not move
 * when either board is zoomed and does not differ between them.
 *
 * Each column then converts that one SIZE back into its own percentage — see `minZoomPercent()`.
 * The two sliders therefore stop at different numbers and at the same board size, which is the
 * whole point: a percentage means a different thing on each slider, a stack height does not.
 */
const MIN_STACK_IN_LEFT_SQUARES = 4;

/**
 * THE SMALLEST SQUARE THE RIGHT BOARD MAY BE GIVEN, in squares of the left board.
 *
 * The right board yields first and yields alone — but it cannot yield forever, and until this
 * existed nothing said where it stops. Measured at 682x648 on the analysis page: the left board
 * held its height-derived 58.67px square, the right was driven to 16.67px — a 133px board, four
 * pawns wide — and the pair STILL overflowed, the app coming out 740.4px inside a 682px viewport
 * and the page scrolling 29px sideways. Two failures in one: a right board too small to read,
 * and a promise the width could not keep however small it was made.
 *
 * Half the left board's square is the floor, and what happens AT it is the rule Nikolay stated on
 * 2026-09-12: the partner board becomes a TAB in the tab list and the tools take the column it
 * vacates. It used to be the point where `leftStackWidthCap()` engaged and the pair shrank
 * together; the viewer's own board does not pay for the tools, so one of them leaves the row
 * instead. See `arrangement()`.
 */
const RIGHT_MIN_IN_LEFT_SQUARES = 0.5;

/**
 * THE LARGEST PARTNER BOARD THAT STILL LEAVES A USABLE ZONE A, as a fraction of the viewer's own.
 *
 * Zone A is the height the shorter board frees, so the two constants that already exist fix this
 * one: the band is `ROWS` times the pair's difference and the tools are owed `TOOLS_MIN_ROWS`
 * squares of it, so the difference must be at least `TOOLS_MIN_ROWS / ROWS` — three tenths — and
 * the partner board at most seven tenths. Derived rather than chosen, so it cannot drift from the
 * threshold it exists to satisfy.
 *
 * It is not a target. `arrangement()` uses it only in the one home whose existence depends on the
 * partner board being smaller, and takes the LARGER of it and what the width already forced.
 */
const ZONE_A_MAX_PARTNER = 1 - TOOLS_MIN_ROWS / ROWS_IN_SHORT_LANDSCAPE;
const TALL_COLUMN_GAP_FRACTION = 0.02;
const TALL_COLUMN_GAP_COUNT = 2;

/**
 * The analysis page's eval gauge, in squares, beside each board.
 *
 * `bughouse.css` sizes the stack there as
 * `calc(var(--bug-stack-sq) * 8) calc(var(--bug-stack-sq) * 0.31)` — the gauge is part of
 * the stack, and the round page has no equivalent. A width budget that pays for eight
 * squares a board therefore underpays this page by 0.31 of one, which is not a rounding
 * error: measured at 996x649 the gauge is 15px, board B started at 385 and the gauge beside
 * board A spanned 384-399, so the board covered it.
 */
const GAUGE_SQUARES = 0.31;

/** Whether this page draws the gauges — the analysis app does, the round app does not. */
function stacksIncludeGauge(): boolean {
    return document.querySelector('.analysis-app.bug') !== null;
}

/**
 * Tall landscape — the desktop case — sizes its boards the same way short
 * landscape does, from the height rather than from a fraction of the width.
 *
 * That mode used to make a board `31.25vw` scaled by a zoom slider defaulting to
 * 80, so an untouched page drew each board at a quarter of the viewport WIDTH and
 * left the height unspent. "Full zoom" meant nothing in particular. It now means
 * the stack — pocket row, board, pocket row — fills the height it is given, so the
 * board is as large as the space allows and a taller window yields a larger board
 * without touching a slider.
 *
 * The height available to the stack is the viewport less the page header, which is
 * why this one has to measure. The header is not in the grid and its height does
 * not depend on any board, so reading it is not the circularity the layout spec
 * forbids — unlike the seat strips, whose height in this mode came from the
 * pockets, which are sized from `--cg-width-a`, which is the measured board. That
 * is precisely the loop that cannot be used to size the board, and it is why the
 * strips are pinned to the unit here rather than left content-sized.
 *
 * One property per COLUMN, and each is already scaled by that column's zoom.
 *
 * There is deliberately no unscaled `--bug-tall-sq` any more. A published unit is a
 * whole number of device pixels per square, which is what makes chessgroundx's own
 * flooring a no-op on it — multiply that by a zoom fraction in CSS and the product
 * is no longer whole, so the board floors it again and the track keeps the
 * difference. The tracks read `calc(var(--bug-tall-sq-a) * 8)` with no scale in
 * them at all, so there is nothing left in the stylesheet to un-quantise.
 *
 * Keyed a/b to match `--zoom-a`/`--zoom-b`, which name the two COLUMNS: the left
 * column is the viewer's own board in every seating, and markRoles() keeps the
 * roles pointing at the same pairing. See the comment on `.own-seat` in
 * bughouse.css.
 */
const TALL_LANDSCAPE_PROPERTY: Record<BugBoardName, string> = {
    a: '--bug-tall-sq-a',
    b: '--bug-tall-sq-b',
};

/**
 * The same two units AT FULL ZOOM — what each column is ALLOWED, rather than what it is
 * currently drawing.
 *
 * The pair above is already scaled by the zoom, which is right for a track and wrong for the
 * one question the layout asks about spare room: "is this board smaller than it is allowed to
 * be?" Answered against the app's height, that question says yes whenever a board is capped by
 * WIDTH — which the right board now can be — and the coordinates and the username then leave
 * the board at full zoom, where they are supposed to stay in. Answered against the allowance,
 * full zoom is exactly zero spare by construction, and zooming out is the only thing that
 * creates any.
 *
 * Short landscape needs no equivalent: it has no zoom, so `--bug-sq` and `--bug-sq-b` are
 * already each column's allowance and the stylesheet reads them directly.
 */
const TALL_ALLOWANCE_PROPERTY: Record<BugBoardName, string> = {
    a: '--bug-tall-allow-a',
    b: '--bug-tall-allow-b',
};

/**
 * The zoom each column is drawn at, as a scale rather than a percentage.
 *
 * Held here because the unit now has two inputs — the viewport and the zoom — and
 * a resize has to recompute against whatever zoom is current. The values arrive
 * from `boardSettings`, which owns them; this module never reads the setting
 * itself, so the dependency runs one way and there is no import cycle to trip
 * over at module-evaluation time.
 */
const scale: Record<BugBoardName, number> = { a: 1, b: 1 };

/**
 * The same height, published for the page wrapper to take literally.
 *
 * `height: 100%` cannot express it: the body is `display: block` and full-viewport
 * tall, so 100% is the WHOLE viewport while the wrapper starts below the header —
 * measured as a wrapper running to 887px in an 827px viewport, overflowing by
 * exactly the header's 60px. The other two modes hide the header, so 100% happens
 * to be right there and is wrong here for a reason that is easy to miss.
 *
 * Named for the app rather than for tall landscape, because it is the height every
 * mode's app gets: the modes that hide the header measure a header of 0 and this
 * comes out as the whole viewport, which is exactly right for them. Short landscape
 * sizes its coordinate room from it for that reason.
 */
const APP_HEIGHT_PROPERTY = '--bug-app-h';

/**
 * DUPLICATED FROM chessgroundx 10.7.5, `updateBounds()` in src/render.ts:
 *
 *   const width =
 *     (Math.floor((bounds.width * window.devicePixelRatio) / s.dimensions.width) *
 *       s.dimensions.width) / window.devicePixelRatio;
 *
 * Note `s.dimensions.width` there is the **file count**, not a pixel width.
 *
 * It is duplicated because chessgroundx performs the snap inside updateBounds()
 * and exposes no pure function for it, while we need the answer *before* a board
 * exists in order to size the grid that the board will be measured in. Ask
 * upstream to export it and delete this copy; if upstream changes its rule and
 * this is not updated, the slack returns and is immediately visible as those
 * stray lines reappearing.
 *
 * Quantising to whole device pixels per division is what keeps every square
 * boundary on a device-pixel edge, so the board image rasterises with uniform
 * squares instead of ones that look a pixel wider or narrower than their
 * neighbours.
 */
export function quantize(size: number, divisions: number, dpr: number): number {
    return (Math.floor((size * dpr) / divisions) * divisions) / dpr;
}

/**
 * Blink stores a used length as a whole number of 1/64px, and every track built
 * from a unit multiplies it by the file count first. A unit that is a whole
 * number of 1/512px therefore survives that multiplication exactly, landing on
 * the layout grid rather than a hair below it.
 *
 * Rounded UP, deliberately, and this direction is the whole point. A device-pixel
 * exact unit is mathematically exact and numerically fragile: `8 x unit` for a
 * board at dpr 1.2000000476837158 comes to 453.3333153, the used width settles
 * just under, and chessgroundx's floor then reads 67.99999 and draws 67 device
 * pixels per square instead of 68 — a whole square's worth, 6.67px, collecting on
 * the left exactly like the defect this module exists to prevent. Rounding down,
 * or not rounding at all, leaves that cliff in place.
 *
 * The cost is that a track may exceed its board by up to 8/512 = 0.0156px. That is
 * a sixth of a device pixel at dpr 1 and cannot render as a gap, whereas the error
 * it replaces is up to a full square. Where the exact unit is already on the grid
 * — dpr 1 and dpr 1.5 both give whole or half units — this changes nothing at all.
 */
const LAYOUT_GRID_PER_PX = 512;

/**
 * The margin has to be STRICTLY greater than the rounding it absorbs, and snapping
 * to the grid alone is not.
 *
 * Work it through: chessgroundx measures the wrap, and a measured width can come
 * back up to one grid step (1/64px) under the width the track was given, because
 * the box may start at a fractional offset. For its floor to still reach N device
 * pixels per square the unit must exceed the exact one by at least (1/64)/8 =
 * 1/512 — the grid step itself. Rounding UP to the grid yields a margin in
 * [0, 1/512), which is short of that by exactly the amount that matters, and it
 * shows: measured at dpr 1.2000000476837158, grid snapping alone left 23 of 77
 * zoom steps still losing a whole device pixel per square, 6.67px a board.
 *
 * So the bias is added first and the grid snapped afterwards. Total overshoot is
 * under 1/16px across a whole board — a fifteenth of a device pixel at dpr 1 —
 * against the up-to-8px error it removes. It is deliberately not zero: exactness
 * is unreachable at a dpr where 512N/dpr is never an integer, and a slack the
 * board cannot render is the whole of what is left to aim for.
 */
const MEASUREMENT_MARGIN_PX = 1 / 256;

function onLayoutGrid(unit: number): number {
    return Math.ceil((unit + MEASUREMENT_MARGIN_PX) * LAYOUT_GRID_PER_PX) / LAYOUT_GRID_PER_PX;
}

/** The largest square for which `rows` of them fit `height`, device-pixel aligned. */
export function squareUnit(
    height: number,
    rows: number = ROWS_IN_SHORT_LANDSCAPE,
    dpr: number = window.devicePixelRatio,
): number {
    return onLayoutGrid(quantize(height, rows, dpr) / rows);
}

/** Viewport height excluding any scrollbar, which is what the rows must fit into. */
function availableHeight(): number {
    return document.documentElement.clientHeight;
}

/** Viewport width excluding any scrollbar, which is what the full-width board fits into. */
function availableWidth(): number {
    return document.documentElement.clientWidth;
}

/**
 * The height the round app actually gets in tall landscape: the viewport less the
 * page header, which is the only chrome above it once `under-board` is hidden and
 * the page is pinned to the viewport the way the other two modes already pin it.
 *
 * Measured rather than assumed a constant, because the header is a shared template
 * whose height is not this layout's to know. Absent or hidden it contributes 0, so
 * the same call is correct in the modes that hide it.
 */
function availableStackHeight(): number {
    const header = document.querySelector('header');
    const headerHeight = header ? header.getBoundingClientRect().height : 0;
    return availableHeight() - headerHeight;
}

/** A stack's width in squares: the board, plus the gauge where the page draws one. */
function stackSquares(): number {
    return FILES + (stacksIncludeGauge() ? GAUGE_SQUARES : 0);
}

/**
 * THE ARRANGEMENT: both boards' squares AND the tools' home, decided together, from the viewport
 * alone, and in that order — because each of the three answers constrains the next.
 *
 * THE RULE, stated by Nikolay 2026-09-12 and the whole of what this function implements:
 *
 *   Nothing wants a smaller partner board. It is as big as possible — the same size as the
 *   viewer's own wherever there is room for both. It shrinks ONLY because the tools column
 *   would otherwise fall below its minimum width, never below HALF the viewer's board, and at
 *   that floor it stops being a board beside the other and becomes a tab in the tab list.
 *
 * So the cascade is:
 *
 *   1. both boards at the height's answer, and the tools take what is left;
 *   2. tools column under its minimum? the PARTNER board pays, down to its floor;
 *   3. still under it at the floor? the tools leave the row — zone B, then zone A;
 *   4. nowhere left? the partner board becomes a tab and the tools take the column it vacates.
 *
 * THE VIEWER'S OWN BOARD NEVER PAYS. It keeps the height's answer at every step. There used to be
 * a `leftStackWidthCap()` that shrank it once the partner board hit the floor, "so the pair shrinks
 * together rather than one of them vanishing"; the rule is that one of them leaves the row instead.
 *
 * THE FLOOR IS WHAT MAKES CHARGING THE TOOLS SAFE, and this is the trap the previous form was
 * written to avoid: an allowance defined as "what fits once the tools are paid for", with no floor,
 * leaves exactly the tools' minimum beside the boards AT EVERY VIEWPORT by construction — every
 * other home then tests as unaffordable and is unreachable. Measured at the time: the analysis page
 * at 1920x1080, 1600x900, 1024x640 and 996x730 all went straight to the last resort. A partner
 * board that stops at half the main one cannot keep paying, so the shortfall has to be met by a
 * home change and the other homes stay reachable. The two halves only work together.
 *
 * WHY HEIGHT ALONE IS NOT ENOUGH for a board's size, which is why the width terms exist at all:
 * measured at 996x649 the ten-row unit came to 58.67px, so each board asked for 8 x 58.67 =
 * 469.38px, the two took 938.75 of 996, the tools track was left 31.29px, its content overhung and
 * the PAGE scrolled 43px sideways. On the analysis page the same unit drew 469px boards inside
 * 372px columns, overlapping by 84px.
 *
 * AND WHY THE FLOOR EXISTS AT ALL: measured at 682x648 on the analysis page before it did, the left
 * board held its height-derived 58.67px square and the right was driven to 16.67px — a 133px board,
 * four pawns wide — and the pair STILL overflowed, the app coming out 740.4px inside a 682px
 * viewport.
 *
 * NOTHING HERE READS A LAID-OUT ELEMENT. Every term is the viewport, a declared constant, or the
 * reader's own zoom — which is an input, not an observation — so no board's size is ever derived
 * from a board's size.
 */
export type ToolsHome = 'beside' | 'below' | 'zoneA' | 'lastResort';

interface Arrangement {
    home: ToolsHome;
    /** The viewer's own board's square at full zoom: the height's answer, always. */
    a: number;
    /** The partner board's square at full zoom, after whatever the cascade charged it. */
    b: number;
}

/** The gaps between the three tracks, which the width has to pay for before either board does. */
function columnGaps(): number {
    return TALL_COLUMN_GAP_COUNT * TALL_COLUMN_GAP_FRACTION * Math.min(availableWidth(), availableHeight());
}

/** The square a stack gets from a width budget: the budget is `stackSquares()` wide, not eight. */
function stackUnitFor(widthBudget: number, dpr: number): number {
    return squareUnit((Math.max(0, widthBudget) * FILES) / stackSquares(), FILES, dpr);
}

function arrangement(dpr: number = window.devicePixelRatio): Arrangement {
    const width = availableWidth();
    const height = availableStackHeight();
    const gaps = columnGaps();
    const squares = stackSquares();

    // Step 1. The viewer's own board: the height's answer, capped only by the width the PAIR needs.
    //
    // THE CAP IS NOT THE TOOLS' DOING, and that distinction is the whole of it. The viewer's board
    // never shrinks to pay for a panel — but it cannot take a width that leaves the partner board
    // no room to exist beside it either, and two boards side by side is the only arrangement these
    // landscape templates have. So the ceiling is the width at which the partner board sits exactly
    // on its floor: with `S` squares to a stack and `f` the floor,
    //
    //     S x L  +  S x (f x L)  +  gaps  =  width   =>   L = (width - gaps) / (S x (1 + f))
    //
    // one unknown, every term in squares of the viewer's board, so it is a division and not a
    // search. ABOVE THAT WIDTH IT CHANGES NOTHING: the height's answer is the smaller and wins.
    //
    // Measured at 701x829 with no cap at all — the shape p2 is floated to: the height's answer gave
    // a 76.5px square, the own stack asked for 635 of 701, and what was left for the partner board
    // and the tools together was 37px. The board came out 36x94, the tab strip was a 37px-wide
    // vertical sliver, and the tools had nowhere at all. With the cap the same viewport gives a
    // 432px board, a 216px partner board on its floor, and the tools the full-width row below both.
    //
    // NO TOOLS TERM IN THE CAP, deliberately: it guarantees two BOARDS fit, not a column. The
    // tools' minimum is what the steps below spend the partner board's slack on, and where it
    // cannot be met beside the boards they go below them or into zone A instead. (An earlier
    // comment on this formula carried a `t x L` term the code never had. The code was right.)
    const widthCap = squareUnit(
        ((Math.max(0, width - gaps) / (stackSquares() * (1 + RIGHT_MIN_IN_LEFT_SQUARES))) * FILES),
        FILES,
        dpr,
    );
    const a = Math.min(squareUnit(height, ROWS_IN_SHORT_LANDSCAPE, dpr), widthCap);
    const toolsMin = TOOLS_MIN_SQUARES * a;
    const floor = RIGHT_MIN_IN_LEFT_SQUARES * a;

    /* THE FLOOR IS MET WITHIN ONE DEVICE PIXEL, and it has to be, because the cap and the floor
     * cannot agree exactly.
     *
     * The width cap above is derived FROM the floor — it is the width at which the partner board
     * sits exactly on half the viewer's square — and the two squares are then quantised DOWN to
     * whole device pixels, independently. So wherever the cap binds, the partner board's allowance
     * lands a rounding step UNDER the floor, by construction and every time.
     *
     * Measured on p2 at 701x624, dpr 1.125: `a` 54.227, the floor 27.114, the partner board's
     * allowance 26.672 — short by 0.441px, half a device pixel. The exact test failed, `below` and
     * `zoneA` were both skipped, and the layout went to the LAST RESORT: the whole tools panel
     * hidden behind the partner board's tab with a 222px strip, while zone A stood 275px tall and
     * 222 wide with room for every part of it.
     *
     * One device pixel rather than an arbitrary epsilon: it is the granularity the boards are drawn
     * at, so a shortfall smaller than that is not a difference in anything that can be seen. */
    const meetsFloor = (unit: number) => unit + 1 / dpr >= floor;

    // Step 2. What the partner board may take while the tools keep a column of their own. Where
    // that is at or above the floor, this is the answer and nothing else moves: the tools have
    // their column, the viewer's board has the height's answer, and the partner board has paid the
    // difference.
    const paying = Math.min(a, stackUnitFor(width - gaps - squares * a - toolsMin, dpr));

    // WHAT IS DRAWN, NOT WHAT IS ALLOWED, for every test below. A board zoomed down gives back the
    // width and height it stops using and the tools may take that space: a reader who zooms out to
    // make room expects the room to be used. What the tools are OWED stays in squares of the
    // viewer's board at FULL zoom, so zooming a board down cannot quietly shrink the promise.
    const zoomed = zoomReachesBoards();
    const drawnA = a * (zoomed ? scale.a : 1);
    const drawn = (unit: number) => unit * (zoomed ? scale.b : 1);
    const columnFits = (partner: number) =>
        width - gaps - squares * drawnA - squares * drawn(partner) >= toolsMin;

    if (meetsFloor(paying) && columnFits(paying)) return { home: 'beside', a, b: paying };

    // Step 3. The column cannot be paid for, so the partner board stops paying: what it may take
    // once the tools are not in the row at all. This is bigger than `paying`, which is the point —
    // a board shrunk for a column it is no longer making room for would be shrunk for nothing.
    const room = Math.min(a, stackUnitFor(width - gaps - squares * a, dpr));
    if (columnFits(room)) return { home: 'beside', a, b: room };

    // The two boards are still side by side in both homes below, so the floor still binds.
    if (meetsFloor(room)) {
        // Zone B is the height neither stack uses, measured against the TALLER of the two — which
        // of them that is no longer follows from the allowances once the two are zoomed
        // independently. Nothing is charged to the partner board here: a full-width row under both
        // boards costs the pair no width.
        const tallest = ROWS_IN_SHORT_LANDSCAPE * Math.max(drawnA, drawn(room));
        if (height - tallest >= TOOLS_MIN_ROWS * a) return { home: 'below', a, b: room };

        // Zone A is what the partner board frees by being SHORTER, so this is the one home whose
        // existence the partner board's size decides — and the largest board that still leaves the
        // tools their rows is `ZONE_A_MAX_PARTNER`. Shrinking to exactly that is the rule's step 2
        // again, in the height rather than the width: the partner board pays the tools' minimum,
        // and no more than it has to.
        const forZoneA = Math.min(room, ZONE_A_MAX_PARTNER * a);
        const zoneAWidth = squares * drawn(forZoneA);
        const zoneAHeight = ROWS_IN_SHORT_LANDSCAPE * Math.max(0, drawnA - drawn(forZoneA));
        if (zoneAWidth >= toolsMin && zoneAHeight >= TOOLS_MIN_ROWS * a) {
            return { home: 'zoneA', a, b: forZoneA };
        }
    }

    // Step 4. The width cannot hold the pair with the partner board at or above its floor. It
    // becomes a tab, and `b` is the column it vacates: the floor bounds a board drawn BESIDE the
    // other, not a board taking its turn in a column, so a tab may be smaller than half. What that
    // column must still hold is the tools' minimum; where even that does not fit, a column that
    // clips is the bargain this layout already makes everywhere else. The viewer's own board keeps
    // the height's answer here too — it is the last thing this layout gives up, and it never does.
    return { home: 'lastResort', a, b: room };
}

/**
 * WHERE THE TOOLS GO. See `arrangement()`, which decides it together with the boards' sizes.
 *
 * The tools take the first home that fits, and the order is the preference:
 *
 *   'beside'      a column of their own, right of both boards — the only home with three columns
 *   'below'       the full-width row beneath both boards, zone B
 *   'zoneA'       the region the partner board frees by being smaller than the viewer's own
 *   'lastResort'  the tab strip alone in zone A, the partner board joining it as a tab
 */
export function toolsHome(dpr: number = window.devicePixelRatio): ToolsHome {
    return arrangement(dpr).home;
}

/**
 * A column's square at FULL zoom — what it is ALLOWED, rather than what it is drawing.
 *
 * THE ORDER IS THE POLICY, and `arrangement()` is where it lives: the viewer's own board takes the
 * height's answer and never gives it up, and the partner board takes what the width leaves once the
 * tools' minimum is paid, down to half the viewer's board and no further.
 */
function allowanceFor(boardName: BugBoardName, dpr: number = window.devicePixelRatio): number {
    const arranged = arrangement(dpr);
    return boardName === 'a' ? arranged.a : arranged.b;
}

/**
 * What the tools are owed across a region, in pixels — `TOOLS_MIN_SQUARES` squares of the left
 * board at full zoom.
 *
 * Exported so that `toolsPlacement` can ask the same question of a region it has MEASURED that
 * `toolsHome()` asks of the viewport. The threshold has to be the one number in both places: a
 * region wide enough to be worth choosing must be wide enough to be worth putting a part in.
 */
export function toolsMinWidth(): number {
    return TOOLS_MIN_SQUARES * allowanceFor('a');
}

/**
 * The lowest zoom this column may be taken to, as a percentage of its own full zoom.
 *
 * Derived, never stored: the inputs are the viewport and the other board's size, so it changes
 * with every resize and has to be asked for again rather than remembered. Computed from the
 * viewport directly rather than from the published units, so it does not depend on whether a
 * republish has already run this frame.
 *
 * A column whose full zoom is ALREADY at or below the floor returns 100: it may not be zoomed
 * out at all, which is the honest answer — the alternative is a slider that promises room the
 * layout has already spent.
 */
export function minZoomPercent(boardName: BugBoardName): number {
    const dpr = window.devicePixelRatio;
    const floorHeight = MIN_STACK_IN_LEFT_SQUARES * allowanceFor('a', dpr);
    const allowance = allowanceFor(boardName, dpr);
    if (!(allowance > 0)) return 0;
    return Math.min(100, Math.ceil((floorHeight / (ROWS_IN_SHORT_LANDSCAPE * allowance)) * 100));
}

/** That floor applied to a zoom the user or a stored setting asked for. */
export function clampZoom(boardName: BugBoardName, zoom: number): number {
    return Math.max(zoom, minZoomPercent(boardName));
}

/**
 * Publish the unit for CSS.
 *
 * MUST be called before the boards are constructed. The grid tracks reference
 * `var(--bug-sq)` with no fallback, so chessgroundx has to measure a wrap that
 * is already at its final size — if this runs afterwards the boards move under
 * an already-memoized `bounds` and every click lands on the wrong square, which
 * is the bug this exists to prevent.
 */
/**
 * The chosen home, as a class the stylesheet can select on.
 *
 * PUBLISHED FROM HERE because this is where it is decided, and it is decided here because the
 * board allowances depend on it: the tools' squares are in the divisor only when they take a
 * column. Anywhere later would be after the boards had already been sized against the wrong
 * width.
 *
 * A class rather than a custom property, because it selects a grid template and CSS cannot match
 * on a property's value without style container queries, which are newer than anything else this
 * stylesheet requires. It joins the drop classes already on the same element, and like them it is
 * toggled rather than assigned so that nothing else on the element is disturbed.
 *
 * Silently does nothing where there is no two-board app on the page — this module publishes its
 * units unconditionally, including on pages that will never read them.
 */
const TOOLS_HOME_CLASS: Record<ToolsHome, string> = {
    beside: 'tools-beside',
    below: 'tools-below',
    zoneA: 'tools-zonea',
    lastResort: 'tools-lastresort',
};

/**
 * Told when the home CHANGES, because a home change moves parts without resizing anything.
 *
 * `toolsPlacement` re-runs its arrangement from a `ResizeObserver`, on the reasoning that
 * everything which can change the answer changes the size of something it watches. A change of
 * HOME does not: the class this function toggles is the only thing that moved, the stacks keep the
 * size the width gave them, and the app keeps the height the last arrangement published — so
 * nothing fires and the arrangement stays the one the old home needed.
 *
 * Measured on p2 at 701x744: the home went from `below` to `zoneA` when the window lost 85px of
 * height, the boards did not move (they are capped by the WIDTH there, so the height changed
 * nothing), and `--bug-app-content-h` stayed at the 769px the `below` home had published. The app
 * therefore stood 769px tall in a 744px viewport that cannot scroll, the tools panel ran 206px past
 * the bottom of zone A, and the tab strip — correctly placed in zone B, below it — was drawn off
 * the page entirely.
 *
 * A callback rather than an import: this module is the one `toolsPlacement` depends on, and the
 * dependency has to keep running one way.
 */
let onHomeChange: (() => void) | null = null;

export function notifyOnToolsHomeChange(fn: () => void): void {
    onHomeChange = fn;
}

function publishToolsHome(home: ToolsHome): void {
    const app = document.querySelector<HTMLElement>('.round-app.bug, .analysis-app.bug');
    if (app === null) return;
    const className = TOOLS_HOME_CLASS[home];
    const changed = !app.classList.contains(className);
    for (const [name, klass] of Object.entries(TOOLS_HOME_CLASS)) {
        app.classList.toggle(klass, name === home);
    }
    // After the class is on, so the pass reads the home it is being told about rather than the one
    // it is replacing.
    if (changed) onHomeChange?.();
}

/**
 * Whether the reader's zoom reaches the boards at all.
 *
 * ONLY TALL LANDSCAPE ZOOMS. The mobile layouts — short landscape and portrait — draw every board
 * at its allowance and always have: their boards are sized to fill a fixed budget exactly, so
 * there is nothing for a slider to change. That is why those modes show no resize handle, and it
 * is also why a board there always has ZERO spare room, which is what keeps its coordinates inside
 * its squares and its username inside its strip.
 *
 * Stated here because the unification made it necessary. While short landscape had a geometry of
 * its own it ignored `scale` by simply not reading it; sharing the units means it would read the
 * stored zoom and honour it — so a preference set on a desktop would shrink a phone's boards, and
 * a control that has no handle would silently be in force.
 *
 * THE ONE PLACE THIS FILE NAMES A MODE, and reluctantly: every other decision here is derived from
 * the viewport rather than from a breakpoint. The alternative is worse — the stylesheet would have
 * to undo the zoom by aliasing to the allowance, which leaves `toolsHome()` still choosing a home
 * for a board size that is not on screen.
 */
function zoomReachesBoards(): boolean {
    return window.matchMedia('(aspect-ratio > 9/16) and (height >= 600px)').matches;
}

export function publishSquareUnit(): void {
    const style = document.documentElement.style;
    const sq = squareUnit(availableHeight());
    style.setProperty(CSS_PROPERTY, `${sq}px`);

    // Short landscape's right board, by the same rule tall landscape follows.
    //
    // THE TWO PAGES SPACE THEIR TRACKS DIFFERENTLY HERE, and the promise is only kept if the
    // budget subtracts what this page actually spends. The round page has two tracks with one
    // gap between them — the rank-label gutter, `-1 * --ranks-right`, a constant from
    // extensions.css, so reading it is not circular. The analysis page has three tracks and
    // two `2vmin` gaps, the same spacing tall landscape uses. Measured at 899x550 with the
    // gutter charged on the analysis page: gaps really cost 21.7px, not 15, and the tools came
    // out 24.1px against a 27.3px promise — the shortfall is exactly the difference.
    const shortGaps = stacksIncludeGauge()
        ? TALL_COLUMN_GAP_COUNT * TALL_COLUMN_GAP_FRACTION * Math.min(availableWidth(), availableHeight())
        : Math.abs(
              parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ranks-right')) || 0,
          );
    // THE SAME CASCADE AS `arrangement()`, in this mode's own terms: the partner board pays for the
    // tools column while it can, and stops at half the viewer's board. It had the tools term from
    // the start and no floor at all, which is how it drew a partner board at 2px of square — a 16px
    // board — at 700px of width. Below the floor the tools are leaving the row, so the charge comes
    // off again; which home they go to is `toolsHome()`'s answer, from the same rule.
    const shortUnit = (budget: number) =>
        squareUnit((Math.max(0, budget) * FILES) / stackSquares(), FILES, window.devicePixelRatio);
    const shortBudget = availableWidth() - stackSquares() * sq - shortGaps;
    const shortPaying = Math.min(sq, shortUnit(shortBudget - TOOLS_MIN_SQUARES * sq));
    const shortRight =
        shortPaying >= RIGHT_MIN_IN_LEFT_SQUARES * sq ? shortPaying : Math.min(sq, shortUnit(shortBudget));
    style.setProperty(SHORT_LANDSCAPE_RIGHT_PROPERTY, `${shortRight}px`);

    // Portrait's two units. Published unconditionally rather than behind an
    // orientation check: they are inert wherever the portrait rules do not apply,
    // and a check would have to be kept in step with the media query by hand.
    const dpr = window.devicePixelRatio;
    style.setProperty(
        PORTRAIT_MAIN_PROPERTY,
        `${onLayoutGrid(quantize(availableWidth(), FILES, dpr) / FILES)}px`,
    );
    style.setProperty(
        PORTRAIT_PARTNER_PROPERTY,
        `${onLayoutGrid(quantize(availableHeight() * PARTNER_HEIGHT_FRACTION, FILES, dpr) / FILES)}px`,
    );

    // Same ten rows as short landscape, over the height left by the header.
    // Published unconditionally for the same reason as the portrait pair.
    //
    // Scaled BEFORE quantising, which is the whole point: a column at 80% of a 76px
    // unit wants 60.8 device pixels per square, and chessgroundx can only draw 60 —
    // so a track built by scaling afterwards asked for 486.39 and got a 480 board,
    // with the 6.39 collecting on the left because chessgroundx pins its container
    // to the right. Scaling the height first makes the quantised result exact at
    // every zoom instead of only at the zooms where the product happens to land on
    // a whole device pixel.
    const stackHeight = availableStackHeight();
    style.setProperty(APP_HEIGHT_PROPERTY, `${stackHeight}px`);

    // A resize moves the floor under a zoom that was already set — a window narrowed enough
    // takes the right board's allowance down, and a zoom that was legal before is now below the
    // smallest stack this layout allows. Nothing else runs on resize, so the clamp belongs here.
    for (const boardName of ['a', 'b'] as const) {
        scale[boardName] = clampZoom(boardName, scale[boardName] * 100) / 100;
    }
    // ALLOWANCES FIRST, THEN THE ZOOM SCALES THEM. Each column's allowance is what it may take
    // at full zoom — the height's answer for the left board, and for the right board that or
    // the width's, whichever is smaller. The drawn unit is then the allowance scaled by that
    // column's zoom and quantised, which is what makes a percentage mean the same thing on both
    // sliders: 100% is "as large as I am allowed" on each.
    //
    // The previous form scaled the HEIGHT and applied the width as a separate ceiling afterwards.
    // Measured at 996x730 with the right board capped at 50.00 against a 66.67 height: 80% and
    // 100% both drew 50.00 — the top quarter of that slider did nothing at all — and the two
    // boards reached any given stack height at unrelated percentages.
    //
    // The right board's allowance is measured against the left board's CANONICAL square, not its
    // current one, so zooming the left board does not resize the right one under the reader, and
    // the floor below does not move when the other slider does.
    //
    // ASKED FOR RATHER THAN RECOMPUTED. Both allowances came from a copy of `allowanceFor()`'s
    // arithmetic inlined here, which was the same answer only for as long as that function stayed
    // this simple — and it stopped being, the moment the left board gained a width cap of its own.
    // `minZoomPercent()` reads the same function, so the floor a slider offers and the size a
    // board is drawn at cannot now disagree.
    const leftAllowance = allowanceFor('a', dpr);
    const rightAllowance = allowanceFor('b', dpr);
    style.setProperty(TALL_ALLOWANCE_PROPERTY.a, `${leftAllowance}px`);
    style.setProperty(TALL_ALLOWANCE_PROPERTY.b, `${rightAllowance}px`);
    publishToolsHome(toolsHome(dpr));

    const zoomed = zoomReachesBoards();
    const drawn: Record<BugBoardName, number> = {
        a: squareUnit(leftAllowance * ROWS_IN_SHORT_LANDSCAPE * (zoomed ? scale.a : 1), ROWS_IN_SHORT_LANDSCAPE, dpr),
        b: squareUnit(rightAllowance * ROWS_IN_SHORT_LANDSCAPE * (zoomed ? scale.b : 1), ROWS_IN_SHORT_LANDSCAPE, dpr),
    };
    for (const boardName of ['a', 'b'] as const) {
        style.setProperty(TALL_LANDSCAPE_PROPERTY[boardName], `${drawn[boardName]}px`);
    }
}

let listening = false;

/**
 * Recompute on viewport resize. The inputs are the viewport height and the
 * device pixel ratio, and `resize` covers both — it also fires on browser zoom,
 * which changes devicePixelRatio.
 *
 * The handler runs before style and layout are recomputed, so the grid is
 * already final by the time layout happens; chessgroundx's own ResizeObserver is
 * delivered after layout and therefore measures the settled geometry. Nothing
 * further is needed here.
 */
export function trackSquareUnit(zoom: Record<BugBoardName, number>): void {
    for (const boardName of ['a', 'b'] as const) scale[boardName] = zoom[boardName] / 100;
    publishSquareUnit();
    if (listening) return;
    listening = true;
    window.addEventListener('resize', publishSquareUnit, { passive: true });
}

/**
 * A column's zoom changed, so its unit has to be quantised again at the new scale.
 *
 * This is the second of the two sanctioned redraw points — the user moved a slider
 * — and it is a republish rather than a re-measurement: the new track width is
 * arithmetic this module already knows, so nothing has to look at the page to find
 * it out. Called by `boardSettings.updateZoom()`, which owns the value.
 */
export function setBoardZoom(boardName: BugBoardName, zoom: number): void {
    scale[boardName] = clampZoom(boardName, zoom) / 100;
    publishSquareUnit();
}
