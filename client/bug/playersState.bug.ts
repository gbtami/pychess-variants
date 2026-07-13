import { VNode } from 'snabbdom';
import * as cg from 'chessgroundx/types';

import { patch } from '../document';
import { Clock } from '../clock';
import { ClockDifference } from './clockDifference';
import { Clocks } from '../messages';
import { BoardName, BugBoardName } from '../types';
import { BLACK, WHITE } from '../chess';
import { player } from '../player';
import { playerInfoData } from './gameInfo.bug';
import type { RoundControllerBughouse } from './roundCtrl.bug';

// Holds everything about the 4 clocks (and the clock-difference indicators next to them),
// and about the players/teams/titles/ratings of a bughouse round: who's playing, on which
// board/color, and how that is rendered.
export class PlayersState {
    clocks: [Clock, Clock];
    clocksB: [Clock, Clock];
    clocktimes: Clocks;
    clocktimesB: Clocks;
    differences: [ClockDifference, ClockDifference];
    differencesB: [ClockDifference, ClockDifference];

    colors: cg.Color[];
    colorsB: cg.Color[];

    players: string[];
    playersB: string[];

    wplayer: string;
    bplayer: string;

    wtitle: string;
    btitle: string;
    wrating: string;
    brating: string;

    wplayerB: string;
    bplayerB: string;

    wtitleB: string;
    btitleB: string;
    wratingB: string;
    bratingB: string;

    myColor: Map<'a' | 'b', cg.Color | undefined> = new Map<'a' | 'b', cg.Color | undefined>([
        ['a', undefined],
        ['b', undefined],
    ]);
    partnerColor: Map<'a' | 'b', cg.Color | undefined> = new Map<'a' | 'b', cg.Color | undefined>([
        ['a', undefined],
        ['b', undefined],
    ]);

    teamFirst: [[string, string, string], [string, string, string]];
    teamSecond: [[string, string, string], [string, string, string]];

    vplayerA0: VNode;
    vplayerA1: VNode;

    vplayerB0: VNode;
    vplayerB1: VNode;

