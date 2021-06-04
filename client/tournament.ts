import Sockette from 'sockette';

import { init } from 'snabbdom';
import klass from 'snabbdom/modules/class';
import attributes from 'snabbdom/modules/attributes';
import properties from 'snabbdom/modules/props';
import listeners from 'snabbdom/modules/eventlisteners';
import style from 'snabbdom/modules/style';

const patch = init([klass, attributes, properties, listeners, style]);

import h from 'snabbdom/h';
import { VNode } from 'snabbdom/vnode';

import { Chessground } from 'chessgroundx';

import { JSONObject } from './types';
import { _ } from './i18n';
import { chatMessage, chatView } from './chat';
import { sound } from './sound';
import { VARIANTS, uci2cg } from './chess';
import { timeControlStr } from "./view";
import { initializeClock, localeOptions } from './datetime';
import { gameType } from './profile';
import { boardSettings } from './boardSettings';

const T_STATUS = {
    0: "created",
    1: "started",
    2: "aborted",
    3: "finished",
    4: "archived",
}

const scoreTagNames = ['score', 'streak', 'double'];


export default class TournamentController {
    model;
    sock;
    _ws;
    buttons: VNode;
    system: number;
    players: string[];
    nbPlayers: number;
    page: number;
    tournamentStatus: string;
    userStatus: string;
    userRating: string;
    action: VNode;
    clockdiv: VNode;
    topGame: VNode;
    topGameId: string;
    topGameChessground;
    playerGamesOn: boolean;
    fc: string;
    sc: string;
    startsAt: string;
    visitedPlayer: string;
    secondsToStart: number;
    secondsToFinish: number;
    

    constructor(el, model) {
        console.log("TournamentController constructor", el, model);
        this.model = model;
        this.nbPlayers = 0;
        this.page = 1;
        this.tournamentStatus = T_STATUS[model["status"]];
        this.visitedPlayer = '';
        this.startsAt = model["date"];
        this.secondsToStart = 0;
        this.secondsToFinish = 0;

        const onOpen = (evt) => {
            this._ws = evt.target;
            console.log('onOpen()');
            this.doSend({ type: "tournament_user_connected", username: this.model["username"], tournamentId: this.model["tournamentId"]});
            this.doSend({ type: "get_players", "tournamentId": this.model["tournamentId"], page: this.page });
        }

        this._ws = { "readyState": -1 };
        const opts = {
            maxAttempts: 20,
            onopen: e => onOpen(e),
            onmessage: e => this.onMessage(e),
            onreconnect: e => console.log('Reconnecting in tournament...', e),
            onmaximum: e => console.log('Stop Attempting!', e),
            onclose: e => {console.log('Closed!', e);},
            onerror: e => console.log('Error:', e),
        };

        const ws = location.host.includes('pychess') ? 'wss://' : 'ws://';
        this.sock = new Sockette(ws + location.host + "/wst", opts);

        const variant = VARIANTS[this.model.variant];
        this.fc = variant.firstColor;
        this.sc = variant.secondColor;

        patch(document.getElementById('lobbychat') as HTMLElement, chatView(this, "lobbychat"));
        this.buttons = patch(document.getElementById('page-controls') as HTMLElement, this.renderButtons());
        
        this.clockdiv = patch(document.getElementById('clockdiv') as HTMLElement, h('div#clockdiv'));
        this.topGame = patch(document.getElementById('top-game') as HTMLElement, h('div#top-game'));
        this.playerGamesOn = false;

        boardSettings.updateBoardAndPieceStyles();
    }

    doSend(message: JSONObject) {
        // console.log("---> tournament doSend():", message);
        this.sock.send(JSON.stringify(message));
    }

