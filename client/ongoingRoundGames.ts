import { h } from 'snabbdom';

import { Api } from 'chessgroundx/api';

import { _ } from './i18n';
import { patch } from './document';
import {
    Game,
    OngoingGameUpdate,
    gameViewPlaying,
    handleOngoingGameEvents,
} from './nowPlaying';
import { compareGames, nextGameToPlay } from './ongoingGameSelection';
import type { OngoingGamesMode } from './ongoingGameSelection';
import { MsgBoard } from './messages';

const AUTO_SKIP_KEYS = {
    corr: 'corrAutoSkip',
    simul: 'simulAutoSkip',
} as const;

export class OngoingRoundGamesController {
    private readonly username: string;
    private readonly gameId: string;
    private readonly home: string;

    private readonly mode: OngoingGamesMode;
    private autoSkip: boolean;
    private autoSkipRequestedPly: number | null;
    private games: Game[];
    private readonly cgMap: { [gameId: string]: [Api, string] };

    constructor(username: string, gameId: string, home: string, gamesJson: string, mode: OngoingGamesMode) {
        this.username = username;
        this.gameId = gameId;
        this.home = home;
        this.mode = mode;

        const storedAutoSkip = localStorage.getItem(AUTO_SKIP_KEYS[mode]);
        this.autoSkip = storedAutoSkip === null ? mode === 'simul' : storedAutoSkip === 'true';
        this.autoSkipRequestedPly = null;
        this.games = this.parseAndSortGames(gamesJson);
        this.cgMap = {};
    }

    init(): void {
        handleOngoingGameEvents(this.username, this.cgMap, {
            mode: this.mode,
            updateUnreadCounter: this.mode === 'corr',
            onUpdate: this.onOngoingGameUpdate,
        });
        this.renderMiniBoards();
    }

    onMoveSubmitted(expectedPly: number): void {
        if (this.autoSkip) {
            this.autoSkipRequestedPly = expectedPly;
        }
    }

    onBoard(msg: MsgBoard): void {
        this.updateCurrentGameState(msg);
        this.maybeAutoSkipToNextGame(msg);
    }

    onGameEnd(): void {
        this.autoSkipRequestedPly = null;
    }

    private parseAndSortGames(gamesJson: string): Game[] {
        try {
            const games = JSON.parse(gamesJson);
            if (!Array.isArray(games)) return [];
            return (games as Game[]).sort(compareGames(this.username, this.mode));
        } catch {
            return [];
        }
    }

    private renderMiniBoards(): void {
        const container = document.querySelector('.games-container') as HTMLElement | null;
        if (!container) return;

        const otherGames = this.games.filter(game => game.gameId !== this.gameId);
        patch(
            container,
            h('div.ongoing-games-container', [
                ...(otherGames.length > 0
                    ? [
                          h('div.ongoing-games-controls', [
                              h('label.ongoing-auto-skip', [
                                  h('input', {
                                      props: { type: 'checkbox', checked: this.autoSkip },
                                      on: { change: this.onAutoSkipChange },
                                  }),
                                  h('span', _('Auto skip to next game')),
                              ]),
                          ]),
                      ]
                    : []),
                h(
                    'games-grid#games',
                    otherGames.map((game: Game) => gameViewPlaying(this.cgMap, game, this.username, this.mode)),
                ),
            ]),
        );
    }

    private onAutoSkipChange = (event: Event): void => {
        const target = event.target as HTMLInputElement;
        this.autoSkip = target.checked;
        localStorage.setItem(AUTO_SKIP_KEYS[this.mode], this.autoSkip ? 'true' : 'false');
        if (!this.autoSkip) this.autoSkipRequestedPly = null;
    };

    private onOngoingGameUpdate = (message: OngoingGameUpdate): void => {
        const game = this.games.find(ongoingGame => ongoingGame.gameId === message.gameId);
        if (!game) return;

        game.fen = message.fen;
        game.lastMove = message.lastMove;
        game.tp = message.tp;
        game.date = message.date;
        if (typeof message.status === 'number') game.status = message.status;
        if (typeof message.result === 'string') game.result = message.result;
    };

    private updateCurrentGameState(msg: MsgBoard): void {
        const game = this.games.find(ongoingGame => ongoingGame.gameId === this.gameId);
        if (!game) return;

        game.fen = msg.fen;
        game.lastMove = msg.lastMove;
        game.tp = msg.tp;
        game.status = msg.status;
        game.result = msg.result;
    }

    private maybeAutoSkipToNextGame(msg: MsgBoard): void {
        if (this.autoSkipRequestedPly === null) return;
        if (msg.ply < this.autoSkipRequestedPly) return;

        this.autoSkipRequestedPly = null;
        if (!this.autoSkip) return;

        const nextGame = nextGameToPlay(this.games, this.username, this.gameId, this.mode);
        if (nextGame) {
            window.location.assign(this.home + '/' + nextGame.gameId);
        }
    }
}
