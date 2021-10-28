import Sockette from 'sockette';

import { init, h } from 'snabbdom';
import { VNode } from 'snabbdom/vnode';
import klass from 'snabbdom/modules/class';
import attributes from 'snabbdom/modules/attributes';
import properties from 'snabbdom/modules/props';
import listeners from 'snabbdom/modules/eventlisteners';
import style from 'snabbdom/modules/style';

const patch = init([klass, attributes, properties, listeners, style]);

import { Chessground } from 'chessgroundx';

import { JSONObject } from './types';
import { _ } from './i18n';
import { chatMessage, chatView } from './chat';
//import { sound } from './sound';
import { VARIANTS, uci2cg } from './chess';
import { timeControlStr } from "./view";
import { initializeClock, localeOptions } from './datetime';
import { gameType } from './profile';
import { boardSettings } from './boardSettings';
import { Api } from "chessgroundx/api";
import { PyChessModel } from "./main";
import { MsgBoard, MsgChat, MsgFullChat, MsgSpectators, MsgGameEnd, MsgNewGame } from "./messages";
import * as cg from 'chessgroundx/types';

const T_STATUS = {
    0: "created",
    1: "started",
    2: "aborted",
    3: "finished",
    4: "archived",
}

const scoreTagNames = ['score', 'streak', 'double'];

const SCORE_SHIFT = 100000;

const SHIELD = 's';

interface MsgUserStatus {
    ustatus: string;
}

interface MsgGetGames {
    rank: number;
    name: string;
    title: string;
    games: TournamentGame[];
    perf: number;
    nbWin: number;
    nbGames: number;
}

interface TournamentGame {
    gameId: string;
    title: string;
    name: string;
    result: string;
    color: string;
    rating: number;
}

interface MsgTournamentStatus {
    tstatus: number;
    secondsToFinish: number;
    nbPlayers: number;
    sumRating: number;
    nbGames: number;
    wWin: number;
    bWin: number;
    draw: number;
    berserk: number;
}

interface MsgUserConnectedTournament {
    tsystem: number;
    tminutes: number;
    frequency: string;
    startsAt: string;
    startFen: cg.FEN;

    username: string;
    ustatus: string;
    urating: number;
    tstatus: number;
    description: string;
    secondsToStart: number;
    secondsToFinish: number;
}

interface MsgGetPlayers {
    page: number;
    requestedBy: string;
    nbPlayers: number;
    nbGames: number;

    players: TournamentPlayer[];
    podium?: TournamentPlayer[];
}

interface TournamentPlayer {
    name: string;
    score: number;
    paused: boolean;
    title: string;
    rating: number;
    points: any[]; // TODO: I am not sure what elements can be in here. most of the time i see 2-element arrays (i think first is the result, second a streak flag or somthing). But i've seen also string '*' as well and there is that chck about isArray that might mean more cases with numeric scalars exist
    fire: number;
    perf: number;
    nbGames: number;
    nbWin: number;
    nbBerserk: number;
}

interface MsgError {
    message: string;
}
interface MsgPing {
    timestamp: string;
}

interface TopGame {
    gameId: string;
    variant: string;
    fen: cg.FEN;
    w: string;
    b: string;
    wr: number;
    br: number;
    chess960: boolean;
    base: number;
    inc: number;
    byoyomi: number;
}

export default class TournamentController {
    model: PyChessModel;
    sock;
    readyState: number; // seems unused
    buttons: VNode;
    system: number;
    players: TournamentPlayer[]; // seems unused
    nbPlayers: number;
    page: number;
    tournamentStatus: string;
    userStatus: string;
    userRating: number; // seems unused
    action: VNode;
    clockdiv: VNode;
    topGame: TopGame;
    topGameId: string;
    topGameChessground: Api;
    playerGamesOn: boolean;
    fc: string;
    sc: string;
    startsAt: string;
    visitedPlayer: string;
    secondsToStart: number;
    secondsToFinish: number;
    

