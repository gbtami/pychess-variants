import { h, VNode } from 'snabbdom';

import { patch } from '../../document';
import { player as playerBar } from '../../player';
import { BugBoardName } from '../../types';
import { Seat } from '../common/seat';
import { SeatConfiguration } from '../common/seatConfiguration';
import { GameControllerBughouse } from '../common/gameCtrl';
import AnalysisController from './analysisCtrl';

// The four player bars of the analysis page, keyed by PHYSICAL SCREEN POSITION —
// exactly as the analysis clocks beside them are, and for the same reason: which
// player is at the top of a board depends on that board's current orientation, so
// a bar keyed by color or by seat would be wrong the moment the boards are flipped.
//
// `.bug` is board IDENTITY here (board B whoever played on it), matching the clock
// slots. It never decides layout — the STACK a bar sits in decides that — it only
// names the element, so that a flip re-renders the right one.
export type SeatSlot = 'top' | 'bottom' | 'top.bug' | 'bottom.bug';

// Position 0 is the top of a board, 1 the bottom, which is the round page's
// convention and what `.seat-strip0` / `.seat-strip1` mean in the stylesheet.
const SLOT_SELECTOR: Record<SeatSlot, string> = {
    top: 'round-player0#anal-seat-top',
    bottom: 'round-player1#anal-seat-bottom',
    'top.bug': 'round-player0#anal-seat-top-bug.bug',
    'bottom.bug': 'round-player1#anal-seat-bottom-bug.bug',
};

// The presence icon's own id, which `player()` keeps separate from its root: the
// root carries the page-layout tag and classes, the icon id addresses the dot.
const PRESENCE_ID: Record<SeatSlot, string> = {
    top: 'anal-presence-top',
    bottom: 'anal-presence-bottom',
    'top.bug': 'anal-presence-top-bug',
    'bottom.bug': 'anal-presence-bottom-bug',
};

const slotOf = (position: 0 | 1, board: BugBoardName): SeatSlot =>
    `${position === 0 ? 'top' : 'bottom'}${board === 'b' ? '.bug' : ''}` as SeatSlot;

export class AnalysisSeatView {
    private slots: Record<SeatSlot, VNode | HTMLElement>;

    constructor() {
        this.slots = {
            top: h(SLOT_SELECTOR.top),
            bottom: h(SLOT_SELECTOR.bottom),
            'top.bug': h(SLOT_SELECTOR['top.bug']),
            'bottom.bug': h(SLOT_SELECTOR['bottom.bug']),
        };
    }

    // The empty bar analysis.ts embeds in a seat strip, addressed the way the strip
    // is built — by the board it belongs to and which end of it — rather than by the
    // slot name, which is this module's business.
    placeholder(board: BugBoardName, position: 0 | 1): VNode {
        return this.slots[slotOf(position, board)] as VNode;
    }

    render(slot: SeatSlot, vnode: VNode): void {
        this.slots[slot] = patch(this.slots[slot], vnode);
    }
}

export function renderSeatNames(ctrl: AnalysisController): void {
    /* WHO IS IN THIS GAME, FROM THE CONTROLLER — which learns it from the game's own socket,
       unasked (see `connectGameSocket`). The round page's reading of presence: connected to THIS
       game, not online somewhere on the site. A player with this game open reads green, including
       the reader themselves; anyone else reads grey.

       KEYED BY USERNAME, because that is what the messages name and what a seat already carries.
       Unknown until the server speaks, so a dot starts grey and turns green — and it stays live,
       since joins and leaves are broadcast to everyone on the game. */
    const online = (username: string): boolean => ctrl.isOnline(username);

    /* WHETHER THERE IS A GAME AT ALL. The analysis board reached from the Tools menu is the same
       page with no game behind it, so there are no seats to describe — see the gate below, which
       is why nothing is drawn rather than drawn empty. */
    const hasPlayers = ctrl.model['gameId'] !== '';

    renderSeatNamesCC(ctrl.seatView, ctrl.seats, ctrl.boardA, 'a', ctrl.model['level'], online, hasPlayers);
    renderSeatNamesCC(ctrl.seatView, ctrl.seats, ctrl.boardB, 'b', ctrl.model['level'], online, hasPlayers);
}

function renderSeatNamesCC(
    view: AnalysisSeatView,
    seats: SeatConfiguration<Seat>,
    board: GameControllerBughouse,
    boardName: BugBoardName,
    level: number,
    online: (username: string) => boolean,
    hasPlayers: boolean,
): void {
    // Same derivation the clocks use: `flipped()` is the board's own state, so the
    // two stay in step without either knowing about the other.
    const whitePov = !board.flipped();
    const colorAt = (position: 0 | 1): 'white' | 'black' =>
        (position === 0) === whitePov ? 'black' : 'white';

    for (const position of [0, 1] as const) {
        const slot = slotOf(position, boardName);

        /* NO GAME, SO NO BAR AT ALL — not an empty one, and not a bar told to hide its parts.
           The analysis board opened from the Tools menu has no players, so there is nobody for a
           username, a rating or a presence dot to be about. The strip renders as the bare element
           the page embedded and nothing goes inside it.

           THE GATE BELONGS HERE, BEFORE THE CALL. Leaving it to `player()` meant handing a shared
           component -- four callers on the round page alone -- an argument that exists for this
           page's edge case, and it only LOOKED right for the username: that came out empty because
           the string was empty, not because anything decided not to draw it. */
        if (!hasPlayers) {
            view.render(slot, h(SLOT_SELECTOR[slot]));
            continue;
        }

        const color = colorAt(position);
        const seat = seats.byBoardAndColor(boardName, color);
        view.render(
            slot,
            playerBar(
                PRESENCE_ID[slot],
                seat.player.title,
                seat.player.username,
                seat.player.rating,
                level,
                online(seat.player.username),
                SLOT_SELECTOR[slot],
                false,
            ),
        );
    }
}
