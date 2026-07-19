import * as cg from 'chessgroundx/types';

import { BugBoardName, PyChessModel } from '../../types';
import { playerInfoData } from './gameInfo';

const otherBoard = (board: BugBoardName): BugBoardName => (board === 'a' ? 'b' : 'a');
const otherColor = (color: cg.Color): cg.Color => (color === 'white' ? 'black' : 'white');

// One of the four bughouse seats: everything identity-related about the player
// sitting there. Pure page data — relations to the other seats are answered by
// the TwoBoardPlayers container, which holds all four.
export class TwoBoardPlayer {
    constructor(
        readonly username: string,
        readonly title: string,
        readonly rating: string,
        readonly color: cg.Color,
        readonly boardName: BugBoardName,
    ) {}
}

export class Team {
    constructor(
        readonly players: [TwoBoardPlayer, TwoBoardPlayer],
        readonly teamNumber: '1' | '2',
    ) {}

    // todo: adopt at the movelist render sites (they currently concatenate usernames
    //       themselves, partly via displayUsername) — see openspec change two-board-players-abstraction
    name(): string {
        return this.players[0].username + '+' + this.players[1].username;
    }
}

// The four players of a bughouse game (wA, bA, wB, bB) and every way the client
// needs to look them up: by seat, relative to the viewer, by relation to another
// player, or as teams. Constructed from the page model only — no DOM, no
// controller references — so round and analysis share one instance.
export class TwoBoardPlayers {
    readonly all: [TwoBoardPlayer, TwoBoardPlayer, TwoBoardPlayer, TwoBoardPlayer];
    readonly teams: [Team, Team];

    constructor(
        model: PyChessModel,
        private readonly viewer: string,
    ) {
        const seat = (color: 'w' | 'b', board: BugBoardName) => {
            const [username, title, rating] = playerInfoData(model, color, board);
            return new TwoBoardPlayer(username, title, rating, color === 'w' ? 'white' : 'black', board);
        };
        const wA = seat('w', 'a');
        const bA = seat('b', 'a');
        const wB = seat('w', 'b');
        const bB = seat('b', 'b');
        this.all = [wA, bA, wB, bB];
        this.teams = [new Team([wA, bB], '1'), new Team([bA, wB], '2')];
    }

    byBoardAndColor(board: BugBoardName, color: cg.Color): TwoBoardPlayer {
        return this.all.find(p => p.boardName === board && p.color === color)!;
    }

    me(board: BugBoardName): TwoBoardPlayer | undefined {
        // when the viewer somehow holds both seats of one board, the black seat wins,
        // matching the legacy myColor map that was written to in white-then-black order
        const mine = this.all.filter(p => p.boardName === board && p.username === this.viewer);
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

    partnerOf(player: TwoBoardPlayer): TwoBoardPlayer {
        return this.byBoardAndColor(otherBoard(player.boardName), otherColor(player.color));
    }

    opponentOf(player: TwoBoardPlayer): TwoBoardPlayer {
        return this.byBoardAndColor(player.boardName, otherColor(player.color));
    }

    opponentsPartnerOf(player: TwoBoardPlayer): TwoBoardPlayer {
        return this.byBoardAndColor(otherBoard(player.boardName), player.color);
    }
}
