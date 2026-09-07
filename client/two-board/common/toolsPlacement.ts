import { toolsMinWidth } from '../squareUnit';
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
/* The smallest a preset button is ever drawn, which is what the part's height would be if the
   room ran out — the lower bound of the hysteresis band in `zoneB()`. */
const PRESET_FLOOR = '--bug-preset-btn-min';
/* The largest a preset button is ever drawn: one board square, because a preset button is a
   picture of a piece and must not outgrow the piece it refers to. Needed only because the size
   comes from spare HEIGHT, which a tall window has in quantities the buttons have no use for. */
const PRESET_CEILING = '--bug-preset-btn-max';
/* The chat, which is paid before the preset buttons may take any of the tools' height. ASKED OF
   THE CHAT rather than restated here: the stylesheet declares it in lines, which is the unit a
   chat is legible in, and a second figure kept on this side disagreed with it — three squares of
   the viewer's board, 150px on a window whose chat wanted 210, so the buttons were charged less
   than they cost. The fallback covers the moment before layout only.

   TWO PARTS, because the chat is two things. The message list is text and its minimum is declared
   in messages; the input below it is a control of a definite height, so it is MEASURED. Estimating
   it was the second half of the same bug: `2.5rem` reserved 40px for a 25px input. */
const CHAT = '.bugroundchat';
const CHAT_INPUT = '.bugroundchat input';
const CHAT_MIN_LINES = '--bug-chat-min-lines';
const CHAT_MSG_ADVANCE = '--bug-chat-msg-advance';
const CHAT_MIN_FALLBACK = 210;

/** The height the chat is owed: the messages it declares, at the advance it declares, plus its
 * input as drawn.
 *
 * COMPUTED HERE RATHER THAN READ OFF A `min-height`, because it is a claim on the spare height and
 * not a floor on the box. Declared as `min-height` it overflowed every row too short to grant it —
 * 191px of chat in a 129px zone B row — and the overflow landed on top of the preset buttons. */
function chatMinHeight(app: HTMLElement): number {
    const chat = app.querySelector<HTMLElement>(CHAT);
    if (chat === null) return CHAT_MIN_FALLBACK;

    const lines = parseFloat(getComputedStyle(chat).getPropertyValue(CHAT_MIN_LINES));
    const advance = resolvedLength(chat, CHAT_MSG_ADVANCE);
    if (!(lines > 0) || !(advance > 0)) return CHAT_MIN_FALLBACK;

    // Not `heightOf`: that skips childless elements, and an <input> has no children.
    const input = app.querySelector<HTMLElement>(CHAT_INPUT);
    return lines * advance + (input === null ? 0 : input.getBoundingClientRect().height);
}
const PRESET_GAP = '--bug-preset-gap';
/* The smallest gap between two buttons, and the value every row's WRAP is decided at — see
   `publishPresetGap()` for why the decision cannot be taken at the gap it produces. */
const PRESET_GAP_FLOOR = '--bug-preset-gap-min';
/* Which edge a row's leftover falls on — see `publishPresetGap()`, which decides it from whether
   the rows all hold the same number of buttons. */
const PRESET_ALIGN = '--bug-preset-align';
const PRESETS_FLEX = '.chatpresets';
const SET = '.chatpresets-set';
const PRESET_ROW_GAP = '--bug-preset-row-gap';
const PRESET_SIZE = '--bug-preset-btn';
/* A set is five buttons that never break apart, so a panel of ten draws as one row or two, and
   the pair of panels as two rows or four. */
const SET_COLUMNS = 5;
const PANEL_SETS = 2;
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
        const sets = [...el.querySelectorAll<HTMLElement>(SET)];
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
/** The height the stacks and the zones share, published by squareUnit.ts. */
function budgetForZones(app: HTMLElement): number {
    const budget = parseFloat(getComputedStyle(app).getPropertyValue(BUDGET));
    return Number.isFinite(budget) ? budget : app.clientHeight;
}

