import { BugBoardName } from '../../types';
import { Seat } from './seat';
import { SeatConfiguration } from './seatConfiguration';

/**
 * Which board is the viewer's own, and how a placed board says so.
 *
 * TWO DIFFERENT QUESTIONS live here, and keeping them apart is the whole point of the
 * module:
 *
 *   ownBoardName(seats)  - WHICH board did this viewer play on?   Answered from seats.
 *   markBoardRoles()     - which board is in the main POSITION?   Answered from the DOM.
 *
 * The round page only ever needed the second. Its switchBoards() physically moves board
 * elements between the two stacks, so by the time anything asks, the viewer's board is
 * already in the left column and "own" simply means "not in the partner stack". The
 * analysis page has no switch, so it has to ask the first question before it can build
 * the page at all.
 */

/**
 * The board this viewer played on, or `'a'` for anyone who did not play.
 *
 * Spectators, and any user opening someone else's game, get board A. That is a real
 * choice rather than a fallback: with no seat there is no reason to prefer either board,
 * and A is the one the game record calls first.
 *
 * Asked by the ANALYSIS page when it decides which board to build into the main position
 * — left in landscape, bottom in portrait. The round page does not call this; its switch
 * has already done the placing by the time roles are marked.
 */
export function ownBoardName(seats: SeatConfiguration<Seat>): BugBoardName {
    if (seats.me('a') !== undefined) return 'a';
    if (seats.me('b') !== undefined) return 'b';
    return 'a';
}

/**
 * Mark the two board elements with the role their POSITION gives them.
 *
 * Extracted from the round page's markRoles() so both pages mark the same way. It is
 * deliberately still positional: the round layout ties `--bug-tall-sq-a` to the left
 * COLUMN rather than to a board, and a switch re-marks. A seat-based mark would survive a
 * switch, which is exactly what that page does not want.
 *
 * Never key layout off `#mainboard`/`#bugboard` directly. Those are board IDENTITY — board
 * A is board A whoever is playing on it — so a viewer seated on board B gets every pairing
 * backwards. That is not hypothetical: it was measured in portrait as a partner seat sized
 * against a 362.7px board and an own seat against a 165.3px one.
 */
export function markBoardRoles(isOwnSide: (el: HTMLElement) => boolean): void {
    for (const id of ['mainboard', 'bugboard'] as const) {
        const el = document.getElementById(id);
        if (!el) continue;
        const own = isOwnSide(el);
        el.classList.toggle('own-board', own);
        el.classList.toggle('partner-board', !own);
    }
}

/**
 * The test both pages use: a board is the viewer's own unless it sits inside the partner
 * stack.
 *
 * Portrait gives that group `display: contents`, so it forms no box there — but it is
 * still the DOM parent, which is what this asks about, and what the stylesheet's `>`
 * selectors match on in every mode alike.
 */
export function isOutsidePartnerStack(el: HTMLElement): boolean {
    return !el.parentElement?.classList.contains('bug-partner-stack');
}
