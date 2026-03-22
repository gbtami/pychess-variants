import { h, VNode } from 'snabbdom';

import { _ } from './i18n';
import { patch } from './document';
import { chatView, chatMessage, ChatController } from './chat';
import { JSONObject, PyChessModel } from './types';
import { newWebsocket } from '@/socket/webSocketUtils';
import { displayUsername, userLink } from './user';
import { timeControlStr } from './view';
import { initializeClock } from './tournamentClock';
import { roundRobinFaq } from './tournamentFaq';
import {
    MsgError,
    MsgGetGames,
    MsgGetPlayers,
    MsgPing,
    MsgRRArrangements,
    MsgTournamentStatus,
    MsgUserConnectedTournament,
    MsgUserStatus,
    RRArrangementCell,
    TournamentGame,
    TournamentPlayer,
} from './tournamentType';
import { VARIANTS } from './variants';

const T_STATUS = {
    0: "created",
    1: "started",
    2: "aborted",
    3: "finished",
    4: "archived",
}

export class TournamentRRController implements ChatController {
    sock;
    tournamentId: string;
    username: string;
    anon: boolean;
    system = 1;
    variant = VARIANTS['chess'];
    chess960 = false;
    rated = '';
    tournamentStatus = 'created';
    userStatus = 'spectator';
    rounds = 0;
    startDate = '';
    secondsToStart = 0;
    secondsToFinish = 0;
    roundOngoingGames = 0;
    secondsToNextRound = 0;
    manualNextRoundPending = false;
    clockInterval: ReturnType<typeof setInterval> | null = null;
    players: TournamentPlayer[] = [];
    rrPlayers: string[] = [];
    matrix: Record<string, Record<string, RRArrangementCell>> = {};
    completedGames = 0;
    totalGames = 0;
    page = 1;
    selectedPlayer = '';
    selectedGames: TournamentGame[] = [];
    clockdiv: VNode;
    action: VNode;

    constructor(_el: HTMLElement, model: PyChessModel) {
        this.tournamentId = model.tournamentId;
        this.username = model.username;
        this.anon = model.anon === 'True';
        this.variant = VARIANTS[model.variant];
        this.chess960 = model.chess960 === 'True';
        this.rated = model.rated;
        this.rounds = model.rounds || 0;
        this.startDate = model.date;
        this.tournamentStatus = T_STATUS[model.status as keyof typeof T_STATUS];

        this.sock = newWebsocket('wst');
        this.sock.onopen = () => {
            this.doSend({ type: 'tournament_user_connected', tournamentId: this.tournamentId, username: this.username });
            this.doSend({ type: 'get_players', tournamentId: this.tournamentId, page: this.page });
            this.doSend({ type: 'get_rr_arrangements', tournamentId: this.tournamentId });
        };
        this.sock.onmessage = (e: MessageEvent) => this.onMessage(e);

        patch(document.getElementById('lobbychat') as HTMLElement, chatView(this, 'lobbychat'));
        this.clockdiv = patch(document.getElementById('clockdiv') as HTMLElement, h('div#clockdiv'));
        this.action = patch(document.getElementById('action') as HTMLElement, h('div#action'));
        patch(document.querySelector('div.tour-faq') as HTMLElement, roundRobinFaq(this.rated));
    }

    doSend(message: JSONObject) {
        this.sock.send(JSON.stringify(message));
    }

    login() {
        window.location.assign('/login');
    }

    join() {
        this.doSend({ type: 'join', tournamentId: this.tournamentId });
    }

    withdraw() {
        this.doSend({ type: 'pause', tournamentId: this.tournamentId });
    }

    updateActionButton() {
        let button = h('div#action');
        if (this.anon && 'created|started'.includes(this.tournamentStatus)) {
            button = h('button#action', { on: { click: () => this.login() }, class: { icon: true, 'icon-play': true } }, _('LOG IN'));
        } else if (this.tournamentStatus === 'created') {
            if (this.userStatus === 'joined') {
                button = h('button#action', { on: { click: () => this.withdraw() }, class: { icon: true, 'icon-flag-o': true } }, _('WITHDRAW'));
            } else {
                button = h('button#action', { on: { click: () => this.join() }, class: { icon: true, 'icon-play': true } }, _('JOIN'));
            }
        } else if (this.tournamentStatus === 'started') {
            if ('spectator|paused|withdrawn'.includes(this.userStatus)) {
                button = h('button#action', { on: { click: () => this.join() }, class: { icon: true, 'icon-play': true } }, _('JOIN'));
            } else {
                button = h('button#action', { on: { click: () => this.withdraw() }, class: { icon: true, 'icon-flag-o': true } }, _('WITHDRAW'));
            }
        }
        this.action = patch(document.getElementById('action') as HTMLElement, button);
    }