    constructor(el: HTMLElement, model: PyChessModel) {
        console.log("TournamentController constructor", el, model);
        this.model = model;
        this.nbPlayers = 0;
        this.page = 1;
        this.tournamentStatus = T_STATUS[model["status"] as keyof typeof T_STATUS];
        this.visitedPlayer = '';
        this.startsAt = model["date"];
        this.secondsToStart = 0;
        this.secondsToFinish = 0;

        const onOpen = (evt: Event) => {
            this.readyState = (evt.target as EventSource).readyState;
            console.log('onOpen()');
            this.doSend({ type: "tournament_user_connected", username: this.model["username"], tournamentId: this.model["tournamentId"]});
            this.doSend({ type: "get_players", "tournamentId": this.model["tournamentId"], page: this.page });
        }

        this.readyState = -1;
        const opts = {
            maxAttempts: 20,
            onopen: (e: Event) => onOpen(e),
            onmessage: (e: MessageEvent) => this.onMessage(e),
            onreconnect: (e: Event | CloseEvent) => console.log('Reconnecting in tournament...', e),
            onmaximum: (e: CloseEvent) => console.log('Stop Attempting!', e),
            onclose: (e: CloseEvent) => {console.log('Closed!', e);},
            onerror: (e: Event) => console.log('Error:', e),
        };

        const ws = location.host.includes('pychess') ? 'wss://' : 'ws://';
        this.sock = new Sockette(ws + location.host + "/wst", opts);

        const variant = VARIANTS[this.model.variant];
        this.fc = variant.firstColor;
        this.sc = variant.secondColor;

        patch(document.getElementById('lobbychat') as HTMLElement, chatView(this, "lobbychat"));
        this.buttons = patch(document.getElementById('page-controls') as HTMLElement, this.renderButtons());

        this.clockdiv = patch(document.getElementById('clockdiv') as HTMLElement, h('div#clockdiv'));
        this.playerGamesOn = false;

        boardSettings.updateBoardAndPieceStyles();
    }

    doSend(message: JSONObject) {
        // console.log("---> tournament doSend():", message);
        this.sock.send(JSON.stringify(message));
    }

    goToPage(page: number) {
        let newPage = page;
        if (page < 1) {
            newPage = 1;
        } else {
            const x = Math.floor(this.nbPlayers / 10);
            const y = this.nbPlayers % 10;
            const lastPage = x + ((y > 0) ? 1 : 0);
            newPage = (page > lastPage) ? lastPage : page;
        }
        if (newPage !== this.page) {
            this.page = newPage;
            this.doSend({ type: "get_players", "tournamentId": this.model["tournamentId"], "page": newPage });
        }
    }

    goToMyPage() {
        this.doSend({ type: "my_page", "tournamentId": this.model["tournamentId"] });
    }

    login() {
        window.location.assign(this.model["home"] + '/login');
    }

    join() {
        this.doSend({ type: "join", "tournamentId": this.model["tournamentId"] });
    }

    pause() {
        this.doSend({ type: "pause", "tournamentId": this.model["tournamentId"] });
    }

    withdraw() {
        this.doSend({ type: "withdraw", "tournamentId": this.model["tournamentId"] });
    }

    renderButtons() {
        return h('div#page-controls.btn-controls', [
            h('div.pager', [
                h('button', { on: { click: () => this.goToPage(1) } }, [ h('i.icon.icon-fast-backward', { props: { title: _('First') } }) ]),
                h('button', { on: { click: () => this.goToPage(this.page - 1) } }, [ h('i.icon.icon-step-backward', { props: { title: _('Prev') } }) ]),
                 // TODO: update
                h('span.page', `${(this.page-1)*10 + 1} - ${Math.min((this.page)*10, this.nbPlayers)} / ${this.nbPlayers}`),
                h('button', { on: { click: () => this.goToPage(this.page + 1) } }, [ h('i.icon.icon-step-forward', { props: { title: _('Next') } }) ]),
                h('button', { on: { click: () => this.goToPage(10000) } }, [ h('i.icon.icon-fast-forward', { props: { title: _('Last') } }) ]),
                h('button', { on: { click: () => this.goToMyPage() } }, [ h('i.icon.icon-target', { props: { title: _('Scroll to your player') } }) ]),
            ]),
            h('div#action'),
        ]);
    }