    constructor(ctrl: RoundControllerBughouse) {
        const model = ctrl.model;
        const username = ctrl.username;

        this.teamFirst = [playerInfoData(model, 'w', 'a'), playerInfoData(model, 'b', 'b')];
        this.teamSecond = [playerInfoData(model, 'b', 'a'), playerInfoData(model, 'w', 'b')];

        // initialize users
        this.wplayer = model.wplayer;
        this.bplayer = model.bplayer;

        this.wtitle = model.wtitle;
        this.btitle = model.btitle;
        this.wrating = model.wrating;
        this.brating = model.brating;

        this.wplayerB = model.wplayerB;
        this.bplayerB = model.bplayerB;

        this.wtitleB = model.wtitleB;
        this.btitleB = model.btitleB;
        this.wratingB = model.wratingB;
        this.bratingB = model.bratingB;
        //
        if (this.wplayer === username) this.myColor.set('a', 'white');
        if (this.bplayer === username) this.myColor.set('a', 'black');
        if (this.wplayerB === username) this.myColor.set('b', 'white');
        if (this.bplayerB === username) this.myColor.set('b', 'black');
        //
        if (this.wplayer === username) this.partnerColor.set('b', 'black');
        if (this.bplayer === username) this.partnerColor.set('b', 'white');
        if (this.wplayerB === username) this.partnerColor.set('a', 'black');
        if (this.bplayerB === username) this.partnerColor.set('a', 'white');
        //
        const spectator = this.myColor.get('a') === undefined && this.myColor.get('b') === undefined;
        // this represents only the initial positioning of players on the screen. Flip/switch will not change those values
        // but only work on html elements, so these remain constant as initialized here throughout the whole game:
        if (spectator) {
            // board A - 0 means top, 1 means bottom
            this.colors = ['black', 'white'];
            // board B - 0 means top, 1 means bottom
            this.colorsB = ['white', 'black'];
        } else {
            // board A - 0 means top, 1 means bottom
            this.colors = [
                this.myColor.get('a') === 'black' || this.partnerColor.get('a') === 'black' ? 'white' : 'black',
                this.myColor.get('a') === 'white' || this.partnerColor.get('a') === 'white' ? 'white' : 'black',
            ];
            // board B - 0 means top, 1 means bottom
            this.colorsB = [
                this.myColor.get('b') === 'black' || this.partnerColor.get('b') === 'black' ? 'white' : 'black',
                this.myColor.get('b') === 'white' || this.partnerColor.get('b') === 'white' ? 'white' : 'black',
            ];
        }
        //
        // board A - 0 means top, 1 means bottom
        this.players = [
            this.colors[0] === 'white' ? this.wplayer : this.bplayer,
            this.colors[1] === 'white' ? this.wplayer : this.bplayer,
        ];
        // board B - 0 means top, 1 means bottom
        this.playersB = [
            this.colorsB[0] === 'white' ? this.wplayerB : this.bplayerB,
            this.colorsB[1] === 'white' ? this.wplayerB : this.bplayerB,
        ];
        //

        const ratings = new Map<string, string>([
            [this.wplayer, this.wrating],
            [this.bplayer, this.brating],
            [this.wplayerB, this.wratingB],
            [this.bplayerB, this.bratingB],
        ]);
        const titles = new Map<string, string>([
            [this.wplayer, this.wtitle],
            [this.bplayer, this.btitle],
            [this.wplayerB, this.wtitleB],
            [this.bplayerB, this.btitleB],
        ]);
        const player0a = document.getElementById('rplayer0a') as HTMLElement;
        const player1a = document.getElementById('rplayer1a') as HTMLElement;
        const level = ctrl.level;
        this.vplayerA0 = patch(
            player0a,
            player('player0a', titles.get(this.players[0])!, this.players[0], ratings.get(this.players[0])!, level),
        );
        this.vplayerA1 = patch(
            player1a,
            player('player1a', titles.get(this.players[1])!, this.players[1], ratings.get(this.players[1])!, level),
        );

        const player0b = document.getElementById('rplayer0b') as HTMLElement;
        const player1b = document.getElementById('rplayer1b') as HTMLElement;
        this.vplayerB0 = patch(
            player0b,
            player('player0b', titles.get(this.playersB[0])!, this.playersB[0], ratings.get(this.playersB[0])!, level),
        );
        this.vplayerB1 = patch(
            player1b,
            player('player1b', titles.get(this.playersB[1])!, this.playersB[1], ratings.get(this.playersB[1])!, level),
        );

        this.clocktimes = [ctrl.base * 1000 * 60, ctrl.base * 1000 * 60];
        this.clocktimesB = [ctrl.base * 1000 * 60, ctrl.base * 1000 * 60];

        // initialize clocks
        // this.clocktimes = {};
        const c0a = new Clock(
            ctrl.base,
            ctrl.inc,
            0,
            document.getElementById('clock0a') as HTMLElement,
            'clock0a',
            false,
        );
        const c1a = new Clock(
            ctrl.base,
            ctrl.inc,
            0,
            document.getElementById('clock1a') as HTMLElement,
            'clock1a',
            false,
        );
        const c0b = new Clock(
            ctrl.base,
            ctrl.inc,
            0,
            document.getElementById('clock0b') as HTMLElement,
            'clock0b',
            false,
        );
        const c1b = new Clock(
            ctrl.base,
            ctrl.inc,
            0,
            document.getElementById('clock1b') as HTMLElement,
            'clock1b',
            false,
        );
        this.clocks = [c0a, c1a];
        this.clocksB = [c0b, c1b];

        // differences rendered next to each clock, showing the time difference vs. your opponent's partner's clock
        const difference0a = new ClockDifference(
            document.getElementById('difference0a') as HTMLElement,
            'difference0a',
        );
        const difference1a = new ClockDifference(
            document.getElementById('difference1a') as HTMLElement,
            'difference1a',
        );
        const difference0b = new ClockDifference(
            document.getElementById('difference0b') as HTMLElement,
            'difference0b',
        );
        const difference1b = new ClockDifference(
            document.getElementById('difference1b') as HTMLElement,
            'difference1b',
        );
        this.differences = [difference0a, difference1a];
        this.differencesB = [difference0b, difference1b];

        // live remaining time of a clock, whether or not it is currently running (mirrors Clock's own tick math)
        const liveTime = (clock: Clock) =>
            clock.running ? clock.duration - (Date.now() - clock.startTime) : clock.duration;

        // difference value = this clock's live time minus the live time of the clock of your opponent's partner
        // (the same color, on the other board). Updated on every tick of any of the 4 clocks.
        const updateDifference = (boardName: BugBoardName, idx: number, diff: number) => {
            const colors = boardName === 'a' ? this.colors : this.colorsB;
            const color = colors[idx];
            const otherBoard: BugBoardName = boardName === 'a' ? 'b' : 'a';
            const otherColors = otherBoard === 'a' ? this.colors : this.colorsB;
            const otherIdx = otherColors[0] === color ? 0 : 1;
            const otherMillis = liveTime((otherBoard === 'a' ? this.clocks : this.clocksB)[otherIdx]);

            const ownDifference = (boardName === 'a' ? this.differences : this.differencesB)[idx];
            ownDifference.renderDifference(Math.round((diff - otherMillis) / 1000));

            const otherDifference = (otherBoard === 'a' ? this.differences : this.differencesB)[otherIdx];
            otherDifference.renderDifference(Math.round((otherMillis - diff) / 1000));
        };

        this.clocks[0].onTick(diff => {
            this.clocks[0].renderTime(diff);
            updateDifference('a', 0, diff);
        });
        this.clocks[1].onTick(diff => {
            this.clocks[1].renderTime(diff);
            updateDifference('a', 1, diff);
        });

        this.clocksB[0].onTick(diff => {
            this.clocksB[0].renderTime(diff);
            updateDifference('b', 0, diff);
        });
        this.clocksB[1].onTick(diff => {
            this.clocksB[1].renderTime(diff);
            updateDifference('b', 1, diff);
        });
    }

