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

/* The element that OWNS the arrangement: the one whose `grid-template-areas` the classes swap,
   and therefore the one whose height decides what fits. The two must be the same element or the
   test measures one box and the placement changes another.

   The round page's merged column is a real box and owns its own areas. The analysis page dissolves
   that column so every part is a grid item of the APP, which is where its areas live — and a
   `display: contents` element has no box at all: `clientHeight` reads 0, `available` is 0, and
   nothing can ever drop. Silently, with no error. Hence a parameter rather than a constant. */
const ROUND_CONTAINER = '.bug-right-column';
const STACK = '.bug-partner-stack';
/* The two pages' root elements. Only used to find the owner when the container named above
   has been dissolved — an app is never `display: contents`, so this is where the walk stops. */
const APP = '.round-app.bug, .analysis-app.bug';
/* Zone B's occupant and the second stack it has to clear. The group is `display: contents`
   until it lands there, so it is never measured — the panels inside it are. Asking the group
   whether a part is inside it is also how the loop below knows which parts zone B has already
   taken, so no list of their names has to be kept in step here. */
const PRESETS_GROUP = '.bug-presets-group';
const TOOLS_BAR = '.bug-round-tools-bar';
const OWN_STACK = '.bug-own-stack';
/* The narrowest a row of buttons is ever drawn, matching the `max(3px, ...)` floor every
   pitch in the stylesheet carries. Only used to ask whether a row COULD fit. */
const PITCH_FLOOR = 3;
/* The viewport's height less the header, published by squareUnit.ts. The page is pinned to it,
   so it is the one height here that no arrangement can move — which is exactly what the
   decisions below have to be measured against once the app itself follows its content. */
const BUDGET = '--bug-app-h';
/* The height the app should actually take: the taller board plus whatever sits under both of
   them. Published here because this is already where both stacks are measured. */
const CONTENT_HEIGHT = '--bug-app-content-h';
/* The height the BOARDS may occupy: the pinned budget less whatever zone B is holding. Read by
   seatNamePlacement.ts, which has to know how much room a stack has before deciding whether a
   username can afford a line of its own — and cannot ask the app, whose height now follows the
   stacks and would therefore be answering with the question. */
const BOARDS_HEIGHT = '--bug-boards-h';
/* Whether this mode offers the control labels at all, published by the stylesheet on the bar:
   `1` where they may show, `0` where they never do. Portrait sets it to 0 — see the rule. */
const CONTROLS_LABELS = '--bug-controls-labels';
/* The draw and resign buttons' labels, and the tabs they share the bar with. */
const CONTROL_LABEL = '.control-label';
const CONTROL_BUTTON = '.btn-controls button';
const TAB = '[role="tab"]';

/**
 * The element that actually owns the arrangement, which is not always the one named.
 *
 * Tall landscape flattens the round page: `.bug-right-column` becomes `display: contents` so
 * that a row can span both boards, and a dissolved element has no box — `clientHeight` reads
 * 0, `available` is 0, and nothing could ever drop. Silently, with no error. Its children are
 * grid items of the APP there, and the app is what holds the template the classes swap.
 *
 * Asking the element how it is displayed rather than asking which mode is on: the same call
 * site then works in every mode, and cannot disagree with the stylesheet about which of them
 * is in force.
 */
function owner(el: HTMLElement): HTMLElement {
    return getComputedStyle(el).display === 'contents' ? (el.closest<HTMLElement>(APP) ?? el) : el;
}

/**
 * The parts that can leave the strip beside the board, in the order they leave,
 * paired with the class that says each has left.
 *
 * The order is the point: the tab bar goes first, then the presets from the bottom
 * up. The chat is not in this list at all — it never moves, and what it does
 * instead is take whatever height the others leave behind.
 */
export type Droppable = ReadonlyArray<readonly [selector: string, className: string]>;

/* THE ROUND PAGE'S PARTS. The analysis page passes its own — one entry, its tab list — because
   it has no chat and no presets. Everything else in this file is the same for both: what a part
   costs once dropped, the cumulative test, the classes, and the observer. */