    updateActionButton() {
        let button = h('div#action');
        switch (this.tournamentStatus) {
        case 'created':
            if (this.userStatus === 'joined') {
                button = h('button#action', { on: { click: () => this.withdraw() }, class: {"icon": true, "icon-flag-o": true} }, _('WITHDRAW'));
            } else {
                button = h('button#action', { on: { click: () => this.join() }, class: {"icon": true, "icon-play": true} }, _('JOIN'));
            }
            break;
        case 'started':
            if ('spectator|paused'.includes(this.userStatus)) {
                button = h('button#action', { on: { click: () => this.join() }, class: {"icon": true, "icon-play": true} }, _('JOIN'));
            } else {
                button = h('button#action', { on: { click: () => this.pause() }, class: {"icon": true, "icon-pause": true} }, _('PAUSE'));
            }
            break;
        }
        if (this.model["anon"] === 'True' && 'created|started'.includes(this.tournamentStatus)) {
            button = h('button#action', { on: { click: () => this.login() }, class: {"icon": true, "icon-play": true} }, _('LOG IN'));
        }
        // console.log("updateActionButton()", this.tournamentStatus, button);
        this.action = patch(document.getElementById('action') as HTMLElement, button);
    }

    completed() {
        return 'aborted|finished|archived'.includes(this.tournamentStatus);
    }

    renderSummary(msg: MsgTournamentStatus) {
        const summary = h('div#summary', {class: {"box": true}}, [
            h('h2', _('Tournament complete')),
            h('table', [
                h('tr', [h('th', _('Players')), h('td', msg.nbPlayers)]),
                h('tr', [h('th', _('Average rating')), h('td', Math.round(msg.sumRating / msg.nbPlayers))]),
                h('tr', [h('th', _('Games played')), h('td', msg.nbGames)]),
                h('tr', [h('th', _('White wins')), h('td', this.winRate(msg.nbGames, msg.wWin))]),
                h('tr', [h('th', _('Black wins')), h('td', this.winRate(msg.nbGames, msg.bWin))]),
                h('tr', [h('th', _('Draws')), h('td', this.winRate(msg.nbGames, msg.draw))]),
                h('tr', [h('div', _('Berserk rate')), h('td', this.winRate(msg.nbGames * 2, msg.berserk))]),
            ]),
            h('table.tour-stats-links', [
                h('a.i-dl.icon.icon-download', {
                    attrs: {
                        href: '/games/export/tournament/' + this.model["tournamentId"],
                        download: this.model["tournamentId"] + '.pgn',
                    },
                }, _('Download all games')),
            ]),
        ]);
        const el = document.getElementById('summarybox') as HTMLElement;
        if (el) patch(el, summary);
    }

    renderPlayers(players: TournamentPlayer[]) {
        const rows = players.map((player,index) => this.playerView(player, (this.page - 1) * 10 + index + 1));
        return rows;
    }

