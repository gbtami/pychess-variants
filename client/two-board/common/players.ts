import * as cg from 'chessgroundx/types';

import { BugBoardName, PyChessModel } from '../../types';
import { Step } from '../../messages';
import { BLACK, WHITE } from '../../chess';

const otherBoard = (board: BugBoardName): BugBoardName => (board === 'a' ? 'b' : 'a');
const otherColor = (color: cg.Color): cg.Color => (color === 'white' ? 'black' : 'white');

export function playerInfoData(model: PyChessModel, color: 'w' | 'b', board: 'a' | 'b'): [string, string, string] {
    const username =
        model[board == 'a' ? (color === 'w' ? 'wplayer' : 'bplayer') : color === 'w' ? 'wplayerB' : 'bplayerB'];
    const title = model[board == 'a' ? (color === 'w' ? 'wtitle' : 'btitle') : color === 'w' ? 'wtitleB' : 'btitleB'];
    const rating =
        model[board == 'a' ? (color === 'w' ? 'wrating' : 'brating') : color === 'w' ? 'wratingB' : 'bratingB'];
    return [username, title, rating];
}

// Pure identity of the person occupying a seat. In simul mode the same username
// occupies two seats (of the same team — one person is never on both teams) as
// two separate instances, one per seat.
export class TwoBoardPlayer {
    constructor(
        readonly username: string,
        readonly title: string,
        readonly rating: string,
    ) {}
}

// One of the four bughouse seats: a board+color coordinate and the player sitting
// there. Seat-relative logic (relations, teams, screen placement) is keyed by the
// coordinates; per-player questions identify the player's seat(s) first and then
// use the seat logic.
export class Seat {
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

// Recorded clock time (ms) for a seat at the given step, read from the step's
// per-board clock arrays. Undefined when the step carries no clocks.
export function clockTimeAt(step: Step, seat: Seat): number | undefined {
    const clocks = seat.boardName === 'a' ? step.clocks : step.clocksB;
    return clocks?.[seat.color === 'white' ? WHITE : BLACK];
}

// The four seats of a bughouse game (wA, bA, wB, bB) and every way the client
// needs to look them up: by coordinates, relative to the viewer, by relation to
// another seat, or as teams. Constructed from the page model only — no DOM, no
// controller references — so round and analysis share one instance.
export class TwoBoardSeats {
    readonly all: [Seat, Seat, Seat, Seat];
    readonly teams: [Team, Team];

    constructor(
        model: PyChessModel,
        private readonly viewer: string,
    ) {
        const seat = (color: 'w' | 'b', board: BugBoardName) => {
            const [username, title, rating] = playerInfoData(model, color, board);
            return new Seat(new TwoBoardPlayer(username, title, rating), color === 'w' ? 'white' : 'black', board);
        };
        const wA = seat('w', 'a');
        const bA = seat('b', 'a');
        const wB = seat('w', 'b');
        const bB = seat('b', 'b');
        this.all = [wA, bA, wB, bB];
        this.teams = [new Team([wA, bB], '1'), new Team([bA, wB], '2')];
    }

    byBoardAndColor(board: BugBoardName, color: cg.Color): Seat {
        return this.all.find(s => s.boardName === board && s.color === color)!;
    }

    me(board: BugBoardName): Seat | undefined {
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
        // resolve by coordinates so any Seat-shaped input (e.g. a RoundSeat) works
        const s = this.byBoardAndColor(seat.boardName, seat.color);
        return this.teams.find(t => t.seats.includes(s))!;
    }

    partnerOf(seat: Seat): Seat {
        return this.byBoardAndColor(otherBoard(seat.boardName), otherColor(seat.color));
    }

    opponentOf(seat: Seat): Seat {
        return this.byBoardAndColor(seat.boardName, otherColor(seat.color));
    }

    opponentsPartnerOf(seat: Seat): Seat {
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
