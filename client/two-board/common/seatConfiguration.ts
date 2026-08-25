import * as cg from 'chessgroundx/types';

import { BugBoardName, PyChessModel } from '../../types';
import { Step } from '../../messages';
import { BLACK, WHITE } from '../../chess';
import { Seat, Team, TwoBoardPlayer } from './seat';

const otherBoard = (board: BugBoardName): BugBoardName => (board === 'a' ? 'b' : 'a');
const otherColor = (color: cg.Color): cg.Color => (color === 'white' ? 'black' : 'white');

export function playerInfoData(
    model: PyChessModel,
    color: 'w' | 'b',
    board: 'a' | 'b',
): [string, string, string, boolean] {
    const username =
        model[board == 'a' ? (color === 'w' ? 'wplayer' : 'bplayer') : color === 'w' ? 'wplayerB' : 'bplayerB'];
    const title = model[board == 'a' ? (color === 'w' ? 'wtitle' : 'btitle') : color === 'w' ? 'wtitleB' : 'btitleB'];
    const rating =
        model[board == 'a' ? (color === 'w' ? 'wrating' : 'brating') : color === 'w' ? 'wratingB' : 'bratingB'];
    const patron =
        model[board == 'a' ? (color === 'w' ? 'wpatron' : 'bpatron') : color === 'w' ? 'wpatronB' : 'bpatronB'];
    return [username, title, rating, patron];
}

// Recorded clock time (ms) for a seat at the given step, read from the step's
// per-board clock arrays. Undefined when the step carries no clocks. A standalone
// function rather than a Seat method, so Seat itself never depends on Step/
// analysis-tree types.
export function clockTimeAt(step: Step, seat: Seat): number | undefined {
    const clocks = seat.boardName === 'a' ? step.clocks : step.clocksB;
    return clocks?.[seat.color === 'white' ? WHITE : BLACK];
}

// The four seats of a bughouse game (wA, bA, wB, bB) and every way the client
// needs to look them up: by coordinates, relative to the viewer, by relation to
// another seat, or as teams. Generic over the seat type it holds — only Seat is
// instantiated today, but the genericity is what lets the constructor stay
// build-agnostic. Takes the four already-built seats and the viewer username
// only — it does not know how to build seats from a page model or from step data.
export class SeatConfiguration<S extends Seat> {
    readonly all: [S, S, S, S];
    readonly teams: [Team, Team];

    constructor(
        seats: [S, S, S, S],
        private readonly viewer: string,
    ) {
        this.all = seats;
        const [wA, bA, wB, bB] = seats;
        this.teams = [new Team([wA, bB], '1'), new Team([bA, wB], '2')];
    }

    byBoardAndColor(board: BugBoardName, color: cg.Color): S {
        return this.all.find(s => s.boardName === board && s.color === color)!;
    }

    seatsOn(board: BugBoardName): S[] {
        return this.all.filter(s => s.boardName === board);
    }

    me(board: BugBoardName): S | undefined {
        // when the viewer somehow holds both seats of one board, the black seat wins,
        // matching the legacy myColor map that was written to in white-then-black order
        const mine = this.all.filter(s => s.boardName === board && s.player.username === this.viewer);
        return mine.length > 0 ? mine[mine.length - 1] : undefined;
    }

    myColor(board: BugBoardName): cg.Color | undefined {
        return this.me(board)?.color;
    }

    isSpectator(): boolean {
        return this.me('a') === undefined && this.me('b') === undefined;
    }

    myTeam(): Team {
        // spectators get team 2, matching the legacy whichTeamAmI() fallthrough
        return this.myColor('a') === 'white' || this.myColor('b') === 'black' ? this.teams[0] : this.teams[1];
    }

    teamOf(seat: Seat): Team {
        // resolve by coordinates so any Seat-shaped input works
        const s = this.byBoardAndColor(seat.boardName, seat.color);
        return this.teams.find(t => t.seats.includes(s))!;
    }

    partnerOf(seat: Seat): S {
        return this.byBoardAndColor(otherBoard(seat.boardName), otherColor(seat.color));
    }

    opponentOf(seat: Seat): S {
        return this.byBoardAndColor(seat.boardName, otherColor(seat.color));
    }

    opponentsPartnerOf(seat: Seat): S {
        return this.byBoardAndColor(otherBoard(seat.boardName), seat.color);
    }

    // color initially rendered at the top of the given board for this viewer, by seat
    // precedence: if the viewer sits on this board, the opposite of that seat's color;
    // otherwise, if the viewer sits on the other board, the opposite of their partner's
    // color here (which equals the viewer's color on the other board); otherwise the
    // canonical spectator orientation: black on top of board a, white on top of board b.
    initialTopColor(board: BugBoardName): cg.Color {
        const myColor = this.myColor(board);
        if (myColor !== undefined) return otherColor(myColor);
        const myColorOtherBoard = this.myColor(otherBoard(board));
        if (myColorOtherBoard !== undefined) return myColorOtherBoard;
        return board === 'a' ? 'black' : 'white';
    }
}

// Builds the seat container: the four seats' coordinates and player identity, from
// the page model and viewer username only (no DOM, no controller references) — the
// single container both pages use. Seats start without a clock; the round controller
// assigns each one later, once the seat views that own the clock elements exist. A
// plain function returning SeatConfiguration<Seat> directly, not a subclass and not
// a type alias for it, since the type needs no name of its own.
export function twoBoardSeats(model: PyChessModel, viewer: string): SeatConfiguration<Seat> {
    const seat = (color: 'w' | 'b', board: BugBoardName) => {
        const [username, title, rating, patron] = playerInfoData(model, color, board);
        return new Seat(
            new TwoBoardPlayer(username, title, rating, patron),
            color === 'w' ? 'white' : 'black',
            board,
        );
    };
    const wA = seat('w', 'a');
    const bA = seat('b', 'a');
    const wB = seat('w', 'b');
    const bB = seat('b', 'b');
    return new SeatConfiguration([wA, bA, wB, bB], viewer);
}