    private playerView(player: TournamentPlayer, index: number) {
        if (player.name === this.visitedPlayer) {
            this.doSend({ type: "get_games", tournamentId: this.model["tournamentId"], player: this.visitedPlayer });
        }
        let fullScore = Math.trunc(player.score / SCORE_SHIFT);
        if (this.system > 0 && this.model["variant"] !== 'janggi') fullScore = fullScore / 2;
        
        return h('tr', { on: { click: () => this.onClickPlayer(player.name) } }, [
            h('td.rank', [(player.paused) ? h('i', {class: {"icon": true, "icon-pause": true} }) : index]),
            h('td.player', [
                h('span.title', player.title),
                h('span.name', player.name),
                h('span', player.rating),
            ]),
            h('td.sheet', [h('div', player.points.map( (s: any) => {
                let score = Array.isArray(s) ? s[0] : s;
                if (this.system > 0 && score !== '*' && score !== '-' && this.model["variant"] !== 'janggi') score = score / 2;
                const pointKlass = this.system > 0 ? '.point' : '';
                const resultKlass = ((this.system > 0) ? (score >= 1) ? '.win': (score === 0.5) ? '.draw' : '.lose' : '');
                if (score === 0.5) score = '½';
                return h(scoreTagNames[(s[1] || 1) - 1] + pointKlass + resultKlass, [score]);
            }))]),
            h('td.total', [
                h('fire', [(player.fire === 2 && this.tournamentStatus === 'started') ? h('i', {class: {"icon": true, "icon-fire": true} }) : '']),
                h('strong.score', fullScore),
                // h('span.perf', player.perf)
            ]),
        ]);
    }

    private onClickPlayer(player: string) {
        console.log('onClickPlayer()', player);
        if (this.tournamentStatus === 'created') return;

        if (this.completed()) {
            if (this.playerGamesOn && this.visitedPlayer === player) {
                (document.getElementById('summary') as HTMLElement).style.display = 'block';
                (document.getElementById('player') as HTMLElement).style.display = 'none';
                this.playerGamesOn = false;
            } else {
                this.doSend({ type: "get_games", tournamentId: this.model["tournamentId"], player: player });
                (document.getElementById('summary') as HTMLElement).style.display = 'none';
                (document.getElementById('player') as HTMLElement).style.display = 'block';
                this.playerGamesOn = true;
                this.visitedPlayer = player;
            }
        // started
        } else {
            this.doSend({ type: "get_games", tournamentId: this.model["tournamentId"], player: player });
            if (this.playerGamesOn && this.visitedPlayer === player) {
                this.renderTopGame();
                (document.getElementById('player') as HTMLElement).style.display = 'none';
                this.playerGamesOn = false;
            } else {
                this.renderEmptyTopGame();
                (document.getElementById('player') as HTMLElement).style.display = 'block';
                this.playerGamesOn = true;
            }
            this.visitedPlayer = player;
        }
    }

    renderGames(games: TournamentGame[]) {
        const rows = games.reverse().map((game, index) => this.gameView(game, games.length - index));
        return rows;
    }

    result(result: string, color: string) {
        let value = '*';
        switch (result) {
        case '1-0':
            value = (color === 'w') ? '1' : '0';
            break;
        case '0-1':
            value = (color === 'b') ? '1' : '0';
            break;
        case '1/2-1/2':
            value = '½';
            break;
        case '-':
            value = '-';
            break;
        }
        const klass = (value === '1') ? '.win' : (value === '0') ? '.lose' : '';
        return h(`td.result${klass}`, value);
    }

    private gameView(game: TournamentGame, index: number) {
        if (game.result === '-') {
            return h('tr', [
                h('th', index),
                h('td.bye', { attrs: { colspan: '3' } }, 'Bye'),
                h('td.result', '-')
            ]);
        } else {
            const color = (game.color === 'w') ? this.fc : this.sc;
            return h('tr', { on: { click: () => { window.open('/' + game.gameId, '_blank', 'noopener'); }}}, [
                h('th', index),
                h('td.player', [
                    h('span.title', game.title),
                    h('span.name', game.name),
                ]),
                h('td', game.rating),
                h('td', [
                    h('i-side.icon', {
                        class: {
                            "icon-white": color === "White",
                            "icon-black": color === "Black",
                            "icon-red":   color === "Red",
                            "icon-blue":  color === "Blue",
                            "icon-gold":  color === "Gold",
                            "icon-pink":  color === "Pink",
                        }
                    }),
                ]),
                this.result(game.result, game.color),
            ]);
        }
    }