export const ROUND_DROPPABLE: Droppable = [
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
interface ZoneB {
    bar: boolean;
    presets: boolean;
    oneRow: boolean;
    /** The taller of the two stacks, which is what the board region has to be. */
    tallest: number;
    /** Height of whatever zone B ended up holding, so the app can be sized to fit it. */
    cost: number;
}

/**
 * What zone B — the full width under BOTH boards — can take, in the order it fills.
 *
 * Tried before zone A because it is the roomier home and the only one wide enough to put all
 * twenty buttons on one row. It is a row of the app below both stacks, so what it costs is
 * charged against the TALLER of the two: zone A only ever had to clear the partner's board,
 * and a row under both has to clear whichever board is bigger.
 *
 * The presets' cost is one row of buttons or two, and which of those it will be is a question
 * about WIDTH, settled before the height is charged — so a zone that will hold one row is
 * never asked to find the height for two.
 */
function zoneB(app: HTMLElement, group: HTMLElement, budget: number): ZoneB {
    const buttons = [...group.querySelectorAll<HTMLElement>('button')];
    const stacks = [app.querySelector<HTMLElement>(OWN_STACK), app.querySelector<HTMLElement>(STACK)];
    const tallest = Math.max(...stacks.map(el => el?.getBoundingClientRect().height ?? 0));
    const under = budget - tallest;
    const none = { bar: false, presets: false, oneRow: false, tallest, cost: 0 };
    if (!buttons.length) return none;

    // The bar goes first and the presets only follow it — one row of buttons is worth several
    // of the bar, so the zone can afford the bar long before it can afford them, and filling
    // in that order is what stops the two trading places as the boards shrink.
    const bar = heightOf(app, TOOLS_BAR);
    if (bar > under) return none;

    // Measured rather than computed from the stylesheet's own expression: the button's width
    // is what it is on the page, and re-deriving it here would be a second copy of a formula
    // that has already changed once.
    const button = buttons[0].getBoundingClientRect().width;
    const oneRow = app.clientWidth >= buttons.length * button + (buttons.length - 1) * PITCH_FLOOR;

    // One panel folded to a single row is what one row of zone B costs; two rows cost two.
    const row = heightOf(app, '.chatpresets-panel-1');
    const both = bar + (oneRow ? row : row * 2);
    const presets = both <= under;
    return { bar: true, presets, oneRow, tallest, cost: presets ? both : bar };
}

function place(container: HTMLElement, droppable: Droppable): void {
    const column = owner(container);
    const stack = column.querySelector<HTMLElement>(STACK);
    if (!stack) return;

    // The PINNED budget, not the app's current height, wherever the app follows its content:
    // measuring the box these decisions resize would make every answer depend on the last one,
    // and the two would chase each other forever. Where the column is a real box it is not
    // resized by any of this and can be measured directly.
    const flattened = column !== container;
    const budget = flattened ? parseFloat(getComputedStyle(column).getPropertyValue(BUDGET)) : NaN;
    const available = Number.isFinite(budget) ? budget : column.clientHeight;
    const stackHeight = stack.getBoundingClientRect().height;

    // Zone B first — see `zoneB`. The classes go on the same element as every other
    // arrangement class, which is the one whose template they swap.
    //
    // ONLY WHERE THE COLUMN HAS BEEN FLATTENED, because that is the only layout in which zone B
    // exists at all. A row under BOTH boards needs the two stacks to be rows of one grid, which
    // is what `display: contents` on the column achieves and what its stylesheet block — the
    // same one that carries every `drop-*-b` rule — is scoped to. Everywhere else the boards are
    // not in one grid: portrait stacks them as `rightcol` over `ownstack`, so the row a part
    // would drop into is under the TOP board only, which is what zone A already is.
    //
    // Asked anyway, it answered about a layout that is not on the page — `.bug-own-stack` is
    // outside the column there, so the taller stack was the partner's board alone — and then
    // claimed the tools bar for a `drop-tablist-b` no rule matches. The bar stayed beside the
    // board AND the zone A loop below skipped it as already taken, so `drop-tablist` never went
    // on, and with it the `.drop-tablist.drop-p2` chain that drops the presets. Nothing moved in
    // portrait or short landscape at any width.
    const group = flattened ? column.querySelector<HTMLElement>(PRESETS_GROUP) : null;
    const b = group
        ? zoneB(column, group, available)
        : { bar: false, presets: false, oneRow: false, tallest: 0, cost: 0 };

    // THE PANEL FOLLOWS THE TALLER BOARD. The app is pinned to the viewport, so its `1fr` row
    // swallowed every pixel the boards did not use — measured as a 576px chat beside a 448px
    // board, with the buttons stranded below a band of empty space. Sized to the boards plus
    // whatever zone B holds, the same `1fr` gives the panel exactly the board's height and the
    // rows below it close up under them. Never more than the budget, so it cannot overflow.
    if (flattened && b.tallest > 0) {
        column.style.setProperty(CONTENT_HEIGHT, `${Math.min(available, b.tallest + b.cost)}px`);
        column.style.setProperty(BOARDS_HEIGHT, `${available - b.cost}px`);
    }
    column.classList.toggle('drop-tablist-b', b.bar);
    column.classList.toggle('drop-presets-b', b.presets);
    // Only the single row reorders the two panels, so the shape has to be said out loud. The
    // flex wrap reaches the same answer from the same arithmetic — two panels at the floor
    // pitch against the zone's width — so the class and the shape cannot disagree.
    column.classList.toggle('presets-one-row', b.presets && b.oneRow);

    // Each part drops only if every part before it in the order has dropped too,
    // and the board's stack still fits in the height left once this one has gone
    // as well. Cumulative, so the parts leave from the bottom up and never leave a
    // gap in the middle of the strip.
    let stillBeside = available;
    let previousDropped: boolean = true;
    for (const [selector, className] of droppable) {
        stillBeside -= heightOf(column, selector);
        // Zone B has already taken this part, so zone A must not claim it as well. Its height
        // is still charged above: zone B is a row of the same grid and costs the boards the
        // same space wherever in it the row sits.
        const el = column.querySelector<HTMLElement>(selector);
        const inZoneB = el
            ? group?.contains(el)
                ? b.presets
                : el.matches(TOOLS_BAR) && b.bar
            : false;
        const drops: boolean = !inZoneB && previousDropped && stackHeight <= stillBeside;
        column.classList.toggle(className, drops);
        previousDropped = drops || inZoneB;
    }

    // Last, because it asks where the bar ENDED UP — so it has to run once the arrangement
    // above has settled rather than against the previous pass's answer.
    labelControls(column);
}

/**
 * What a tab's text actually occupies, which is not what the tab occupies.
 *
 * The tabs are `flex: 1 1 0` and share the bar equally, so each one's box is a third of
 * whatever the bar happens to be — 356px here for text 30px wide — and `scrollWidth` reports
 * that box rather than the text in it. A range over the contents measures the text itself,
 * whatever the box around it has been stretched to.
 */
function textWidth(el: HTMLElement): number {
    const range = document.createRange();
    range.selectNodeContents(el);
    const width = range.getBoundingClientRect().width;
    const style = getComputedStyle(el);
    return width + parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
}

/**
 * Whether the draw and resign buttons can afford to name themselves.
 *
 * Beside the board the bar is a tools column wide and the two are icons; dropped into zone A
 * or zone B it is most of the page, and the room the icons are sitting in is enough to say
 * what they do. Both labels or neither — one labelled button beside one bare icon reads as a
 * rendering fault rather than as a choice.
 *
 * THE BASE EXCLUDES THE ANSWER, as everywhere else here: the buttons are measured with their
 * labels' own width taken back off, so the question is the same whether they are showing or
 * not. Measured against what the TABS need rather than what they occupy — they stretch to
 * fill, so what they occupy is simply whatever is left and would answer nothing.
 */
function labelControls(app: HTMLElement): void {
    const bar = app.querySelector<HTMLElement>(TOOLS_BAR);
    if (!bar) return;
    const labels = [...bar.querySelectorAll<HTMLElement>(CONTROL_LABEL)];
    if (!labels.length) return;

    // ONLY WHERE THE MODE OFFERS THEM. Portrait publishes 0 and is never asked the width
    // question: the bar is a phone wide and the words are not what that row is for.
    //
    // The class comes back off rather than being left set-but-inert. A class that says a
    // thing the page is not doing is the shape of bug this file has already produced once —
    // `drop-tablist-b` sat on an element no rule matched, and the arrangement it claimed to
    // have made had not happened.
    if (getComputedStyle(bar).getPropertyValue(CONTROLS_LABELS).trim() === '0') {
        app.classList.remove('controls-labelled');
        return;
    }

    // ONLY ONCE THE BAR HAS LEFT THE STRIP BESIDE THE BOARD. Room alone is not the whole
    // question: beside the board the bar is a tools column wide and both labels do fit there —
    // 279px of a 340px bar, measured — but they fit by squeezing the three tabs down to their
    // text, which is spending the tab row to caption two buttons. Dropped into zone A or zone B
    // the bar is most of the page and the room is genuinely spare, which is the case these
    // labels are for.
    const dropped = app.classList.contains('drop-tablist') || app.classList.contains('drop-tablist-b');
    if (!dropped) {
        app.classList.remove('controls-labelled');
        return;
    }

    const width = (el: HTMLElement) => el.getBoundingClientRect().width;
    const tabs = [...bar.querySelectorAll<HTMLElement>(TAB)].reduce((sum, t) => sum + textWidth(t), 0);
    const icons = [...bar.querySelectorAll<HTMLElement>(CONTROL_BUTTON)].reduce((sum, b) => sum + width(b), 0);
    const shown = labels.reduce((sum, l) => sum + width(l), 0);
    const wanted = labels.reduce((sum, l) => sum + l.scrollWidth, 0);

    app.classList.toggle('controls-labelled', tabs + (icons - shown) + wanted <= bar.clientWidth);
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
export function trackToolsPlacement(droppable: Droppable, container: string = ROUND_CONTAINER): void {
    const column = document.querySelector<HTMLElement>(container);
    if (!column) return;

    place(column, droppable);

    observer?.disconnect();
    observer = new ResizeObserver(() => place(column, droppable));
    // The owner is what resizes when the arrangement changes, and the named container is what
    // resizes when the mode does — observe both, so neither kind of change is missed.
    observer.observe(owner(column));
    if (owner(column) !== column) observer.observe(column);
    for (const selector of [STACK, ...droppable.map(([selector]) => selector)]) {
        for (const el of owner(column).querySelectorAll<HTMLElement>(selector)) observer.observe(el);
    }
}