/**
 * What zone B is holding, measured from the parts themselves.
 *
 * Asked of the LAYOUT rather than of a list of names: which parts are in zone B is decided by the
 * arrangement the stylesheet is in, and reading their placement back is the one description that
 * cannot fall out of step with it. A part in any other zone contributes nothing here — zone A's
 * occupants are inside the taller stack's height already, and the strip beside the boards is in a
 * column, not a row.
 */
function zoneBHeight(app: HTMLElement): number {
    return [...app.querySelectorAll<HTMLElement>('.bug-parts > *')]
        .filter(el => getComputedStyle(el).gridArea.startsWith('zoneB'))
        .reduce((total, el) => total + el.getBoundingClientRect().height, 0);
}

/**
 * THE SIZE OF A PRESET BUTTON, decided from the HEIGHT the tools have spare and then fixed.
 *
 * Width used to decide it — a set filled whatever box it was in — and that is what made every
 * placement decision unstable: the part's height followed its width, the width followed its
 * placement, and the placement was decided from the height. Height cannot close that loop,
 * because the height the tools have is a fact about the boards and the viewport, and no button
 * changes it.
 *
 * The search is over the arrangements five-button sets allow — ten to a row or five — and takes
 * the LARGEST button that fits both axes. A tall narrow region therefore gets four rows of big
 * buttons where a short wide one gets two rows of small ones, which is what "use the room you
 * have" means when the room is shaped differently in different homes.
 *
 * THE WIDTH IN THE SEARCH IS THE REGION THE PRESETS ARE IN, and the height is what that region
 * has left once the chat and the bar are paid for. Once chosen the size does not change with
 * placement: a row that moves to zone A or zone B keeps its buttons and simply re-wraps, which
 * is the whole point of fixing the size rather than letting each box dictate one.
 */
function publishPresetSize(app: HTMLElement, region: { width: number; height: number }): void {
    // Resolved against a SET, not the app: the floor and the two pitches are declared on the
    // preset elements, so asking the app for them returns nothing.
    const set = app.querySelector<HTMLElement>(SET) ?? app;
    const floor = resolvedLength(set, PRESET_FLOOR);
    // THE FLOOR, not the published gap: the gap is computed FROM this size, so taking it as an
    // input here would close the loop the size was moved out of.
    const gap = resolvedLength(set, PRESET_GAP_FLOOR) || 3;
    const rowGap = resolvedLength(set, PRESET_ROW_GAP) || 5;

    const free = region.height - chatMinHeight(app) - heightOf(app, TOOLS_BAR);

    const ceiling = resolvedLength(set, PRESET_CEILING);

    let best = floor;
    for (const setsPerRow of [PANEL_SETS, 1]) {
        const perRow = setsPerRow * SET_COLUMNS;
        const rows = (PANEL_SETS / setsPerRow) * PANEL_SETS;
        const byWidth = (region.width - (perRow - 1) * gap) / perRow;
        const byHeight = (free - (rows - 1) * rowGap) / rows;
        best = Math.max(best, Math.min(byWidth, byHeight));
    }
    // The floor is applied AFTER the ceiling, so a window too small for even the floor still gets
    // the floor rather than a ceiling that has dropped below it.
    if (ceiling > 0) best = Math.max(floor, Math.min(best, ceiling));
    app.style.setProperty(PRESET_SIZE, `${best}px`);
}

/** Publishes ONE gap for every preset button on the page, the smallest any row can afford.
 *
 * The spacing is the row's leftover: a row of `n` buttons in a box of `W` has `W - n*B` to spread
 * across its `n - 1` gaps. Where every row holds the same count that is the whole story, and each
 * row would reach the same answer on its own. It is a row of TEN beside two rows of FIVE that
 * needs deciding centrally — measured on a 2495px window, the two rows of five in a 499px panel
 * wanted 40.3px while the row of ten in a 905px panel wanted 25.5px, and two parts of one control
 * cannot be spaced differently. THE SMALLEST WINS: it is the only value every row can actually
 * fit. The roomier row keeps its remainder as slack rather than spreading it.
 *
 * THE ROW COUNT IS TAKEN AT THE FLOOR GAP, NOT AT THE PUBLISHED ONE. Whether two sets share a line
 * is a question about width, and the published gap is an answer to that same question — asking it
 * of itself is how a layout starts oscillating. At the floor the question is settled, and the gap
 * that follows can only be larger, which is room the line already has: a line that fits at the
 * floor still fits once its own leftover is spread across it.
 */
