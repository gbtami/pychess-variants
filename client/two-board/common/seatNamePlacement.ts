/**
 * Whether a seat's username gets a line of its own, outside the pocket-and-clock row.
 *
 * OUTSIDE, not below: the name leaves upwards from a strip above its board and
 * downwards from one below it, so that the clock always stays against the board. The
 * classes said `-below` while that was the only direction there was; the direction is
 * now the strip's business and the name only says that the line is outside the row.
 *
 * The username on one line is the wanted arrangement. Squeezed between the pocket
 * and the clock it gets whatever width those two leave, which on a reduced board is
 * almost nothing — measured at 19.4px, and at 5.8px before the furniture scaled.
 * A line of its own is the full width of the strip.
 *
 * It costs a line of height per strip, two per stack, and that is the whole
 * question: at full zoom the stack is exactly the height it is given — ten squares —
 * so there is nothing to spend. Below full zoom the board has given height back and
 * the line is free. So the rule is "its own line, except near full zoom", and it is
 * decided per seat, because the two boards can be at different zooms and the answer
 * differs between them.
 *
 * WHY MEASURED. The condition is whether one length fits inside another, where one
 * is driven by a zoom slider and the other by the viewport. CSS has no conditional
 * on that. It could be approximated with a threshold on the scale — the arithmetic
 * puts the crossover near 0.95 — but that hard-codes the name's line height and the
 * stack's composition into a number that would silently rot the moment either
 * changed. Measuring asks the page what it actually is.
 */

/* BOTH PAGES, ONE RULE. The analysis page answered this question a second time, in CSS —
   `--bug-name-outside`, arithmetic on the same room with the line's cost charged at the
   font's CAP rather than measured. Two implementations of one question about a STACK, which
   is a component both pages build the same way, and they disagreed: measured across the 264
   rows of the layout survey, 33 partner stacks on the round page were granted a line the
   arithmetic refused — 37 to 49px of room against a charge of 53.8 where the line really
   costs 31.9 to 40.6. Nowhere did the arithmetic grant one this does not. So the CSS decision
   is gone and this module is where the question is asked; each page still says for ITSELF what
   "outside" looks like, which is the part that legitimately differs. */
const APP = '.round-app.bug, .analysis-app.bug';

/** A stack is a strip, eight board rows and a strip — the same ten `squareUnit.ts` divides by. */
const ROWS_PER_STACK = 10;

/**
 * Each seat, the class that says its name is on its own line, and its board.
 *
 * The board is named by ROLE — `.own-board` / `.partner-board`, the classes
 * markRoles() maintains — never by identity. `#mainboard` is board A whoever is
 * playing on it, so a board-B player or anyone who has switched boards gets the
 * pairing backwards: measured in portrait with the boards switched, the partner seat
 * was sized against a 362.7px board and the own seat against a 165.3px one, so the
 * partner's name was refused a line it had room for and the own seat was granted one
 * on the strength of the partner's numbers.
 */
const SEATS = [
    { seat: '.own-seat', className: 'own-name-outside', board: '.own-board cg-board' },
    { seat: '.partner-seat', className: 'partner-name-outside', board: '.partner-board cg-board' },
] as const;

/**
 * What a seat's own line actually costs in height — ALWAYS MEASURED, by putting the seat
 * in that state and reading it.
 *
 * NOT the name's `line-height`. That was the first attempt and it oscillates: the name
 * box carries a presence dot and a rating beside the text, so the strip grows by
 * noticeably more than one line. Measured on a seat whose square was 50px: line-height
 * 12.54, real growth 17.5 per strip — 25.07 predicted against 36.09 actual for the
 * pair. The layout then predicted cheap, granted the line, overflowed, took it back,
 * predicted cheap again, and flipped forever at roughly 12Hz.
 *
 * NOR THE FONT, WHICH WAS THE SECOND ATTEMPT AND IS WHY THIS NOW TRIES IT. A seat without
 * the line was charged twice its rendered font size, which is an over-estimate on the round
 * page — the name is at its 16.8px cap there, so 33.6 against a real 20.3 — and a wild
 * under-estimate on the analysis page, where the name's size comes from a container query
 * and falls with the strip: measured at 768x1024 with both boards at minimum zoom, a name
 * rendering at about 5px charged some 20px for a line that costs 45.2. Ported as it was,
 * that seat would have been granted a line it cannot afford, measured the real cost on the
 * next pass, taken it back, and flipped — the 12Hz failure again, by a different route.
 *
 * TRYING IT IS CHEAPER THAN PREDICTING IT. The class is toggled on, the strip is read, and
 * the class is put back; the caller then decides against a real number. It costs one forced
 * layout per seat that does not already have its line, and it cannot be wrong about a cost
 * that depends on the arrangement it is asking about — which the name's size does, since
 * the wider row a line gives it is what makes it larger.
 */