    goToPage(page) {
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
            this.doSend({ type: "get_players", "tournamentId": this.model["tournamentId"], "page": newPage });
        }
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
                h('button', { on: { click: () => this.goToPage(1) } }, [ h('i.icon.icon-fast-backward') ]),
                h('button', { on: { click: () => this.goToPage(this.page - 1) } }, [ h('i.icon.icon-step-backward') ]),
                 // TODO: update
                h('span.page', `${(this.page-1)*10 + 1} - ${Math.min((this.page)*10, this.nbPlayers)} / ${this.nbPlayers}`),
                h('button', { on: { click: () => this.goToPage(this.page + 1) } }, [ h('i.icon.icon-step-forward') ]),
                h('button', { on: { click: () => this.goToPage(10000) } }, [ h('i.icon.icon-fast-forward') ]),
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
            button = h('button#action', { on: { click: () => this.join() }, class: {"icon": true, "icon-play": true} }, _('SIGN IN'));
        }
        // console.log("updateActionButton()", this.tournamentStatus, button);
        this.action = patch(document.getElementById('action') as HTMLElement, button);
    }

    renderPlayers(players) {
        const rows = players.map((player,index) => this.playerView(player, (this.page - 1) * 10 + index + 1));
        return rows;
    }

    private playerView(player, index) {
        if (player.name === this.visitedPlayer) {
            this.doSend({ type: "get_games", tournamentId: this.model["tournamentId"], player: this.visitedPlayer });
        }
        return h('tr', { on: { click: () => this.onClickPlayer(player) } }, [
            h('td.rank', [(player.paused) ? h('i', {class: {"icon": true, "icon-pause": true} }) : index]),
            h('td.player', [
                h('span.title', player.title),
                h('span.name', player.name),
                h('span', player.rating),
            ]),
            h('td.sheet', player.points.map(s => {
                const score = Array.isArray(s) ? s[0] : s;
                return h(scoreTagNames[(s[1] || 1) - 1] + ((this.system > 0) ? (score > 1) ? '.win': (score > 0) ? '.draw' : '.lose' : ''), [score]);
            })),
            h('td.total', [
                h('fire', [(player.fire === 2) ? h('i', {class: {"icon": true, "icon-fire": true} }) : '']),
                h('strong.score', player.score),
                h('span.perf', player.perf)
            ]),
        ]);
    }

    private onClickPlayer(player) {
        this.doSend({ type: "get_games", tournamentId: this.model["tournamentId"], player: player.name });
        if (this.playerGamesOn) {
            (document.getElementById('top-game') as HTMLElement).style.display = 'none';
            (document.getElementById('player') as HTMLElement).style.display = 'block';
            this.playerGamesOn = false;
        } else if (this.visitedPlayer === player.name) {
            (document.getElementById('top-game') as HTMLElement).style.display = 'block';
            (document.getElementById('player') as HTMLElement).style.display = 'none';
            this.playerGamesOn = true;
        }
        this.visitedPlayer = player.name;
    }

    renderGames(games) {
        const rows = games.reverse().map((game, index) => this.gameView(game, games.length - index));
        return rows;
    }

    result(result, color) {
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
        }
        const klass = (value === '1') ? '.win' : (value === '0') ? '.lose' : '';
        return h(`td.result${klass}`, value);
    }

    private gameView(game, index) {
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

    private tSystem(system) {
        switch (parseInt(system)) {
        case 0:
            return "Arena";
        case 1:
            return "Round-Robin";
        default:
            return "Swiss";
        }
    }

    renderStats(msg) {
        const gamesLen = msg.games.length;
        const avgOp = gamesLen
            ? Math.round(
                msg.games.reduce(function (a, b) {
                    return a + b.rating;
                }, 0) / gamesLen
            )
            : 0;
        const winRate = ((msg.nbGames !== 0) ? Math.round(100 * (msg.nbWin / msg.nbGames)) : 0) + '%';
        return [
            h('a.close', { attrs: { 'data-icon': 'j' } }),
            h('h2', [
                h('rank', msg.rank + '. '),
                h('a.user-link', { attrs: { href: '/@/' + msg.name } }, [h('player-title', " " + msg.title + " "), msg.name]),
            ]),
            h('table.stats', [
                h('tr', [h('th', _('Performance')), h('td', msg.perf)]),
                h('tr', [h('th', _('Games played')), h('td', msg.games.length)]),
                h('tr', [h('th', _('Win rate')), h('td', winRate)]),
                h('tr', [h('th', _('Average opponent')), h('td', avgOp)]),
            ]),
        ];
    }

    renderTopGame(game) {
        const variant = VARIANTS[game.variant];
        return h(`selection#mainboard.${variant.board}.${variant.piece}`, {
            on: { click: () => window.location.assign('/' + game.gameId) }
        }, h('div', [
            h('div.name', [h('rank', '#' + game.br), game.b]),
            h(`div.cg-wrap.${variant.cg}`, {
                hook: {
                    insert: vnode => {
                        const cg = Chessground(vnode.elm as HTMLElement, {
                            fen: game.fen,
                            lastMove: game.lastMove,
                            geometry: variant.geometry,
                            coordinates: false,
                            viewOnly: true
                        });
                        this.topGameChessground = cg;
                        this.topGameId = game.gameId;
                    }
                }
            }),
            h('div.name', [h('rank', '#' + game.wr), game.w]),
        ]));
    }

    private onMsgGetGames(msg) {
        const oldStats = document.getElementById('stats') as Element;
        oldStats.innerHTML = "";
        patch(oldStats, h('div#stats.box', [h('tbody', this.renderStats(msg))]));

        const oldGames = document.getElementById('games') as Element;
        oldGames.innerHTML = "";
        patch(oldGames, h('table#games.pairings.box', [h('tbody', this.renderGames(msg.games))]));
    }

    private onMsgGetPlayers(msg) {
        this.players = msg.players;
        this.page = msg.page;
        this.nbPlayers = msg.nbPlayers;
        this.buttons = patch(this.buttons, this.renderButtons());

        const oldPlayers = document.getElementById('players') as Element;
        oldPlayers.innerHTML = "";
        patch(oldPlayers, h('table#players.players.box', [h('tbody', this.renderPlayers(msg.players))]));
    }

    private onMsgNewGame(msg) {
        window.location.assign('/' + msg.gameId);
    }

    private onMsgGameUpdate() {
        this.doSend({ type: "get_players", tournamentId: this.model["tournamentId"], page: this.page });
    }

    private onMsgUserConnected(msg) {
        this.system = msg.tsystem;
        const tsystem = document.getElementById('tsystem') as Element;
        patch(tsystem, h('div#tsystem', gameType(this.model["rated"]) + " • " + this.tSystem(this.system)));
        
        this.model.username = msg.username;
        this.tournamentStatus = T_STATUS[msg.tstatus];
        this.userStatus = msg.ustatus;
        this.userRating = msg.urating;
        this.secondsToStart = msg.secondsToStart;
        this.secondsToFinish = msg.secondsToFinish;
        this.updateActionButton()
        initializeClock(this);
    }

    private onMsgSpectators = (msg) => {
        const container = document.getElementById('spectators') as HTMLElement;
        patch(container, h('under-chat#spectators', _('Spectators: ') + msg.spectators));
    }

    private onMsgUserStatus(msg) {
        this.userStatus = msg.ustatus;
        this.updateActionButton()
    }

    private onMsgTournamentStatus(msg) {
        const oldStatus = this.tournamentStatus;
        this.tournamentStatus = T_STATUS[msg.tstatus];
        if (oldStatus !== this.tournamentStatus) {
            if (msg.secondsToFinish !== undefined) {
                this.secondsToFinish = msg.secondsToFinish;
            }
            initializeClock(this);
        }
        this.updateActionButton()
        if ('finished|archived'.includes(this.tournamentStatus)) {
            this.doSend({ type: "get_players", "tournamentId": this.model["tournamentId"], page: this.page });
        }
    }

    private onMsgTopGame(msg) {
        this.topGame = patch(this.topGame, h('div#top-game'));
        this.topGame = patch(this.topGame, h('div#top-game', this.renderTopGame(msg)));
    }

    private onMsgBoard = (msg) => {
        if (this.topGameChessground === undefined || this.topGameId !== msg.gameId) {
            return;
        };

        let lastMove = msg.lastMove;
        if (lastMove !== null) {
            lastMove = uci2cg(lastMove);
            // drop lastMove causing scrollbar flicker,
            // so we remove from part to avoid that
            lastMove = lastMove.includes('@') ? [lastMove.slice(-2)] : [lastMove.slice(0, 2), lastMove.slice(2, 4)];
        }
        this.topGameChessground.set({
            fen: msg.fen,
            check: msg.check,
            lastMove: lastMove,
        });
    }

    private checkStatus = (msg) => {
        // TODO
        console.log(msg);
    }

    private onMsgChat(msg) {
        chatMessage(msg.user, msg.message, "lobbychat");
        if (msg.user.length !== 0 && msg.user !== '_server')
            sound.socialNotify();
    }
    private onMsgFullChat(msg) {
        // To prevent multiplication of messages we have to remove old messages div first
        patch(document.getElementById('messages') as HTMLElement, h('div#messages-clear'));
        // then create a new one
        patch(document.getElementById('messages-clear') as HTMLElement, h('div#messages'));
        msg.lines.forEach(line => chatMessage(line.user, line.message, "lobbychat"));
    }

    private onMsgPing(msg) {
        this.doSend({ type: "pong", timestamp: msg.timestamp });
    }
    private onMsgError(msg) {
        alert(msg.message);
    }

    onMessage(evt) {
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

function runTournament(vnode: VNode, model) {
    const el = vnode.elm as HTMLElement;
    new TournamentController(el, model);
}

export function tournamentView(model): VNode[] {
    const variant = VARIANTS[model.variant];
    const chess960 = model.chess960 === 'True';
    const dataIcon = variant.icon(chess960);
    const serverDate = new Date(model["date"]);

    return [
        h('aside.sidebar-first', [
            h('div.game-info', [
                h('div.info0.icon', { attrs: { "data-icon": dataIcon } }, [
                    h('div.info2', [
                        h('div.tc', [
                            timeControlStr(model["base"], model["inc"], model["byo"]) + " • ",
                            h('a.user-link', {
                                attrs: {
                                    target: '_blank',
                                    href: '/variant/' + model["variant"] + (chess960 ? '960': ''),
                                }
                            },
                                variant.displayName(chess960)),
                        ]),
                        h('div#tsystem'),
                    ]),
                ]),
                // TODO: update in onMsgUserConnected()
                h('div#requirements'),
                h('info-date', serverDate.toLocaleString("default", localeOptions)),
            ]),
            h('div#lobbychat')
        ]),
        h('div.players', [
                h('div.tour-header.box', [
                    h('i', {class: {"icon": true, "icon-trophy": true} }),
                    h('h1', model["title"]),
                    h('div#clockdiv'),
                ]),
                h('div#page-controls'),
                h('table#players.box', { hook: { insert: vnode => runTournament(vnode, model) } }),
        ]),
        h('div.tour-table', [
            h('div#top-game'),
            h('div#player', [
                    h('div#stats.box'),
                    h('table#games.box'),
            ]),
        ]),
        h('under-chat#spectators'),
    ];
}