function publishPresetGap(app: HTMLElement): void {
    const set = app.querySelector<HTMLElement>(SET);
    if (set === null) return;

    const button = resolvedLength(set, PRESET_SIZE) || resolvedLength(set, PRESET_FLOOR);
    const floor = resolvedLength(set, PRESET_GAP_FLOOR) || 3;
    if (button <= 0) return;

    let smallest = Infinity;
    const lengths = new Set<number>();
    for (const flex of app.querySelectorAll<HTMLElement>(PRESETS_FLEX)) {
        // A part that is not laid out has no row to space. Its width would read as zero and drag
        // every other row down to the floor with it.
        if (flex.offsetParent === null) continue;
        const style = getComputedStyle(flex);
        const width =
            flex.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
        if (!(width > 0)) continue;

        const paired = SET_COLUMNS * PANEL_SETS * button + (SET_COLUMNS * PANEL_SETS - 1) * floor;
        const columns = paired <= width ? SET_COLUMNS * PANEL_SETS : SET_COLUMNS;
        lengths.add(columns);
        smallest = Math.min(smallest, (width - columns * button) / (columns - 1));
    }

    if (!Number.isFinite(smallest)) return;
    app.style.setProperty(PRESET_GAP, `${Math.max(floor, smallest)}px`);

    // ONE RECTANGLE IS CENTRED; A RAGGED ONE IS RIGHT-ALIGNED.
    //
    // Where every row holds the same number of buttons the parts read as a single block, and a
    // block that does not fill its box belongs in the middle of it. Where they do not — one part
    // showing two rows of five while another shows a single row of ten — centring would leave the
    // two sets straddling different columns. Every area a preset part can land in ends at the same
    // right edge, so pushing the leftover to the LEFT puts the row of ten's last five buttons
    // directly under the rows of five.
    app.style.setProperty(PRESET_ALIGN, lengths.size > 1 ? 'flex-end' : 'center');
}


/**
 * A custom property's value in PIXELS, which `getComputedStyle` will not give you.
 *
 * An unregistered custom property computes to its token stream, so `--bug-preset-btn-min` reads
 * back as the literal text `calc(var(--bug-own-sq) * 0.55)` and `parseFloat` returns NaN. The
 * shortest way to a number is to let the engine do the arithmetic: give an element a width of the
 * property and measure it. The probe inherits from the element asked about, so it resolves in that
 * element's own context — a property defined per seat or per stack answers for the right one.
 */
function resolvedLength(context: HTMLElement, property: string): number {
    const probe = document.createElement('div');
    probe.style.cssText = `position:absolute;visibility:hidden;height:0;width:var(${property})`;
    context.appendChild(probe);
    const width = probe.getBoundingClientRect().width;
    probe.remove();
    return width;
}

/** The taller of the two stacks, which is the height everything else is charged against. */
function tallestStack(app: HTMLElement): number {
    const stacks = [app.querySelector<HTMLElement>(OWN_STACK), app.querySelector<HTMLElement>(STACK)];
    return Math.max(...stacks.map(el => el?.getBoundingClientRect().height ?? 0));
}

/**
 * `group` is NULL once the game is over: the presets are replaced by the end-of-game controls,
 * so there is no group to ask about. That costs zone B its presets and nothing else — the tools
 * bar is a separate occupant, and the height the panel should take is a fact about the BOARDS.
 * Gating the whole function on the group is what made a finished game keep a full-height chat
 * beside a zoomed-out board.
 */