    setConnecting = (connecting: boolean) => {
        this.clocks[0].connecting = connecting;
        this.clocks[1].connecting = connecting;
        this.clocksB[0].connecting = connecting;
        this.clocksB[1].connecting = connecting;
    };

    getClock = (boardName: string, color: cg.Color) => {
        const colors = boardName === 'a' ? this.colors : this.colorsB;
        const clocks = boardName === 'a' ? this.clocks : this.clocksB;
        const bclock = colors[0] === 'black' ? 0 : 1;
        const wclock = 1 - bclock;

        return clocks[color === 'black' ? bclock : wclock];
    };

    whichTeamAmI = (): '1' | '2' => {
        return this.myColor.get('a') === 'white' || this.myColor.get('b') === 'black' ? '1' : '2';
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
        if (boardName == 'a') {
            this.clocktimes = msgClocks;
        } else {
            this.clocktimesB = msgClocks;
        }

        const colors = boardName === 'a' ? this.colors : this.colorsB;

        // 0 - top, 1 - botton (in non-flipped mode) - that is how we identify clocks
        // todo: maybe make some enums for top/bottom
        const startClockAtIdx = colors[0] === turnColor ? 0 : 1;
        const stopClockAtIdx = 1 - startClockAtIdx;

        const whiteClockAtIdx = colors[0] === 'white' ? 0 : 1;
        const blackClockAtIdx = 1 - whiteClockAtIdx;

        const clocks = boardName === 'a' ? this.clocks : this.clocksB;

        clocks[stopClockAtIdx].pause(false);

        clocks[whiteClockAtIdx].setTime(msgClocks[WHITE]);
        clocks[blackClockAtIdx].setTime(msgClocks[BLACK]);

        if (status < 0) {
            clocks[startClockAtIdx].start();
        }
    }
}