    private tSystem(system: number) {
        switch (system) {
        case 0:
            return "Arena";
        case 1:
            return "Round-Robin";
        default:
            return "Swiss";
        }
    }

    renderStats(msg: MsgGetGames) {
        const games = msg.games.filter(game => game.result !== '-');
        const gamesLen = games.length;
        const avgOp = gamesLen
            ? Math.round(
                games.reduce(function (a, b) {
                    return a + b.rating;
                }, 0) / gamesLen
            )
            : 0;

        return [
            h('span.close', {
                on: { click: () => this.onClickPlayer(this.visitedPlayer) },
                attrs: { 'data-icon': 'j' } 
            }),
            h('h2', [
                h('rank', msg.rank + '. '),
                playerInfo(msg.name, msg.title),
            ]),
            h('table.stats', [
                h('tr', [h('th', _('Performance')), h('td', msg.perf)]),
                h('tr', [h('th', _('Games played')), h('td', gamesLen)]),
                h('tr', [h('th', _('Win rate')), h('td', this.winRate(msg.nbGames, msg.nbWin))]),
                h('tr', [h('th', _('Average opponent')), h('td', avgOp)]),
            ]),
        ];
    }

    renderEmptyTopGame() {
        patch(document.getElementById('top-game') as HTMLElement, h('div#top-game.empty'));
    }

    renderTopGame() {
        if (this.topGame === undefined) return;

        const game = this.topGame;
        const variant = VARIANTS[game.variant];
        const element = h(`selection#mainboard.${variant.board}.${variant.piece}`, {
            on: { click: () => window.location.assign('/' + game.gameId) }
        }, h('div', [
            h('div.player', [h('user', [h('rank', '#' + game.br), game.b]), h('div#bresult')]),
            h(`div.cg-wrap.${variant.cg}`, {
                hook: {
                    insert: vnode => {
                        const cg = Chessground(vnode.elm as HTMLElement, {
                            fen: game.fen,
                            // lastMove: game.lastMove,// TODO: i dont see such property in python searching for "top_game"
                            geometry: variant.geometry,
                            coordinates: false,
                            viewOnly: true
                        });
                        this.topGameChessground = cg;
                        this.topGameId = game.gameId;
                    }
                }
            }),
            h('div.player', [h('user', [h('rank', '#' + game.wr), game.w]), h('div#wresult')]),
        ]));

        patch(document.getElementById('top-game') as HTMLElement, h('div#top-game', element));
    }

    winRate(nbGames: number, nbWin: number) {
        return ((nbGames !== 0) ? Math.round(100 * (nbWin / nbGames)) : 0) + '%';
    }

    renderPodium(players: TournamentPlayer[]) {
        return h('div.podium', [
            h('div.second', [
                h('div.trophy'),
                playerInfo(players[1].name, players[1].title),
                h('table.stats', [
                    h('tr', [h('th', _('Performance')), h('td', players[1].perf)]),
                    h('tr', [h('th', _('Games played')), h('td', players[1].nbGames)]),
                    h('tr', [h('th', _('Win rate')), h('td', this.winRate(players[1].nbGames, players[1].nbWin))]),
                    h('tr', [h('th', _('Berserk rate')), h('td', this.winRate(players[1].nbGames, players[1].nbBerserk))])
                ])
            ]),
            h('div.first', [
                h('div.trophy'),
                playerInfo(players[0].name, players[0].title),
                h('table.stats', [
                    h('tr', [h('th', _('Performance')), h('td', players[0].perf)]),
                    h('tr', [h('th', _('Games played')), h('td', players[0].nbGames)]),
                    h('tr', [h('th', _('Win rate')), h('td', this.winRate(players[0].nbGames, players[0].nbWin))]),
                    h('tr', [h('th', _('Berserk rate')), h('td', this.winRate(players[0].nbGames, players[0].nbBerserk))])
                ])
            ]),
            h('div.third', [
                h('div.trophy'),
                playerInfo(players[2].name, players[2].title),
                h('table.stats', [
                    h('tr', [h('th', _('Performance')), h('td', players[2].perf)]),
                    h('tr', [h('th', _('Games played')), h('td', players[2].nbGames)]),
                    h('tr', [h('th', _('Win rate')), h('td', this.winRate(players[2].nbGames, players[2].nbWin))]),
                    h('tr', [h('th', _('Berserk rate')), h('td', this.winRate(players[2].nbGames, players[2].nbBerserk))])
                ])
            ])
        ]);
    }