function zoneB(
    app: HTMLElement,
    group: HTMLElement | null,
    budget: number,
    tallest: number,
    firstPart: string,
): ZoneB {
    const buttons = group ? [...group.querySelectorAll<HTMLElement>('button')] : [];
    const under = budget - tallest;
    const none = { bar: false, presets: false, oneRow: false, tallest, cost: 0 };

    // The bar goes first and the presets only follow it — one row of buttons is worth several
    // of the bar, so the zone can afford the bar long before it can afford them, and filling
    // in that order is what stops the two trading places as the boards shrink.
    // WHATEVER DROPS FIRST, not a named element. `TOOLS_BAR` is the round page's first part and
    // does not exist on the analysis page, which drops its tab list — so the cost came back 0
    // there, zone B was charged nothing, and the app was published one tab row too short: the
    // row then painted over the bottom of the taller stack. The drop order already names the
    // part that goes first; asking it keeps the two pages on one rule.
    const bar = heightOf(app, firstPart);
    if (bar > under) return none;
    if (!buttons.length) return { bar: true, presets: false, oneRow: false, tallest, cost: bar };

    // Measured rather than computed from the stylesheet's own expression: the button's width
    // is what it is on the page, and re-deriving it here would be a second copy of a formula
    // that has already changed once.
    const button = buttons[0].getBoundingClientRect().width;
    const oneRow = app.clientWidth >= buttons.length * button + (buttons.length - 1) * PITCH_FLOOR;

    // One panel folded to a single row is what one row of zone B costs; two rows cost two.
    const row = heightOf(app, '.chatpresets-panel-1');
    const both = bar + (oneRow ? row : row * 2);

    // ONE THRESHOLD, and it is safe to have only one BECAUSE THE BUTTON SIZE IS SETTLED FIRST.
    //
    // This briefly needed two. While a set filled whatever width it was given, its height followed
    // its placement — 52px tall in the column, 67px once it had moved to the wider zone — so the
    // cost this test reads was a product of the decision this test makes, and it flipped every
    // frame with `under` sitting between the two figures.
    //
    // `publishPresetSize()` removed the loop rather than damping it: the size comes from the
    // height the tools have spare, which no button can change, so a part measures the same
    // wherever it is about to go. A single comparison is honest again.
    const presets = both <= under;

    return { bar: true, presets, oneRow, tallest, cost: presets ? both : bar };
}

