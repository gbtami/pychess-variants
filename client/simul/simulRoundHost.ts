import { h } from 'snabbdom';

import { Api } from 'chessgroundx/api';

import { _ } from '../i18n';
import { patch } from '../document';
import {
    Game,
    OngoingGameUpdate,
    compareGames,
    gameViewPlaying,
    handleOngoingGameEvents,
} from '../nowPlaying';
import { MsgBoard } from '../messages';

const SIMUL_AUTO_SKIP_KEY = 'simulAutoSkip';

export class SimulRoundHostController {
    private readonly username: string;
    private readonly gameId: string;
    private readonly home: string;

    private simulAutoSkip: boolean;
    private simulAutoSkipRequestedPly: number | null;
    private simulGames: Game[];
    private readonly simulCgMap: {[gameId: string]: [Api, string]};

    constructor(username: string, gameId: string, home: string, simulGamesJson: string) {
        this.username = username;
        this.gameId = gameId;
        this.home = home;

        this.simulAutoSkip = localStorage[SIMUL_AUTO_SKIP_KEY] === undefined
            ? true
            : localStorage.getItem(SIMUL_AUTO_SKIP_KEY) === 'true';
        this.simulAutoSkipRequestedPly = null;
        this.simulGames = this.parseAndSortGames(simulGamesJson);
        this.simulCgMap = {};
    }

    init(): void {
        handleOngoingGameEvents(this.username, this.simulCgMap, {
            mode: 'simul',
            updateUnreadCounter: false,
            onUpdate: this.onSimulOngoingGameUpdate,
        });
        this.renderMiniBoards();
    }

    onMoveSubmitted(expectedPly: number): void {
        if (this.simulAutoSkip) {
            this.simulAutoSkipRequestedPly = expectedPly;
        }
    }

    onBoard(msg: MsgBoard): void {
        this.updateCurrentGameState(msg);
        this.maybeAutoSkipToNextSimulGame(msg);
    }

    onGameEnd(): void {
        this.simulAutoSkipRequestedPly = null;
    }

    private parseAndSortGames(simulGamesJson: string): Game[] {
        try {
            const games = JSON.parse(simulGamesJson);
            if (!Array.isArray(games)) return [];
            return (games as Game[]).sort(compareGames(this.username, 'simul'));
        } catch (_error) {
            return [];
        }
    }

    private renderMiniBoards(): void {
        const container = document.querySelector('.games-container') as HTMLElement | null;
        if (!container) return;

        patch(container, h('div.simul-games-container', [
            h('div.simul-games-controls', [
                h('label.simul-auto-skip', [
                    h('input', {
                        props: { type: 'checkbox', checked: this.simulAutoSkip },
                        on: { change: this.onSimulAutoSkipChange },
                    }),
                    h('span', _('Auto skip to next game')),
                ]),
            ]),
            h(
                'games-grid#games',
                this.simulGames.flatMap((game: Game) => (
                    game.gameId === this.gameId
                        ? []
                        : [gameViewPlaying(this.simulCgMap, game, this.username, 'simul')]
                )),
            ),
        ]));
    }

    private onSimulAutoSkipChange = (event: Event): void => {
        const target = event.target as HTMLInputElement;
        this.simulAutoSkip = target.checked;
        localStorage[SIMUL_AUTO_SKIP_KEY] = this.simulAutoSkip ? 'true' : 'false';
    }

    private onSimulOngoingGameUpdate = (message: OngoingGameUpdate): void => {
        const game = this.simulGames.find((simulGame) => simulGame.gameId === message.gameId);
        if (!game) return;

        game.fen = message.fen;
        game.lastMove = message.lastMove;
        game.tp = message.tp;
        game.date = message.date;
        if (typeof message.status === 'number') game.status = message.status;
        if (typeof message.result === 'string') game.result = message.result;
    }

    private updateCurrentGameState(msg: MsgBoard): void {
        const game = this.simulGames.find((simulGame) => simulGame.gameId === this.gameId);
        if (!game) return;

        game.fen = msg.fen;
        game.lastMove = msg.lastMove;
        game.tp = msg.tp;
        game.status = msg.status;
        game.result = msg.result;
    }

    private getNextSimulGameToPlay(): Game | undefined {
        const playableGames = this.simulGames
            .filter((game) => (
                game.gameId !== this.gameId
                && game.tp === this.username
                && (typeof game.status !== 'number' || game.status < 0)
            ))
            .sort(compareGames(this.username, 'simul'));
        return playableGames[0];
    }

    private maybeAutoSkipToNextSimulGame(msg: MsgBoard): void {
        if (this.simulAutoSkipRequestedPly === null) return;
        if (msg.ply < this.simulAutoSkipRequestedPly) return;

        this.simulAutoSkipRequestedPly = null;
        if (!this.simulAutoSkip) return;

        const nextGame = this.getNextSimulGameToPlay();
        if (nextGame) {
            window.location.assign(this.home + '/' + nextGame.gameId);
        }
    }
}