    private onMsgGetGames(msg: MsgGetGames) {
        const oldStats = document.getElementById('stats') as Element;
        oldStats.innerHTML = "";
        patch(oldStats, h('div#stats.box', [h('tbody', this.renderStats(msg))]));

        const oldGames = document.getElementById('games') as Element;
        oldGames.innerHTML = "";
        patch(oldGames, h('table#games.pairings.box', [h('tbody', this.renderGames(msg.games))]));
    }

    private onMsgGetPlayers(msg: MsgGetPlayers) {
        if (this.completed() && msg.podium && msg.players.length >= 3 && msg.nbGames > 0) {
            const podium = document.getElementById('podium') as HTMLElement;
            if (podium instanceof Element) {
                patch(podium, this.renderPodium(msg.podium));
            }
        }

        if (this.page === msg.page || msg.requestedBy === this.model["username"]) {
            this.players = msg.players;
            this.page = msg.page;
            this.nbPlayers = msg.nbPlayers;
            this.buttons = patch(this.buttons, this.renderButtons());

            const oldPlayers = document.getElementById('players') as Element;
            oldPlayers.innerHTML = "";
            patch(oldPlayers, h('table#players.players.box', [h('tbody', this.renderPlayers(msg.players))]));
        }
    }

    private onMsgNewGame(msg: MsgNewGame) {
        window.location.assign('/' + msg.gameId);
    }

    private onMsgGameUpdate() {
        this.doSend({ type: "get_players", tournamentId: this.model["tournamentId"], page: this.page });
    }

    durationString(minutes: number) {
        if (minutes === 0) return '';
        if (minutes < 60) {
            return " • " + minutes + 'm';
        } else {
            return " • " + Math.floor(minutes / 60) + 'h' + ((minutes % 60 !== 0) ? ' ' + (minutes % 60) + 'm': '')
        }
    }

    renderDescription(text: string) {
        const parts = text.split(/(\[.*?\))/g);
        if (parts !== null && parts.length > 0) {
            const newArr = parts.map(el => {
                const txtPart = el.match(/\[(.+)\]/);  //get only the txt
                const urlPart = el.match(/\((.+)\)/);  //get only the link
                if (txtPart && urlPart) {
                    return h('a', { attrs: { href: urlPart[1], target: "_blank" } }, txtPart[1]);
                } else {
                    return el;
                }
            });
            return h('div.description', newArr);
        }
        return h('div.description', text);
    }

    private onMsgUserConnected(msg: MsgUserConnectedTournament) {
        const variant = VARIANTS[this.model.variant];
        const chess960 = this.model.chess960 === 'True';
        const dataIcon = variant.icon(chess960);

        const trophy = document.getElementById('trophy') as Element;
        if (trophy && msg.frequency === SHIELD) patch(trophy, h('a', {class: {"shield-trophy": true} }, dataIcon));
        
        this.system = msg.tsystem;
        const tsystem = document.getElementById('tsystem') as Element;
        patch(tsystem, h('div#tsystem', gameType(this.model["rated"]) + " • " + this.tSystem(this.system)));

        const tminutes = document.getElementById('tminutes') as Element;
        patch(tminutes, h('span#tminutes', this.durationString(msg.tminutes)));

        const startsAtDate = new Date(msg.startsAt);
        const startsAt = document.getElementById('startsAt') as Element;
        if (startsAt) patch(startsAt, h('date', startsAtDate.toLocaleString("default", localeOptions)));
        if (msg.startFen !== '') {
            const startFen = document.getElementById('startFen') as Element;
            const fen = msg.startFen.split(" ").join('_').replace(/\+/g, '.');
            patch(startFen, h('p', [
                _('Custom position') + ' • ',
                h('a', { attrs: { href: '/analysis/' + this.model["variant"] + '?fen=' + fen } }, _('Analysis board'))
            ]));
        }

        const description = document.getElementById('description') as Element;
        if (msg.description.length > 0 && description) patch(description, this.renderDescription(msg.description));

        this.model.username = msg.username;
        this.tournamentStatus = T_STATUS[msg.tstatus as keyof typeof T_STATUS];
        this.userStatus = msg.ustatus;
        this.userRating = msg.urating;
        this.secondsToStart = msg.secondsToStart;
        this.secondsToFinish = msg.secondsToFinish;
        this.updateActionButton()

        if (!this.completed()) {
            initializeClock(this);
        }
    }

