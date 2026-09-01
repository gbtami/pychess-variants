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

const APP = '.round-app.bug';

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
 * What a seat's own line actually costs in height.
 *
 * NOT the name's `line-height`. That was the first attempt and it oscillates: the name
 * box carries a presence dot and a rating beside the text, so the strip grows by
 * noticeably more than one line. Measured on a seat whose square was 50px: line-height
 * 12.54, real growth 17.5 per strip — 25.07 predicted against 36.09 actual for the
 * pair. The layout then predicted cheap, granted the line, overflowed, took it back,
 * predicted cheap again, and flipped forever at roughly 12Hz.
 *
 * So: measure it where it can be measured, and over-estimate where it cannot. A seat
 * that already has its line reports what the line is really costing — the strip's
 * height above one square. A seat that does not is charged twice its font size, which
 * is above the ~1.6 ratio observed, because the failure mode of under-charging is an
 * infinite loop and the failure mode of over-charging is one seat that keeps its name
 * inline when it might just have fitted.
 */
function lineCost(seat: HTMLElement, squareHeight: number): number {
    const measured = seat.getBoundingClientRect().height - squareHeight;
    if (measured > 1) return measured;

    const name = seat.querySelector<HTMLElement>('round-player0, round-player1');
    if (!name) return 0;
    return parseFloat(getComputedStyle(name).fontSize) * 2;
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
 * The space is the column the stack sits in: `.bug-right-column` for the partner,
 * the round app itself for the viewer's own board.
 */
function spaceFor(app: HTMLElement, seat: HTMLElement): number {
    // WHERE THE PAGE IS FLATTENED, BOTH STACKS SHARE ONE REGION and neither is in a column that
    // can be measured. `.bug-right-column` is still their ancestor but it is `display: contents`
    // there — no box, `clientHeight` reads 0 — so the partner seat was told it had no room at
    // all and could never take the line, while the own seat fell through to the app and kept
    // getting one. That is the asymmetry this fixes.
    //
    // The region is published rather than measured here: it is the pinned budget less whatever
    // zone B holds, and the app's own height is no use for it — that now follows the stacks, so
    // asking it would be asking the answer to include the question.
    const dissolved = app.querySelector<HTMLElement>('.bug-right-column');
    if (dissolved && getComputedStyle(dissolved).display === 'contents') {
        const boards = parseFloat(getComputedStyle(app).getPropertyValue('--bug-boards-h'));
        if (Number.isFinite(boards)) return boards;
    }

    const column = seat.closest<HTMLElement>('.bug-right-column');
    if (column) return column.clientHeight;

    // The viewer's own stack is not in the merged column, so its space is the app —
    // minus the column when the column is ABOVE it rather than beside it. In the
    // landscape modes the two sit side by side and share the app's full height; in
    // portrait the column takes the region above the own board, so counting the whole
    // app credits the own stack with the column's height as well.
    //
    // That miscount is what let a phone's bottom board believe it had 835px for a
    // 453px stack and take a line for its username. Measured, it has exactly its own
    // height and can never take one — which is the intended behaviour, arrived at by
    // measuring correctly rather than by a rule saying "not in portrait".
    const merged = app.querySelector<HTMLElement>('.bug-right-column');
    if (!merged) return app.clientHeight;

    const beside = Math.abs(merged.clientHeight - app.clientHeight) < 2;
    return beside ? app.clientHeight : app.clientHeight - merged.getBoundingClientRect().height;
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
        const cost = 2 * lineCost(element, square);
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
export function trackSeatNamePlacement(): void {
    const app = document.querySelector<HTMLElement>(APP);
    if (!app) return;

    place(app);

    observer?.disconnect();
    observer = new ResizeObserver(() => place(app));
    observer.observe(app);
    for (const selector of ['.bug-right-column', '#mainboard cg-board', '#bugboard cg-board']) {
        const el = app.querySelector<HTMLElement>(selector);
        if (el) observer.observe(el);
    }
}
