import * as cg from 'chessgroundx/types';

import { BugBoardName } from '../../types';
import { Clock } from '../../clock';

// Pure identity of the person occupying a seat. In simul mode the same username
// occupies two seats (of the same team — one person is never on both teams) as
// two separate instances, one per seat.
export class TwoBoardPlayer {
    constructor(
        readonly username: string,
        readonly title: string,
        readonly rating: string,
        readonly patron: boolean,
    ) {}
}

// One of the four bughouse seats: a board+color coordinate and the player sitting
// there. Seat-relative logic (relations, teams, screen placement) is keyed by the
// coordinates; per-player questions identify the player's seat(s) first and then
// use the seat logic.
export class Seat {
    // The seat's live ticking clock. Assigned once by the round controller, after
    // the seat views that own the clock elements exist; left undefined on the
    // analysis page, which has no live clocks and never reads it. It lives here
    // rather than on a round-only Seat subclass because a subclass would force
    // the round page to carry a second container of seats duplicating these
    // coordinates and players — everything else a round seat needs is view state
    // and belongs to its RoundSeatView.
    clock?: Clock;

    constructor(
        readonly player: TwoBoardPlayer,
        readonly color: cg.Color,
        readonly boardName: BugBoardName,
    ) {}
}

export class Team {
    constructor(
        readonly seats: [Seat, Seat],
        readonly teamNumber: '1' | '2',
    ) {}

    name(format: (username: string) => string = u => u): string {
        return format(this.seats[0].player.username) + '+' + format(this.seats[1].player.username);
    }
}