    private onMsgSpectators = (msg: MsgSpectators) => {
        const container = document.getElementById('spectators') as HTMLElement;
        patch(container, h('under-chat#spectators', _('Spectators: ') + msg.spectators));
    }

    private onMsgUserStatus(msg: MsgUserStatus) {
        this.userStatus = msg.ustatus;
        this.updateActionButton()
    }

    private onMsgTournamentStatus(msg: MsgTournamentStatus) {
        const oldStatus = this.tournamentStatus;
        this.tournamentStatus = T_STATUS[msg.tstatus as keyof typeof T_STATUS];
        if (oldStatus !== this.tournamentStatus) {
            if (msg.secondsToFinish !== undefined) {
                this.secondsToFinish = msg.secondsToFinish;
            }
            // TODO: in Swiss/RR clock is meaningless, we need the number of ongoing games shown and updating
            initializeClock(this);
        }
        this.updateActionButton()
        if (this.completed()) {
            patch(this.clockdiv, h('div#clockdiv'));
            this.renderEmptyTopGame();
            (document.getElementById('player') as HTMLElement).style.display = 'none';
            this.renderSummary(msg);
            this.doSend({ type: "get_players", "tournamentId": this.model["tournamentId"], page: this.page });
        }
    }

    private onMsgTopGame(msg: TopGame) {
        this.topGame = msg;
        if (this.tournamentStatus === 'started' && !this.playerGamesOn) {
            this.renderEmptyTopGame();
            this.renderTopGame();
        }
    }

    private onMsgBoard = (msg: MsgBoard) => {
        if (this.topGameChessground === undefined || this.topGameId !== msg.gameId) {
            return;
        };

        let lastMove: cg.Key[] = [];
        if (msg.lastMove !== undefined) {
            const lastMoveStr = uci2cg(msg.lastMove);
            // drop lastMove causing scrollbar flicker,
            // so we remove from part to avoid that
            lastMove = lastMoveStr.includes('@') ? [lastMoveStr.slice(-2) as cg.Key] : [lastMoveStr.slice(0, 2) as cg.Key, lastMoveStr.slice(2, 4) as cg.Key];
        }
        this.topGameChessground.set({
            fen: msg.fen,
            turnColor: msg.fen.split(" ")[1] === "w" ? "white" : "black",
            check: msg.check,
            lastMove: lastMove,
        });
    }

    private checkStatus = (msg: MsgGameEnd) => {
        if (this.topGameChessground === undefined || this.topGameId !== msg.gameId) {
            return;
        }
        console.log(msg);
        if (msg.status >= 0) {
            const result = msg.result.split('-');
            patch(document.getElementById('wresult') as HTMLElement, h('div#wresult', result[0]));
            patch(document.getElementById('bresult') as HTMLElement, h('div#bresult', result[1]));
        }
    }

