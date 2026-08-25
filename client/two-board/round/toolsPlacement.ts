/**
 * Which arrangement the merged second column is in.
 *
 * The column holds the partner board's stack and the tools' parts. Four
 * arrangements, in the order things leave the strip beside the board:
 *
 *   (none)                stack | chat        everything stays beside the board
 *                         stack | p1
 *                         stack | p2
 *                         stack | tablist
 *
 *   drop-tablist          stack | chat        the tab bar spans the full width,
 *                         stack | p1          under both the board and the parts
 *                         stack | p2          above it
 *                         tablist tablist
 *
 *   + drop-p2             stack | chat        the second preset part follows
 *                         stack | p1
 *                         p2 p2
 *                         tablist tablist
 *
 *   + drop-p1             stack | chat        and then the first
 *                         p1 p1
 *                         p2 p2
 *                         tablist tablist
 *
 * The chat never moves. It sits beside the board in every arrangement and takes
 * whatever height the others leave, which is what "fills the column" means here.
 *
 * A dropped preset part is wider, and being wider it is SHORTER: its two sets of
 * five buttons stop stacking and share a row. So dropping only makes the decision
 * that caused it more true, which is why nothing here needs damping.
 *
 * WHY THIS IS MEASURED RATHER THAN EXPRESSED IN CSS. Whether a part can drop
 * depends on whether the board's stack still fits in what would be left — a
 * comparison between two lengths, one of which (the board) is driven by a zoom
 * slider and the other by content. CSS has no conditional on that. Grid areas can
 * express each arrangement exactly, including the spanning that a flex item cannot
 * do, but something has to choose between them.
 *
 * `flex-flow: column wrap` was an earlier attempt and chooses by itself, which is
 * why it was tried first. It gets the wrong answer for this: wrapping moves the LAST
 * items into a new column BESIDE, so the chat was the part that ended up under the
 * board and nothing ever widened.
 */

const COLUMN = '.bug-right-column';
const STACK = '.bug-partner-stack';

/**
 * The parts that can leave the strip beside the board, in the order they leave,
 * paired with the class that says each has left.
 *
 * The order is the point: the tab bar goes first, then the presets from the bottom
 * up. The chat is not in this list at all — it never moves, and what it does
 * instead is take whatever height the others leave behind.
 */
const DROPPABLE: ReadonlyArray<readonly [selector: string, className: string]> = [
    ['.bug-round-tools-bar', 'drop-tablist'],
    ['.chatpresets-panel-2', 'drop-p2'],
    // Two elements share this area and never coexist: the first preset part while
    // the game is on, the end-of-game controls once it is not. Whichever is showing
    // is the one whose height decides, so the selector matches both and the heights
    // are summed — the other contributes nothing because it is not displayed.
    ['.chatpresets-panel-1, .bug-gameover', 'drop-p1'],
];

/**
 * Height the matching elements would occupy ONCE DROPPED, counting only those
 * actually displayed.
 *
 * A hidden tab's part and an end-of-game element on a game still in progress both
 * contribute nothing, which is what lets one selector stand for "whatever occupies
 * this area right now".
 *
 * WHY THE DROPPED HEIGHT RATHER THAN THE CURRENT ONE. A part beside the board is
 * as tall as it needs to be at that width; dropped, it has the whole column and its
 * two sets of buttons share one row instead of stacking, so it is about half as
 * tall. Charging the pre-drop height asks the board to give up twice what the part
 * will actually cost, and the part then waits for room it does not need — which is
 * why one preset row would flow while the other, identical in every way, would not.
 *
 * The dropped height is not guessed: a part's rows are its sets, so dropping folds
 * all of them onto the tallest one. Anything without sets is charged what it is.
 */
function heightOf(root: HTMLElement, selector: string): number {
    let total = 0;
    for (const el of root.querySelectorAll<HTMLElement>(selector)) {
        if (el.offsetParent === null) continue;

        // An element with nothing in it costs nothing, whatever it measures. The
        // end-of-game controls share an area with the first preset part and are empty
        // while a game is on — but empty is not the same as hidden: the element
        // stretches to its row and reported 64.1px of height it had no content for.
        // Charging that phantom against the space left for the board is what kept a
        // preset row from flowing when there was room for it twice over.
        if (el.children.length === 0) continue;

        const height = el.getBoundingClientRect().height;
        const sets = [...el.querySelectorAll<HTMLElement>('.chatpresets-set')];
        const rows = new Set(sets.map(set => Math.round(set.getBoundingClientRect().top)));
        if (sets.length > 1 && rows.size > 1) {
            // fold the stacked rows onto one: subtract all but the tallest set
            const heights = sets.map(set => set.getBoundingClientRect().height).sort((a, b) => b - a);
            total += height - heights.slice(1).reduce((sum, h) => sum + h, 0);
        } else {
            total += height;
        }
    }
    return total;
}

/**
 * Recompute every class from the current geometry.
 *
 * Measured from the elements rather than from the published square unit, because
 * the parts' heights come from their content and the layout has to agree with what
 * is actually on the page, not with what it should be.
 *
 * A part is charged what it will cost once dropped, not what it costs where it is —
 * see `heightOf`. Charging the pre-drop height made the test so conservative that a
 * part waited for twice the room it needed.
 */
function place(column: HTMLElement): void {
    const stack = column.querySelector<HTMLElement>(STACK);
    if (!stack) return;

    const available = column.clientHeight;
    const stackHeight = stack.getBoundingClientRect().height;

    // Each part drops only if every part before it in the order has dropped too,
    // and the board's stack still fits in the height left once this one has gone
    // as well. Cumulative, so the parts leave from the bottom up and never leave a
    // gap in the middle of the strip.
    let stillBeside = available;
    let previousDropped: boolean = true;
    for (const [selector, className] of DROPPABLE) {
        stillBeside -= heightOf(column, selector);
        const drops: boolean = previousDropped && stackHeight <= stillBeside;
        column.classList.toggle(className, drops);
        previousDropped = drops;
    }
}

let observer: ResizeObserver | undefined;

/**
 * Keep the arrangement in step with the page.
 *
 * Everything that can change the answer changes the size of one of these elements:
 * the viewport and the zoom slider both resize the stack, selecting a tab shows or
 * hides the preset parts, and the column itself resizes with the window. So one
 * observer over the stack and every droppable part covers each case without any of
 * them having to know to call us.
 *
 * Toggling a class re-lays out and the observer fires again, which is intended — it
 * settles on the next pass. It terminates because dropping a part can only make it
 * shorter, never taller, so a drop cannot undo its own precondition.
 */
export function trackToolsPlacement(): void {
    const column = document.querySelector<HTMLElement>(COLUMN);
    if (!column) return;

    place(column);

    observer?.disconnect();
    observer = new ResizeObserver(() => place(column));
    observer.observe(column);
    for (const selector of [STACK, ...DROPPABLE.map(([selector]) => selector)]) {
        for (const el of column.querySelectorAll<HTMLElement>(selector)) observer.observe(el);
    }
}