    renderInfo(msg: MsgUserConnectedTournament) {
        this.startDate = msg.startsAt;
        patch(document.getElementById('description') as HTMLElement, h('div#description.description', msg.description));
        patch(document.getElementById('startsAt') as HTMLElement, h('div#startsAt', [
            h('strong', _('Starts')),
            ` ${msg.startsAt}`,
        ]));
        patch(document.getElementById('tsystem') as HTMLElement, h('div#tsystem', _('Round-Robin')));
        patch(document.getElementById('tminutes') as HTMLElement, h('span#tminutes', ` • ${msg.tminutes}m`));
        this.secondsToStart = msg.secondsToStart;
        this.secondsToFinish = msg.secondsToFinish;
        initializeClock(this as any);
        this.updateActionButton();
    }

    renderStandings() {
        const rows = this.players.map((player, index) =>
            h('tr', {
                class: { active: this.selectedPlayer === player.name },
                on: { click: () => this.selectPlayer(player.name) },
            }, [
                h('td.rank', `${index + 1}`),
                h('td.player', userLink(player.name, [h('player-title', ` ${player.title} `), displayUsername(player.name)])),
                h('td.total', `${player.score}`),
                h('td.berger', `${player.berger.toFixed(1)}`),
            ])
        );
        patch(document.getElementById('players') as HTMLElement, h('table#players.players', [
            h('thead', h('tr', [h('th', '#'), h('th', _('Player')), h('th', _('Pts')), h('th', _('SB'))])),
            h('tbody', rows),
        ]));
    }

    renderGames() {
        const rows = this.selectedGames.map((game) =>
            h('tr', {
                on: {
                    click: () => {
                        if (game.gameId) window.location.assign('/' + game.gameId);
                    },
                },
            }, [
                h('td', userLink(game.name, [displayUsername(game.name)])),
                h('td', game.color.toUpperCase()),
                h('td', game.result),
            ])
        );
        patch(document.getElementById('games') as HTMLElement, h('table#games.box.pairings', [
            h('thead', h('tr', [h('th', _('Opponent')), h('th', _('Color')), h('th', _('Result'))])),
            h('tbody', rows),
        ]));
    }

    selectPlayer(player: string) {
        this.selectedPlayer = player;
        this.renderStandings();
        this.doSend({ type: 'get_games', tournamentId: this.tournamentId, player });
    }

    cellDisplay(cell: RRArrangementCell): string {
        const anyCell = cell as any;
        if (anyCell.result) {
            if (anyCell.result === '1/2-1/2') return '½';
            const rowIsWhite = cell.color === 'white';
            if (anyCell.result === '1-0') return rowIsWhite ? '1' : '0';
            if (anyCell.result === '0-1') return rowIsWhite ? '0' : '1';
        }
        if (cell.status === 'started') return '...';
        if (cell.status === 'challenged') return cell.challenger === this.username ? '!' : '?';
        return '';
    }

    onCellClick(cell: RRArrangementCell) {
        if (!cell.id || this.tournamentStatus !== 'started') return;
        if (cell.gameId) {
            window.location.assign('/' + cell.gameId);
            return;
        }
        if (![cell.white, cell.black].includes(this.username)) return;
        if (cell.status === 'challenged' && cell.challenger !== this.username) {
            this.doSend({ type: 'rr_accept_challenge', tournamentId: this.tournamentId, arrangementId: cell.id });
            return;
        }
        if (cell.status === 'pending') {
            this.doSend({ type: 'rr_challenge', tournamentId: this.tournamentId, arrangementId: cell.id });
        }
    }

    renderCrossTable() {
        const order = this.rrPlayers.length > 0 ? this.rrPlayers : this.players.map((player) => player.name);
        const rows = order.map((rowPlayer, rowIndex) =>
            h('tr', [
                h('th', `${rowIndex + 1}`),
                h('th', userLink(rowPlayer, [displayUsername(rowPlayer)])),
                ...order.map((colPlayer) => {
                    if (rowPlayer === colPlayer) return h('td.rr-self', '•');
                    const cell = this.matrix[rowPlayer]?.[colPlayer];
                    return h('td.rr-cell', {
                        class: {
                            actionable: !!cell && [cell.white, cell.black].includes(this.username) && !cell.gameId,
                        },
                        on: cell ? { click: () => this.onCellClick(cell) } : {},
                    }, cell ? this.cellDisplay(cell) : '');
                }),
            ])
        );

        patch(document.getElementById('rr-crosstable') as HTMLElement, h('table#rr-crosstable.box', [
            h('thead', h('tr', [
                h('th', '#'),
                h('th', _('Player')),
                ...order.map((_, index) => h('th', `${index + 1}`)),
            ])),
            h('tbody', rows),
        ]));
    }

    renderProgress() {
        patch(document.getElementById('summarybox') as HTMLElement, h('div#summarybox.box', [
            h('h2', _('Round-Robin')),
            h('div', `${this.completedGames} / ${this.totalGames} ${_('games completed')}`),
            h('div', `${this.rounds} ${_('rounds')}`),
        ]));
    }