function place(container: HTMLElement, droppable: Droppable): void {
    const column = owner(container);
    const stack = column.querySelector<HTMLElement>(STACK);
    if (!stack) return;

    // THE PER-PART CASCADE ONLY APPLIES WHERE THE TOOLS HAVE A COLUMN TO LEAVE.
    //
    // `squareUnit.ts` decides from the viewport, before either board is sized, whether the tools
    // get a column at all — and where they do not, the stylesheet places every part directly from
    // that home. The two sets of rules would otherwise both match: a `drop-*` class left standing
    // from the last arrangement would keep placing one part while the home placed the rest.
    //
    // Cleared rather than merely skipped, because these classes persist on the element across a
    // resize: the home can change under a arrangement that was correct a moment ago.
    // ONLY WHERE THE CASCADE GOVERNS. `squareUnit.ts` publishes a home for every viewport, but only
    // the flattened landscape template has the zones to honour it — short landscape and portrait
    // keep arrangements of their own and place their parts by the drop classes below.
    //
    // `flattened` asks the template, not the class: that is the same test the zone B logic already
    // uses, and it is true of exactly the modes that have a zone B to move anything into. Gating on
    // the class instead would have been a live hazard — short landscape computes a home from
    // `--bug-tall-sq-a`, a variable it never draws with, so an unlucky viewport could have cleared
    // its drop classes and returned with nothing to replace them.
    const flattened = getComputedStyle(column).gridTemplateAreas.includes('zoneB');
    if (flattened && !column.classList.contains('tools-beside')) {
        for (const [, className] of droppable) column.classList.remove(className);
        column.classList.remove('drop-tablist-b', 'drop-presets-b');

        // The heights still have to be published, and they are simpler here than in the column
        // case: the app is the whole budget, and the boards get all of it except where the tools
        // took a row beneath them. `seatNamePlacement` reads the boards' figure to decide whether
        // a username can afford a line of its own, so leaving it stale would let a name claim
        // space the tools had already been given.
        // A PART MAY STILL PREFER ZONE A while the rest are below. Zone A is the region the
        // shorter stack frees — beside the own board, above zone B — and it is measured here
        // rather than derived, because by this point both stacks are laid out and their heights
        // are the plain truth. The end-of-game controls are the first part offered it: they are a
        // fixed block of buttons, so they neither need the full width nor lose anything by taking
        // a narrow column, and moving them out of zone B leaves the panel below more room.
        //
        // The width threshold is the one `toolsHome()` uses against the viewport. A region worth
        // choosing and a region worth putting a part in have to mean the same thing.
        const ownStack = column.querySelector<HTMLElement>(OWN_STACK)?.getBoundingClientRect();
        const partnerStack = stack.getBoundingClientRect();
        const zoneA = {
            width: partnerStack.width,
            height: Math.max(0, (ownStack?.height ?? 0) - partnerStack.height),
        };
        // ASK WHETHER THE GAME IS OVER, not whether the element is displayed. `.bug-gameover` is
        // in the DOM and `display: flex` throughout a live game — measured at 197x123 with nothing
        // drawn in it — so a display test admits an empty block and it sits in zone A for the whole
        // game, holding a region another part could have used. The app's own `game-over` class is
        // the fact being asked about.
        // THE STRIP FLOWS INTO ZONE B ONLY IF ZONE B CAN HOLD IT. Zone A's occupants stack inside
        // the taller board's height, but a strip placed below both boards needs height the boards
        // have not taken — and where the header is hidden the boards very nearly fill the budget.
        // Measured in short landscape at 682x503: an own stack of 500 in a budget of 503, so zone
        // B had 3px and the bar was drawn at y=699, 236px past the bottom of a page that cannot
        // scroll. Where it will not fit, the strip stays in zone A with the rest.
        const stripHeight = [...column.querySelectorAll<HTMLElement>('.bug-parts > *')]
            .filter(el => el.matches(TOOLS_BAR) || el.getAttribute('role') === 'tablist')
            .reduce((total, el) => Math.max(total, el.getBoundingClientRect().height), 0);
        column.classList.toggle(
            'strip-in-zoneb',
            budgetForZones(column) - tallestStack(column) >= stripHeight,
        );

        // The region the presets have in this home, which is what their size is drawn from.
        publishPresetSize(column, {
            width: column.classList.contains('tools-below') ? column.clientWidth : zoneA.width,
            height: column.classList.contains('tools-below')
                ? budgetForZones(column) - tallestStack(column)
                : zoneA.height,
        });

        const gameover = column.querySelector<HTMLElement>('.bug-gameover');
        const gameoverFits =
            gameover !== null &&
            column.classList.contains('game-over') &&
            zoneA.width >= toolsMinWidth() &&
            zoneA.height >= gameover.getBoundingClientRect().height;
        column.classList.toggle('drop-gameover-a', gameoverFits);

        const budget = parseFloat(getComputedStyle(column).getPropertyValue(BUDGET));
        if (Number.isFinite(budget)) {
            // ZONE B IS WHAT BOUNDS ZONE A, and the app's height is what states the boundary.
            //
            // Zone B exists in every arrangement, at the full width below both boards, and zone A
            // stops where it begins. The template says so — the own stack spans the zone A rows and
            // zone B follows them — but only if the app is exactly as tall as the taller stack plus
            // whatever zone B holds. Published as the whole budget instead, the app has slack, the
            // `1fr` row inside zone A takes it, and zone A grows straight through zone B's top
            // edge: measured on the analysis page, a 290px panel where zone A was 253px.
            //
            // Capped at the budget, since the page may not scroll: where zone B's occupant will not
            // fit under the boards, it is the tools that give way, as they do everywhere else.
            //
            // WHERE THE TOOLS ARE BELOW, THE APP IS THE WHOLE BUDGET. Their region IS the space
            // under the boards, so the slack belongs to them and the panel's `1fr` row should take
            // it. Measuring instead would be circular and measurably so: the panel is sized BY the
            // app's height, so it measures zero, contributes zero, no slack is published, and it
            // stays zero. Measured on the round page: a chat panel of exactly 0px.
            //
            // Where the tools are in zone A, the opposite: the app must stop at the taller stack
            // plus what zone B holds, or zone A's own `1fr` row grows through zone B's top edge.
            // Nothing there is sized by the app's height — zone A is bounded by the stack beside it
            // — so measuring is safe.
            const content = column.classList.contains('tools-below')
                ? budget
                : Math.min(budget, tallestStack(column) + zoneBHeight(column));
            column.style.setProperty(CONTENT_HEIGHT, `${content}px`);
            column.style.setProperty(BOARDS_HEIGHT, `${tallestStack(column)}px`);
        }

        labelControls(column);
        return;
    }

    // The PINNED budget, not the app's current height, wherever the app follows its content:
    // measuring the box these decisions resize would make every answer depend on the last one,
    // and the two would chase each other forever. Where the column is a real box it is not
    // resized by any of this and can be measured directly.
    // ASK THE TEMPLATE, NOT THE CONTAINER. This used to test whether the NAMED container had
    // been dissolved — true on the round page, whose container is `.bug-right-column`, and never
    // on the analysis page, which names the app itself. So the analysis page skipped zone B in
    // every mode and never published the heights below: measured at 996x730 with a zoomed-out
    // pair, a 639px tools panel beside a 460px board.
    //
    // What actually matters is whether the grid being placed into HAS a zone B, which is a fact
    // about the template in force and true of exactly the modes whose `drop-*-b` rules exist.
    // Portrait and short landscape name no such area and are therefore untouched, which is the
    // property the old test was reaching for by proxy.
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
    const b =
        flattened && droppable.length > 0
            ? zoneB(column, group, available, tallestStack(column), droppable[0][0])
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

    // Each part drops only if every part before it in the order has dropped too,
    // and the board's stack still fits in the height left once this one has gone
    // as well. Cumulative, so the parts leave from the bottom up and never leave a
    // gap in the middle of the strip.
    // ZONE A IS THE SPACE THE RIGHT BOARD FREES, AND NOTHING ELSE.
    // ---------------------------------------------------------------------------------------
    // It is the region under the right stack, spanning that column and the tools — so its
    // height is exactly how much SHORTER the right stack is than the left one, and zero when
    // the right stack is the taller of the two. There is no space under a board that is already
    // the tallest thing on the row.
    //
    // The old test asked whether the right stack still fitted in the BUDGET minus the parts
    // dropped so far, which never consulted the left stack at all. So with the right board the
    // taller, zone A still reported room: measured at 996x730 with the left stack at 427 and the
    // right at 500, the end-of-game controls were placed in a 48px zone A row that began 40px
    // above the bottom of the right stack, and the button was drawn over that board's pocket and
    // clock. `max(0, ...)` is the whole correction — a negative difference is not a small space,
    // it is no space.
    const ownHeight = column.querySelector<HTMLElement>(OWN_STACK)?.getBoundingClientRect().height ?? 0;
    const zoneA = Math.max(0, ownHeight - stackHeight);

    // Beside the boards the presets' region is the tools strip: as tall as the app, as wide as
    // the last track. Published BEFORE the drop cascade below, because the cascade charges parts
    // by their height and that height is now a consequence of this number.
    const toolsTrack = getComputedStyle(column)
        .gridTemplateColumns.split(/\s+/)
        .filter(track => track.endsWith('px'))
        .map(parseFloat);
    publishPresetSize(column, {
        width: toolsTrack.length > 0 ? toolsTrack[toolsTrack.length - 1] : column.clientWidth,
        height: Number.isFinite(budget) ? budget : column.clientHeight,
    });

    // Each part drops only if every part before it in the order has dropped too, and the parts
    // dropped so far still fit the space the right board freed. Cumulative, so they leave from
    // the bottom up and never leave a gap in the middle of the strip.
    let zoneAUsed = 0;
    let previousDropped: boolean = true;
    for (const [selector, className] of droppable) {
        // The plain measured height. It used to be adjusted for the fact that a part's height
        // followed its width and therefore its placement — a loop that no longer exists, because
        // the preset size is settled from the tools' spare HEIGHT before any of this runs.
        const height = heightOf(column, selector);
        // Zone B has already taken this part, so zone A must not claim it as well. Its height
        // is still charged there: zone B is a row of the same grid and costs the boards the
        // same space wherever in it the row sits.
        //
        // WHATEVER DROPS FIRST, not a named element — the same correction `zoneB()` makes for
        // the cost, and the other half of it. `TOOLS_BAR` is the round page's first part; the
        // analysis page's is its tab list, so this test answered `false` there and zone A went
        // on to claim a part zone B had already been asked about.
        const el = column.querySelector<HTMLElement>(selector);
        const inZoneB = el
            ? group?.contains(el)
                ? b.presets
                : selector === droppable[0][0] && b.bar
            : false;
        const drops: boolean = !inZoneB && previousDropped && zoneAUsed + height <= zoneA;
        if (drops) zoneAUsed += height;
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
/* THE PAGE'S STANDING TAB, and the one home that may claim it.
   ------------------------------------------------------------------------------------
   A page registers the tab it can show permanently — today the partner's board, on both pages —
   and this module attaches it exactly in the last resort, where the tools have nowhere else to go
   and take the board's column instead. It lives here because the decision IS the placement
   decision: the same pass that reads the home reads it once, rather than a second watcher
   deciding the same thing from the same class a frame later.
   One page at a time, so one registration: a module holding the app it publishes to is the pattern
   `squareUnit.ts` already uses for the home itself. */
interface StandingTabHost {
    setDetached(tabIndex: number, detached: boolean): void;
    setOnSelect(fn: () => void): void;
}
let standingTab: { host: StandingTabHost; index: number } | null = null;

export function registerStandingTab(host: StandingTabHost, index: number): void {
    standingTab = { host, index };
}

/** Attached only in the last resort; detached — absent from the strip, always drawn — everywhere
 * else. `setDetached` ignores a call that changes nothing, so this may run on every pass. */
function placeStandingTab(): void {
    if (standingTab === null) return;
    const app = document.querySelector<HTMLElement>('.round-app.bug, .analysis-app.bug');
    if (app === null) return;
    standingTab.host.setDetached(standingTab.index, !app.classList.contains('tools-lastresort'));
}

export function trackToolsPlacement(
    droppable: Droppable,
    container: string = ROUND_CONTAINER,
    onSettled?: () => void,
): void {
    const column = document.querySelector<HTMLElement>(container);
    if (!column) return;

    // `onSettled` runs after every pass: a part dropping into a zone reshapes the rows and moves
    // the boards without resizing them, which nothing tells chessgroundx about. See
    // `clearBoardBounds`.
    const pass = () => {
        // BEFORE the arrangement, not after: whether the board is in the strip decides whether it
        // is drawn, and every measurement `place` takes of the stacks depends on that.
        placeStandingTab();
        place(column, droppable);
        // AFTER the arrangement, because the gap is the leftover of rows that have to exist first:
        // which parts are where, and how many buttons each row ended up holding, is what `place`
        // has just decided. Nothing it decides reads the gap back — see `publishPresetGap`.
        publishPresetGap(owner(column));
        onSettled?.();
    };

    pass();

    // A TAB CLICK MOVES A BOARD WITHOUT RESIZING IT, so no observer here fires and the settle
    // callback — which is what clears the boards' cached bounds — would never run. In the last
    // resort the partner's board IS a tab, and switching away from it and back is exactly that
    // move. Wired to the same callback rather than a second one: it is the same event.
    if (standingTab !== null && onSettled !== undefined) standingTab.host.setOnSelect(onSettled);

    observer?.disconnect();
    observer = new ResizeObserver(pass);
    // The owner is what resizes when the arrangement changes, and the named container is what
    // resizes when the mode does — observe both, so neither kind of change is missed.
    observer.observe(owner(column));
    if (owner(column) !== column) observer.observe(column);
    for (const selector of [STACK, ...droppable.map(([selector]) => selector)]) {
        for (const el of owner(column).querySelectorAll<HTMLElement>(selector)) observer.observe(el);
    }
}
