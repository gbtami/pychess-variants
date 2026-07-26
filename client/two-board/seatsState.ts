import { h, VNode } from 'snabbdom';
import * as cg from 'chessgroundx/types';

import { patch } from '../document';
import { Clock } from '../clock';
import { ClockDifference } from './round/clockDifference';
import { Clocks } from '../messages';
import { BoardName, BugBoardName } from '../types';
import { BLACK, WHITE } from '../chess';
import { player as playerBar } from '../player';
import { Seat } from './common/players';
import type { RoundControllerBughouse } from './round/roundCtrl';

// A seat on the round page: the shared seat (board+color coordinate and player)
// extended with everything round-only — its clock, its clock-difference
// indicator, its rendered player bar and its last server-recorded clock time.
export class RoundSeat extends Seat {
    readonly clock: Clock;
    readonly difference: ClockDifference;
    // retained vnode of the rendered player bar, for future in-place re-renders
    vplayer: VNode;
    // last clock value recorded for this seat from a server board message (ms)
    clocktime: number;

    constructor(
        seat: Seat,
        // screen position of the seat on its board: 0 = top, 1 = bottom (non-flipped)
        readonly position: 0 | 1,
        base: number,
        inc: number,
        level: number,
        clockId: string,
        differenceId: string,
        playerBarId: string,
    ) {
        super(seat.player, seat.color, seat.boardName);
        this.clocktime = base * 1000 * 60;
        this.clock = new Clock(base, inc, 0, document.getElementById(clockId) as HTMLElement, clockId, false);
        this.difference = new ClockDifference(document.getElementById(differenceId) as HTMLElement, differenceId);
        this.vplayer = patch(
            document.getElementById('r' + playerBarId) as HTMLElement,
            playerBar(playerBarId, this.player.title, this.player.username, this.player.rating, level),
        );
    }
}

// Round-page presentation state: the four RoundSeats. The seat structure itself
// lives in the shared TwoBoardSeats instance owned by the controller base class.
export class SeatsState {
    seats: RoundSeat[];

    constructor(ctrl: RoundControllerBughouse) {
        const info = ctrl.seats;

        // color rendered at the top (position 0) of each board. This represents only the
        // initial positioning on the screen: flip/switch only move html elements around,
        // so these remain constant as initialized here throughout the whole game.
        const topColorA = info.initialTopColor('a');
        const topColorB = info.initialTopColor('b');

        this.seats = info.all.map(s => {
            const topColor = s.boardName === 'a' ? topColorA : topColorB;
            const position = (s.color === topColor ? 0 : 1) as 0 | 1;
            return new RoundSeat(
                s,
                position,
                ctrl.base,
                ctrl.inc,
                ctrl.level,
                `clock${position}${s.boardName}`,
                `difference${position}${s.boardName}`,
                `player${position}${s.boardName}`,
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
                const counterpartSeat = info.opponentsPartnerOf(seat);
                const counterpart = this.seatAt(counterpartSeat.boardName, counterpartSeat.color);
                const otherMillis = liveTime(counterpart.clock);
                seat.difference.renderDifference(Math.round((diff - otherMillis) / 1000));
                counterpart.difference.renderDifference(Math.round((otherMillis - diff) / 1000));
            });
        });
    }

    seatAt = (board: BugBoardName, color: cg.Color): RoundSeat => {
        return this.seats.find(s => s.boardName === board && s.color === color)!;
    };

    seatsOn = (board: BugBoardName): RoundSeat[] => {
        return this.seats.filter(s => s.boardName === board);
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
                const id = `player${s.position}${s.boardName}`;
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