function lineCost(app: HTMLElement, seat: HTMLElement, className: string, squareHeight: number): number {
    const read = () => seat.getBoundingClientRect().height - squareHeight;
    if (app.classList.contains(className)) return Math.max(0, read());

    app.classList.add(className);
    const cost = read();
    app.classList.remove(className);
    return Math.max(0, cost);
}

/** A seat's square, taken from the board it belongs to rather than from a calc() string. */
function squareOf(app: HTMLElement, boardSelector: string): number {
    const board = app.querySelector<HTMLElement>(boardSelector);
    return board ? board.getBoundingClientRect().height / 8 : 0;
}

/**
 * Room for the extra line is measured against the space the seat's stack is given,
 * not against the stack's own height — the stack is what grows, so asking it how
 * tall it is would be asking the answer to include the question.
 *
 * The space is the rows the stack spans in the app's grid — the same question for both
 * stacks, since the wrapper that used to hold the partner's is gone.
 */
function spaceFor(app: HTMLElement, seat: HTMLElement): number {
    /* THE BOARD'S OWN ALLOWANCE FIRST, where the stylesheet publishes one.
       -------------------------------------------------------------------------------------
       The column is shared and the two boards are no longer the same size in it: the right
       board can be capped by WIDTH, so it sits in a column taller than anything it may use.
       Measured at 799x550 — right square 39.34 against the left's 54.67 — the partner stack
       came to 453px in a 547px column, and this function handed back the column's 547. The
       name took the line those 94px seemed to buy, at full zoom, beside a left board keeping
       its name inline. The room was never the board's to spend.
       `--bug-stack-allow` is that board's square at full zoom, so ten of them is the tallest
       stack it can draw: at full zoom the answer is exactly its own height and no line is
       affordable; below full zoom the difference is real height and the line is free again,
       which is the behaviour this module was written for.
       Portrait publishes none — its stacks are sized from WIDTH — and falls through to the
       measurements below, unchanged. */
    const stack = seat.closest<HTMLElement>('.bug-own-stack, .bug-partner-stack');
    const allow = stack ? parseFloat(getComputedStyle(stack).getPropertyValue('--bug-stack-allow')) : NaN;
    if (Number.isFinite(allow) && allow > 0) return allow * ROWS_PER_STACK;

    // WHERE THE PAGE IS FLATTENED, BOTH STACKS SHARE ONE REGION, and the region is published
    // rather than measured: it is the pinned budget less whatever zone B holds. The app's own
    // height is no use for it — that follows the stacks, so asking it would be asking the answer
    // to include the question.
    const boards = parseFloat(getComputedStyle(app).getPropertyValue('--bug-boards-h'));
    if (Number.isFinite(boards)) return boards;

    // OTHERWISE, THE ROWS THE STACK SPANS. Both stacks are items of the app's grid now — the
    // `.partner-and-tools` wrapper that used to be a box in portrait is gone — so the space a
    // stack is given is the height of its own rows, which the resolved template states exactly.
    //
    // This replaces two measurements of that wrapper: its `clientHeight` for the partner, and
    // the app's height minus the wrapper's for the viewer's own board. The second was there
    // because in portrait the wrapper sat ABOVE the own board rather than beside it, and
    // counting the whole app credited the own stack with the partner's region as well — what
    // let a phone's bottom board believe it had 835px for a 453px stack and take a line for its
    // username. Asking the grid for the rows an item occupies answers both, in every mode, with
    // no rule about which mode it is.
    const rows = rowsSpanned(app, seat.closest<HTMLElement>('.bug-own-stack, .bug-partner-stack'));
    return Number.isFinite(rows) ? rows : app.clientHeight;
}

/**
 * The height of the grid rows an item spans, from its container's RESOLVED template.
 *
 * `getComputedStyle` gives `grid-template-rows` in used pixels and `grid-template-areas` as the
 * quoted row strings, so the two line up index for index: find the rows whose cells name this
 * item's area, and sum them with the gaps between. NaN where the item is not placed by a named
 * area, which is the caller's signal to fall back.
 */