    private onMsgChat(msg: MsgChat) {
        chatMessage(msg.user, msg.message, "lobbychat", msg.time);
        // seems this is annoying for most of the users
        //if (msg.user.length !== 0 && msg.user !== '_server')
        //    sound.socialNotify();
    }
    private onMsgFullChat(msg: MsgFullChat) {
        // To prevent multiplication of messages we have to remove old messages div first
        patch(document.getElementById('messages') as HTMLElement, h('div#messages-clear'));
        // then create a new one
        patch(document.getElementById('messages-clear') as HTMLElement, h('div#messages'));
        msg.lines.forEach(line => chatMessage(line.user, line.message, "lobbychat", line.time));
    }

    private onMsgPing(msg: MsgPing) {
        this.doSend({ type: "pong", timestamp: msg.timestamp });
    }
    private onMsgError(msg: MsgError) {
        alert(msg.message);
    }

    onMessage(evt: MessageEvent) {
        //console.log("<+++ tournament onMessage():", evt.data);
        const msg = JSON.parse(evt.data);
        switch (msg.type) {
            case "ustatus":
                this.onMsgUserStatus(msg);
                break;
            case "tstatus":
                this.onMsgTournamentStatus(msg);
                break;
            case "get_players":
                this.onMsgGetPlayers(msg);
                break;
            case "new_game":
                this.onMsgNewGame(msg);
                break;
            case "game_update":
                this.onMsgGameUpdate();
                break;
            case "get_games":
                this.onMsgGetGames(msg);
                break;
            case "board":
                this.onMsgBoard(msg);
                break;
            case "gameEnd":
                this.checkStatus(msg);
                break;
            case "tournament_user_connected":
                this.onMsgUserConnected(msg);
                break;
            case "spectators":
                this.onMsgSpectators(msg);
                break;
            case "top_game":
                this.onMsgTopGame(msg);
                break;
            case "lobbychat":
                this.onMsgChat(msg);
                break;
            case "fullchat":
                this.onMsgFullChat(msg);
                break;
            case "ping":
                this.onMsgPing(msg);
                break;
            case "error":
                this.onMsgError(msg);
                break;
        }
    }

}

function runTournament(vnode: VNode, model: PyChessModel) {
    const el = vnode.elm as HTMLElement;
    new TournamentController(el, model);
}

export function tournamentView(model: PyChessModel): VNode[] {
    const variant = VARIANTS[model.variant];
    const chess960 = model.chess960 === 'True';
    const dataIcon = variant.icon(chess960);

    return [
        h('aside.sidebar-first', [
            h('div.game-info', [
                h('div.info0.icon', { attrs: { "data-icon": dataIcon } }, [
                    h('div.info2', [
                        h('div.tc', [
                            timeControlStr(model["base"], model["inc"], model["byo"]) + " • ",
                            h('a', {
                                attrs: {
                                    target: '_blank',
                                    href: '/variants/' + model["variant"] + (chess960 ? '960': ''),
                                }
                            },
                            variant.displayName(chess960)),
                            h('span#tminutes'),
                        ]),
                        h('div#tsystem'),
                    ]),
                ]),
                // TODO: update in onMsgUserConnected()
                h('div#description'),
                h('div#requirements'),
                h('div#startsAt'),
                h('div#startFen'),
            ]),
            h('div#lobbychat')
        ]),
        h('div.players', [
            h('div.box', [
                h('div.tour-header', [
                    h('div#trophy'),
                    h('h1', model["tournamentname"]),
                    h('div#clockdiv'),
                ]),
                h('div#podium'),
                h('div#page-controls'),
                h('table#players', { hook: { insert: vnode => runTournament(vnode, model) } }),
            ]),
        ]),
        h('div.tour-table', [
            h('div#summarybox'),
            h('div#top-game'),
            h('div#player', [
                    h('div#stats.box'),
                    h('table#games.box'),
            ]),
        ]),
        h('under-chat#spectators'),
    ];
}

function playerInfo(name: string, title: string) {
    return h('a.user-link', { attrs: { href: '/@/' + name } }, [h('player-title', " " + title + " "), name])}