    private onMsgUserConnected(msg: MsgUserConnectedTournament) {
        this.userStatus = msg.ustatus;
        this.rounds = msg.rounds || this.rounds;
        this.tournamentStatus = T_STATUS[msg.tstatus as keyof typeof T_STATUS];
        this.roundOngoingGames = msg.roundOngoingGames || 0;
        this.renderInfo(msg);
    }

    private onMsgTournamentStatus(msg: MsgTournamentStatus) {
        this.tournamentStatus = T_STATUS[msg.tstatus as keyof typeof T_STATUS];
        this.rounds = msg.rounds || this.rounds;
        this.secondsToFinish = msg.secondsToFinish;
        this.roundOngoingGames = msg.roundOngoingGames || 0;
        initializeClock(this as any);
        this.updateActionButton();
    }

    private onMsgGetPlayers(msg: MsgGetPlayers) {
        this.players = msg.players;
        if (!this.selectedPlayer && this.players.length > 0) {
            this.selectedPlayer = this.players[0].name;
            this.doSend({ type: 'get_games', tournamentId: this.tournamentId, player: this.selectedPlayer });
        }
        this.renderStandings();
    }

    private onMsgGetGames(msg: MsgGetGames) {
        this.selectedPlayer = msg.name;
        this.selectedGames = msg.games;
        this.renderGames();
    }

    private onMsgRRArrangements(msg: MsgRRArrangements) {
        this.rrPlayers = msg.players;
        this.matrix = msg.matrix;
        this.completedGames = msg.completedGames;
        this.totalGames = msg.totalGames;
        this.renderProgress();
        this.renderCrossTable();
    }

    private onMsgUserStatus(msg: MsgUserStatus) {
        this.userStatus = msg.ustatus;
        this.updateActionButton();
    }

    private onMsgNewGame(msg: any) {
        window.location.assign('/' + msg.gameId);
    }

    private onMsgError(msg: MsgError) {
        alert(msg.message);
    }

    private onMsgPing(msg: MsgPing) {
        this.doSend({ type: 'pong', timestamp: msg.timestamp });
    }

    onMsgChat(msg: any) {
        chatMessage(msg.user, msg.message, 'lobbychat');
    }

    onMsgFullChat(msg: any) {
        msg.lines.forEach((line: any) => chatMessage(line.user, line.message, 'lobbychat'));
    }

    onMessage(evt: MessageEvent) {
        const msg = JSON.parse(evt.data);
        switch (msg.type) {
        case 'tournament_user_connected':
            this.onMsgUserConnected(msg);
            break;
        case 'tstatus':
            this.onMsgTournamentStatus(msg);
            break;
        case 'get_players':
            this.onMsgGetPlayers(msg);
            break;
        case 'get_games':
            this.onMsgGetGames(msg);
            break;
        case 'rr_arrangements':
            this.onMsgRRArrangements(msg);
            break;
        case 'ustatus':
            this.onMsgUserStatus(msg);
            break;
        case 'new_game':
            this.onMsgNewGame(msg);
            break;
        case 'lobbychat':
            this.onMsgChat(msg);
            break;
        case 'fullchat':
            this.onMsgFullChat(msg);
            break;
        case 'ping':
            this.onMsgPing(msg);
            break;
        case 'error':
            this.onMsgError(msg);
            break;
        }
    }
}

function runTournamentRR(vnode: VNode, model: PyChessModel) {
    new TournamentRRController(vnode.elm as HTMLElement, model);
}

export function tournamentRRView(model: PyChessModel): VNode[] {
    const variant = VARIANTS[model.variant];
    const chess960 = model.chess960 === 'True';
    const dataIcon = variant.icon(chess960);
    const canEdit = model.username === model.tournamentcreator && model.status === 0;

    return [
        h('aside.sidebar-first', [
            h('div.game-info', [
                h('div.info0.icon', { attrs: { 'data-icon': dataIcon } }, [
                    h('div.info2', [
                        h('div.tc', [
                            timeControlStr(model.base, model.inc, model.byo) + ' • ',
                            variant.displayName(chess960),
                            h('span#tminutes'),
                        ]),
                        h('div#tsystem'),
                        canEdit ? h('a.icon-cog.edit-tournament', {
                            attrs: {
                                href: `/tournaments/${model.tournamentId}/edit`,
                                title: _('Edit tournament'),
                            },
                        }) : null,
                    ]),
                ]),
                h('div#description'),
                h('div#startsAt'),
            ]),
            h('div#lobbychat'),
        ]),
        h(`div.players.${model.variant}`, [
            h('div.box', [
                h('div.tour-header', [
                    h('h1', model.tournamentname),
                    h('div#clockdiv'),
                ]),
                h('div#page-controls', [h('div#action')]),
                h('table#players', { hook: { insert: (vnode) => runTournamentRR(vnode, model) } }),
                h('div.tour-faq'),
            ]),
        ]),
        h('div.tour-table', [
            h('div#summarybox'),
            h('div#player', [
                h('div#stats.box', [h('div#rr-crosstable')]),
                h('table#games.box'),
            ]),
        ]),
        h('under-chat#spectators'),
    ];
}