function rowsSpanned(container: HTMLElement, el: HTMLElement | null): number {
    if (el === null) return NaN;
    const area = getComputedStyle(el).gridArea.split(' / ')[0].trim();
    if (area === '' || area === 'auto') return NaN;

    const style = getComputedStyle(container);
    const heights = style.gridTemplateRows.split(/\s+/).map(parseFloat);
    const rows = (style.gridTemplateAreas.match(/"[^"]*"/g) ?? []).map(row =>
        row.slice(1, -1).trim().split(/\s+/),
    );
    if (rows.length === 0 || rows.length !== heights.length) return NaN;

    const gap = parseFloat(style.rowGap) || 0;
    let total = 0;
    let spanned = 0;
    rows.forEach((cells, i) => {
        if (!cells.includes(area)) return;
        total += heights[i];
        spanned += 1;
    });
    return spanned > 0 ? total + (spanned - 1) * gap : NaN;
}

/**
 * The height the coordinate gap has already taken, which is not this decision's to spend.
 *
 * The gap is a margin below the board, so it appears in none of the rects `stackHeight()`
 * sums — it has to be subtracted from the space instead, or both this and the labels would
 * count the same pixels and the stack would overflow by whichever is smaller.
 *
 * The dependency runs ONE WAY, deliberately. The gap is computed from the mode's height and
 * the board's own square, neither of which moves when a name takes a line, so reading it here
 * cannot feed back into it. Letting each take what the other leaves would be two claims on one
 * budget, each measuring the other — the shape that had this module oscillating at 12Hz the
 * last time it compared against something that depended on the answer.
 *
 * `--bug-coord-gap` is registered with @property, so the computed value is a real length and
 * parseFloat gets a number rather than NaN from an unresolved `clamp(...)`.
 */
function coordGap(seat: HTMLElement): number {
    const stack = seat.closest<HTMLElement>('.bug-own-stack, .bug-partner-stack');
    if (!stack) return 0;
    return parseFloat(getComputedStyle(stack).getPropertyValue('--bug-coord-gap')) || 0;
}

/** The stack this seat belongs to: its two strips and the board between them. */
function stackHeight(app: HTMLElement, seat: HTMLElement, boardSelector: string): number {
    const board = app.querySelector<HTMLElement>(boardSelector);
    const strips = app.querySelectorAll<HTMLElement>(
        seat.classList.contains('own-seat') ? '.own-seat' : '.partner-seat',
    );
    let total = board ? board.getBoundingClientRect().height : 0;
    for (const strip of strips) total += strip.getBoundingClientRect().height;
    return total;
}

function place(app: HTMLElement): void {
    for (const { seat, className, board } of SEATS) {
        const element = app.querySelector<HTMLElement>(seat);
        if (!element) continue;

        // The comparison is made against a BASE that does not depend on the answer:
        // the stack as it would be with both names inline. Comparing against the
        // current stack instead is what oscillated — the stack is taller precisely
        // because the line was granted, so the two states disagreed about the same
        // question and each kept overturning the other.
        const square = squareOf(app, board);
        const cost = 2 * lineCost(app, element, className, square);
        const base = stackHeight(app, element, board) - (app.classList.contains(className) ? cost : 0);

        app.classList.toggle(className, base + cost <= spaceFor(app, element) - coordGap(element));
    }
}

let observer: ResizeObserver | undefined;

/**
 * Keep the decision in step. The inputs are the boards' sizes and the space around
 * them, so observing the app, the merged column and both boards covers every way the
 * answer can change — a zoom slider, the viewport, a board switch.
 *
 * Toggling a class changes a stack's height, which fires the observer again. It
 * settles because `place()` compares against a base that excludes the line's cost, so
 * both states answer the same question and agree. An earlier version compared against
 * the current stack — which is taller precisely because the line was granted — and the
 * two states overturned each other about twelve times a second. See `lineCost`.
 */
export function trackSeatNamePlacement(onSettled?: () => void): void {
    const app = document.querySelector<HTMLElement>(APP);
    if (!app) return;

    // `onSettled` runs after every pass, because a name taking or losing its own line changes the
    // strip's height and so MOVES the board inside its stack without resizing it — the one kind of
    // change chessgroundx is never told about. See `clearBoardBounds`.
    const pass = () => {
        place(app);
        onSettled?.();
    };

    pass();

    observer?.disconnect();
    observer = new ResizeObserver(pass);
    observer.observe(app);
    for (const selector of ['.bug-partner-stack', '#mainboard cg-board', '#bugboard cg-board']) {
        const el = app.querySelector<HTMLElement>(selector);
        if (el) observer.observe(el);
    }
}
