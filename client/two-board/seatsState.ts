import { h, VNode } from 'snabbdom';
import * as cg from 'chessgroundx/types';

import { patch } from '../document';
import { Clock } from '../clock';
import { ClockDifference } from './round/clockDifference';
import { Clocks } from '../messages';
import { BoardName, BugBoardName } from '../types';
import { BLACK, WHITE } from '../chess';
import { player as playerBar } from '../player';
import { TwoBoardPlayer, TwoBoardPlayers } from './common/players';
import type { RoundControllerBughouse } from './round/roundCtrl';

// A player's seat on the round page: everything round-only that belongs to one
// of the four shared players — their clock, their clock-difference indicator,
// their rendered player bar and their last server-recorded clock time.
export class RoundSeat {
    readonly clock: Clock;
    readonly difference: ClockDifference;
    // retained vnode of the rendered player bar, for future in-place re-renders
    vplayer: VNode;
    // last clock value recorded for this seat from a server board message (ms)
    clocktime: number;

    constructor(
        readonly player: TwoBoardPlayer,
        // screen position of the seat on its board: 0 = top, 1 = bottom (non-flipped)
        readonly position: 0 | 1,
        base: number,
        inc: number,
        level: number,
        clockId: string,
        differenceId: string,
        playerBarId: string,
    ) {
        this.clocktime = base * 1000 * 60;
        this.clock = new Clock(base, inc, 0, document.getElementById(clockId) as HTMLElement, clockId, false);
        this.difference = new ClockDifference(document.getElementById(differenceId) as HTMLElement, differenceId);
        this.vplayer = patch(
            document.getElementById('r' + playerBarId) as HTMLElement,
            playerBar(playerBarId, player.title, player.username, player.rating, level),
        );
    }
}

// Round-page presentation state: the four RoundSeats. Player identity itself
// lives in the shared TwoBoardPlayers instance owned by the controller base class.
export class SeatsState {
    seats: RoundSeat[];

    private readonly playersInfo: TwoBoardPlayers;

    constructor(ctrl: RoundControllerBughouse) {
        const info = ctrl.players;
        this.playersInfo = info;

        const spectator = info.isSpectator();
        const myColorA = info.myColor('a');
        const myColorB = info.myColor('b');
        // my partner's color on one board is the opposite of my color on the other board
        const partnerColorA = myColorB === undefined ? undefined : myColorB === 'white' ? 'black' : 'white';
        const partnerColorB = myColorA === undefined ? undefined : myColorA === 'white' ? 'black' : 'white';

        // color rendered at the top (position 0) of each board. This represents only the
        // initial positioning on the screen: flip/switch only move html elements around,
        // so these remain constant as initialized here throughout the whole game.
        const topColorA: cg.Color = spectator
            ? 'black'
            : myColorA === 'black' || partnerColorA === 'black'
              ? 'white'
              : 'black';
        const topColorB: cg.Color = spectator
            ? 'white'
            : myColorB === 'black' || partnerColorB === 'black'
              ? 'white'
              : 'black';

        this.seats = info.all.map(p => {
            const topColor = p.boardName === 'a' ? topColorA : topColorB;
            const position = (p.color === topColor ? 0 : 1) as 0 | 1;
            return new RoundSeat(
                p,
                position,
                ctrl.base,
                ctrl.inc,
                ctrl.level,
                `clock${position}${p.boardName}`,
                `difference${position}${p.boardName}`,
                `player${position}${p.boardName}`,
            );
        });

        // live remaining time of a clock, whether or not it is currently running (mirrors Clock's own tick math)
        const liveTime = (clock: Clock) =>
            clock.running ? clock.duration - (Date.now() - clock.startTime) : clock.duration;

        // difference value = this clock's live time minus the live time of the clock of your
        // opponent's partner (the same color, on the other board). Updated on every tick.
        this.seats.forEach(seat => {
            seat.clock.onTick(diff => {
                seat.clock.renderTime(diff);
                const counterpart = this.seatOf(info.opponentsPartnerOf(seat.player));
                const otherMillis = liveTime(counterpart.clock);
                seat.difference.renderDifference(Math.round((diff - otherMillis) / 1000));
                counterpart.difference.renderDifference(Math.round((otherMillis - diff) / 1000));
            });
        });
    }

    seatOf = (player: TwoBoardPlayer): RoundSeat => {
        return this.seats.find(s => s.player === player)!;
    };

    seatAt = (board: BugBoardName, color: cg.Color): RoundSeat => {
        return this.seatOf(this.playersInfo.byBoardAndColor(board, color));
    };

    seatsOn = (board: BugBoardName): RoundSeat[] => {
        return this.seats.filter(s => s.player.boardName === board);
    };

    setConnecting = (connecting: boolean) => {
        this.seats.forEach(s => (s.clock.connecting = connecting));
    };

    getClock = (boardName: string, color: cg.Color) => {
        return this.seatAt(boardName as BugBoardName, color).clock;
    };

    // online/offline indicator on the player bars of every seat this username occupies
    setPresence = (username: string, online: boolean) => {
        this.seats
            .filter(s => s.player.username === username)
            .forEach(s => {
                const id = `player${s.position}${s.player.boardName}`;
                patch(
                    document.getElementById(id) as HTMLElement,
                    h(`i-side.online#${id}`, { class: { icon: true, 'icon-online': online, 'icon-offline': !online } }),
                );
            });
    };

    /**
     * @param boardName - for which board we are updating the clocks
     * @param turnColor - whose turn it is after this move - their clock should be started
     * @param status - current game status (needed to know whether the clock should actually start)
     *
     * Stops clock of user how made the move for the board in question,
     * updates the clock times with the new values,
     * starts the clock of the player whose turn is now
     * */
    updateClocks(boardName: BoardName, turnColor: cg.Color, msgClocks: Clocks, status: number) {
        const board = boardName as BugBoardName;
        const whiteSeat = this.seatAt(board, 'white');
        const blackSeat = this.seatAt(board, 'black');

        whiteSeat.clocktime = msgClocks[WHITE];
        blackSeat.clocktime = msgClocks[BLACK];

        const moverSeat = turnColor === 'white' ? blackSeat : whiteSeat;
        const nextSeat = turnColor === 'white' ? whiteSeat : blackSeat;

        moverSeat.clock.pause(false);

        whiteSeat.clock.setTime(msgClocks[WHITE]);
        blackSeat.clock.setTime(msgClocks[BLACK]);

        if (status < 0) {
            nextSeat.clock.start();
        }
    }
}
