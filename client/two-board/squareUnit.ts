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

/**
 * Publish the unit for CSS.
 *
 * MUST be called before the boards are constructed. The grid tracks reference
 * `var(--bug-sq)` with no fallback, so chessgroundx has to measure a wrap that
 * is already at its final size — if this runs afterwards the boards move under
 * an already-memoized `bounds` and every click lands on the wrong square, which
 * is the bug this exists to prevent.
 */
export function publishSquareUnit(): void {
    const style = document.documentElement.style;
    const sq = squareUnit(availableHeight());
    style.setProperty(CSS_PROPERTY, `${sq}px`);

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
    for (const boardName of ['a', 'b'] as const) {
        style.setProperty(
            TALL_LANDSCAPE_PROPERTY[boardName],
            `${squareUnit(stackHeight * scale[boardName], ROWS_IN_SHORT_LANDSCAPE, dpr)}px`,
        );
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
    scale[boardName] = zoom / 100;
    publishSquareUnit();
}
