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

import { JSONObject } from './types';
import { _ } from './i18n';
import { chatMessage, chatView } from './chat';
import { sound } from './sound';
import { VARIANTS } from './chess';
import { timeControlStr } from "./view";
import { gameType } from './profile';


const localeOptions: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
};

const scoreTagNames = ['score', 'streak', 'double'];

function scoreTag(s) {
  return h(scoreTagNames[(s[1] || 1) - 1], [Array.isArray(s) ? s[0] : s]);
}

export default class TournamentController {
    model;
    sock;
    _ws;
    buttons;
    players;
    nbPlayers;
    page;
    fc;
    sc;

    constructor(el, model) {
        console.log("TournamentController constructor", el, model);
        this.model = model;
        this.nbPlayers = 0;
        this.page = 1;

        const onOpen = (evt) => {
            this._ws = evt.target;
            console.log('onOpen()');
            this.doSend({ type: "tournament_user_connected", username: this.model["username"], "tournamentId": this.model["tournamentId"]});
            this.doSend({ type: "get_players", "tournamentId": this.model["tournamentId"], "page": this.page });
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
    }

    doSend(message: JSONObject) {
        console.log("---> tournament doSend():", message);
        this.sock.send(JSON.stringify(message));
    }

    join() {
        this.doSend({ type: "join", "tournamentId": this.model["tournamentId"] });
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

    renderButtons() {
        return h('div#page-controls.btn-controls', [
            h('div.pager', [
                h('button', { on: { click: () => this.goToPage(1) } }, [ h('i.icon.icon-fast-backward') ]),
                h('button', { on: { click: () => this.goToPage(this.page - 1) } }, [ h('i.icon.icon-step-backward') ]),
                h('span.page', `${(this.page-1)*10 + 1} - ${Math.min((this.page)*10, this.nbPlayers)} / ${this.nbPlayers}`),
                h('button', { on: { click: () => this.goToPage(this.page + 1) } }, [ h('i.icon.icon-step-forward') ]),
                h('button', { on: { click: () => this.goToPage(10000) } }, [ h('i.icon.icon-fast-forward') ]),
            ]),
            h('button#join', { on: { click: () => this.join() }, class: {"icon": true, "icon-play": true} }, _('JOIN')), // TODO: _('SIGN IN') _('WITHDRAW') _('PAUSE')
        ]);
    }

    renderPlayers(players) {
        const rows = players.map((player,index) => this.playerView(player, (this.page - 1) * 10 + index + 1));
        return rows;
    }

    private playerView(player, index) {
        return h('tr', { on: { click: () => this.onClickPlayer(player, index) } }, [
            h('td.rank', [(player.paused) ? h('i', {class: {"icon": true, "icon-pause": true} }) : index]),
            h('td.player', [
                h('span.title', player.title),
                h('span.name', player.name),
                h('span', player.rating),
            ]),
            h('td.sheet', player.points.map(scoreTag)),
            h('td.total', [
                h('fire', [(player.fire === 2) ? h('i', {class: {"icon": true, "icon-fire": true} }) : '']),
                h('strong.score', player.score),
                h('span.perf', player.perf)
            ]),
        ]);
    }

    private onClickPlayer(player, index) {
        this.doSend({ type: "get_games", tournamentId: this.model["tournamentId"], player: player.name, rank: index });
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
        const klass = (value === '1') ? '.win' : (value === '0') ? '.loss' : '';
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
                h('a.user-link', { attrs: { href: '/@/' + msg.name } }, [h('player-title', " " + msg.title), msg.name]),
            ]),
            h('table.stats', [
                h('tr', [h('th', _('Performance')), h('td', msg.perf)]),
                h('tr', [h('th', _('Games played')), h('td', msg.games.length)]),
                h('tr', [h('th', _('Win rate')), h('td', winRate)]),
                h('tr', [h('th', _('Average opponent')), h('td', avgOp)]),
            ]),
        ];
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
        console.log("!!!! got get_players msg:", msg);
        this.buttons = patch(this.buttons, this.renderButtons());

        const oldPlayers = document.getElementById('players') as Element;
        oldPlayers.innerHTML = "";
        patch(oldPlayers, h('table#players.players.box', [h('tbody', this.renderPlayers(msg.players))]));
    }

    private onMsgNewGame(msg) {
        window.location.assign('/' + msg.gameId);
    }

    private onMsgGameUpdate() {
        this.doSend({ type: "get_players", "tournamentId": this.model["tournamentId"], "page": this.page });
    }

    private onMsgUserConnected(msg) {
        this.model.username = msg.username;
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
        // console.log("NEW FULL MESSAGES");
        msg.lines.forEach(line => chatMessage(line.user, line.message, "lobbychat"));
    }

    private onMsgPing(msg) {
        this.doSend({ type: "pong", timestamp: msg.timestamp });
    }
    private onMsgError(msg) {
        alert(msg.message);
    }

    onMessage(evt) {
        // console.log("<+++ tournament onMessage():", evt.data);
        const msg = JSON.parse(evt.data);
        switch (msg.type) {
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
            case "tournament_user_connected":
                this.onMsgUserConnected(msg);
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
                        gameType(model["rated"]) + " • " + 'Arena'
                    ]),
                ]),
                h('info-date', serverDate.toLocaleString("default", localeOptions)),
            ]),
            h('div#lobbychat')
        ]),
        h('div.players', [
                h('div.tour-header.box', [
                    h('i', {class: {"icon": true, "icon-trophy": true} }),
                    h('h1', model["title"]),
                    // TODO: 
                    h('clock', serverDate.toLocaleString("default", localeOptions))
                ]),
                h('div#page-controls'),
                h('table#players.box', { hook: { insert: vnode => runTournament(vnode, model) } }),
        ]),
        h('div.player', [
                h('div#stats.box'),
                h('table#games.box'),
        ]),
    ];
}
