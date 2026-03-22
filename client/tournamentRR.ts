import { h, VNode } from 'snabbdom';

import { _ } from './i18n';
import { patch } from './document';
import { chatView, chatMessage, ChatController } from './chat';
import { timeago } from './datetime';
import { JSONObject, PyChessModel } from './types';
import { newWebsocket } from '@/socket/webSocketUtils';
import { displayUsername, userLink } from './user';
import { timeControlStr } from './view';
import { initializeClock, localeOptions } from './tournamentClock';
import { roundRobinFaq } from './tournamentFaq';
import {
    MsgError,
    MsgGetGames,
    MsgGetPlayers,
    MsgPing,
    MsgRRArrangements,
    MsgRRManagement,
    MsgRRSettings,
    MsgTournamentStatus,
    TournamentManagePlayer,
    MsgUserConnectedTournament,
    MsgUserStatus,
    RRArrangementCell,
    TournamentGame,
    TournamentPlayer,
} from './tournamentType';
import { VARIANTS } from './variants';

const T_STATUS = {
    0: 'created',
    1: 'started',
    2: 'aborted',
    3: 'finished',
    4: 'archived',
} as const;

type RRViewMode = 'overview' | 'challenges' | 'manage';
type RRChallengeRow = {
    id: string;
    opponent: string;
    round: number;
    color: string;
    status: string;
    label: string;
    actionable: boolean;
    incoming: boolean;
    gameId: string;
};

type RRGameListRow = {
    id: string;
    white: string;
    black: string;
    status: string;
    gameId: string;
    date: string;
};

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
    createdBy = '';
    approvalRequired = false;
    joiningClosed = false;
    pendingPlayers: TournamentManagePlayer[] = [];
    deniedPlayers: TournamentManagePlayer[] = [];
    page = 1;
    selectedPlayer = '';
    selectedGames: TournamentGame[] = [];
    viewMode: RRViewMode = 'overview';
    selectedArrangementId = '';
    hoveredRow = '';
    hoveredCol = '';
    kickUsername = '';
    clockdiv: VNode;
    action: VNode;
    descriptionNode: VNode;
    startsAtNode: VNode;
    systemNode: VNode;
    creatorNode: VNode;
    minutesNode: VNode;
    manageNode: VNode;
    summaryNode: VNode;
    bodyNode: VNode;
    modalNode: VNode;
    crossTableNode: VNode | null = null;
    gamesNode: VNode | null = null;
    boundHashChange: () => void;

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
        this.selectedArrangementId = decodeURIComponent(window.location.hash.replace(/^#/, ''));
        this.boundHashChange = () => this.syncArrangementFromHash();

        this.sock = newWebsocket('wst');
        this.sock.onopen = () => {
            this.doSend({ type: 'tournament_user_connected', tournamentId: this.tournamentId, username: this.username });
            this.doSend({ type: 'get_players', tournamentId: this.tournamentId, page: this.page });
        };
        this.sock.onmessage = (e: MessageEvent) => this.onMessage(e);

        patch(document.getElementById('lobbychat') as HTMLElement, chatView(this, 'lobbychat'));
        this.descriptionNode = patch(document.getElementById('description') as HTMLElement, h('div#description.description'));
        this.startsAtNode = patch(document.getElementById('startsAt') as HTMLElement, h('div#startsAt'));
        this.systemNode = patch(document.getElementById('tsystem') as HTMLElement, h('div#tsystem'));
        this.creatorNode = patch(document.getElementById('createdBy') as HTMLElement, h('div#createdBy'));
        this.minutesNode = patch(document.getElementById('tminutes') as HTMLElement, h('span#tminutes'));
        this.manageNode = patch(document.getElementById('rr-manage') as HTMLElement, h('div#rr-manage'));
        this.clockdiv = patch(document.getElementById('clockdiv') as HTMLElement, h('div#clockdiv'));
        this.action = patch(document.getElementById('action') as HTMLElement, h('div#action'));
        this.summaryNode = patch(document.getElementById('summarybox') as HTMLElement, h('div#summarybox'));
        this.bodyNode = patch(document.getElementById('rr-body') as HTMLElement, h('div#rr-body'));
        this.modalNode = patch(document.getElementById('rr-modal') as HTMLElement, h('div#rr-modal'));
        patch(document.querySelector('div.tour-faq') as HTMLElement, roundRobinFaq(this.rated));
        window.addEventListener('hashchange', this.boundHashChange);
    }

    doSend(message: JSONObject) {
        this.sock.send(JSON.stringify(message));
    }

    isHost() {
        return this.username === this.createdBy;
    }

    playerByName(name: string) {
        return this.players.find((player) => player.name === name);
    }

    login() {
        window.location.assign('/login');
    }

    join() {
        this.doSend({ type: 'join', tournamentId: this.tournamentId });
    }

    withdraw() {
        this.doSend({ type: 'withdraw', tournamentId: this.tournamentId });
    }

    setViewMode(viewMode: RRViewMode) {
        this.viewMode = viewMode;
        this.updateActionButton();
        this.renderManageButton();
        this.renderBody();
    }

    setHovered(row: string, col: string) {
        if (this.hoveredRow === row && this.hoveredCol === col) return;
        this.hoveredRow = row;
        this.hoveredCol = col;
        this.renderCrossTable();
    }

    setHoveredRow(row: string) {
        if (this.hoveredRow === row && this.hoveredCol === '') return;
        this.hoveredRow = row;
        this.hoveredCol = '';
        this.renderCrossTable();
    }

    setHoveredCol(col: string) {
        if (this.hoveredRow === '' && this.hoveredCol === col) return;
        this.hoveredRow = '';
        this.hoveredCol = col;
        this.renderCrossTable();
    }

    clearHovered() {
        if (!this.hoveredRow && !this.hoveredCol) return;
        this.hoveredRow = '';
        this.hoveredCol = '';
        this.renderCrossTable();
    }

    selectedArrangement(): RRArrangementCell | undefined {
        for (const row of Object.values(this.matrix)) {
            for (const cell of Object.values(row)) {
                if (cell.id === this.selectedArrangementId) return cell;
            }
        }
        return undefined;
    }

    syncArrangementFromHash() {
        const arrangementId = decodeURIComponent(window.location.hash.replace(/^#/, ''));
        if (this.selectedArrangementId === arrangementId) return;
        this.selectedArrangementId = arrangementId;
        this.renderModal();
        this.renderCrossTable();
    }

    selectArrangement(cell: RRArrangementCell) {
        this.selectedArrangementId = cell.id;
        window.history.replaceState(null, '', `#${encodeURIComponent(cell.id)}`);
        this.renderModal();
        this.renderCrossTable();
    }

    closeArrangement() {
        if (this.selectedArrangementId === '') return;
        this.selectedArrangementId = '';
        const url = new URL(window.location.href);
        url.hash = '';
        window.history.replaceState(null, '', url.toString());
        this.renderModal();
        this.renderCrossTable();
    }

    updateActionButton() {
        let button = h('div#action');
        if (this.viewMode === 'manage') {
            button = h('button#action', {
                on: { click: () => this.setViewMode('overview') },
                class: { icon: true, 'icon-step-backward': true },
            }, _('Back'));
        } else if (this.anon && 'created|started'.includes(this.tournamentStatus)) {
            button = h('button#action', { on: { click: () => this.login() }, class: { icon: true, 'icon-play': true } }, _('LOG IN'));
        } else if (this.tournamentStatus === 'created') {
            if (this.userStatus === 'pending') {
                button = h('div#action.pending-note', _('JOIN REQUEST PENDING'));
            } else if (this.userStatus === 'denied') {
                button = h('div#action.pending-note', _('JOIN REQUEST DENIED'));
            } else if (this.userStatus === 'joined') {
                button = h('button#action', { on: { click: () => this.withdraw() }, class: { icon: true, 'icon-flag-o': true } }, _('WITHDRAW'));
            } else if (this.joiningClosed && !this.isHost()) {
                button = h('div#action.pending-note', _('JOINING CLOSED'));
            } else {
                button = h('button#action', { on: { click: () => this.join() }, class: { icon: true, 'icon-play': true } }, _('JOIN'));
            }
        } else if (this.tournamentStatus === 'started') {
            if ('spectator|paused|withdrawn|denied|pending'.includes(this.userStatus)) {
                button = h('button#action', { on: { click: () => this.join() }, class: { icon: true, 'icon-play': true } }, _('JOIN'));
            } else {
                button = h('button#action', { on: { click: () => this.withdraw() }, class: { icon: true, 'icon-flag-o': true } }, _('WITHDRAW'));
            }
        }
        this.action = patch(this.action, button);
    }

    renderInfo(msg: MsgUserConnectedTournament) {
        this.startDate = msg.startsAt;
        this.createdBy = msg.createdBy;
        this.approvalRequired = !!msg.rrRequiresApproval;
        this.joiningClosed = !!msg.rrJoiningClosed;
        this.descriptionNode = patch(this.descriptionNode, h('div#description.description', msg.description));
        const startsAtDate = new Date(msg.startsAt);
        const endsAtDate = new Date(startsAtDate.getTime() + msg.tminutes * 60 * 1000);
        this.startsAtNode = patch(this.startsAtNode, h('div#startsAt', `${startsAtDate.toLocaleString('default', localeOptions)} - ${endsAtDate.toLocaleString('default', localeOptions)}`));
        this.systemNode = patch(this.systemNode, h('div#tsystem', `${this.rated === 'True' ? _('Rated') : _('Unrated')} - ${_('Round-Robin')}`));
        this.creatorNode = patch(this.creatorNode, h('div#createdBy', [h('strong', _('By')), ' ', userLink(msg.createdBy, [displayUsername(msg.createdBy)])]));
        this.minutesNode = patch(this.minutesNode, h('span#tminutes', ` • ${msg.tminutes}m`));
        this.secondsToStart = msg.secondsToStart;
        this.secondsToFinish = msg.secondsToFinish;
        initializeClock(this as any);
        this.updateActionButton();
        this.renderManageButton();
        this.renderProgress();
        this.renderBody();
        this.renderModal();
    }

    gameListRows(): RRGameListRow[] {
        const rows: RRGameListRow[] = [];
        const seen = new Set<string>();
        const order = this.rrPlayers.length > 0 ? this.rrPlayers : this.players.map((player) => player.name);
        for (const player of order) {
            const row = this.matrix[player] || {};
            for (const cell of Object.values(row)) {
                if (!cell.id || seen.has(cell.id)) continue;
                seen.add(cell.id);
                if (cell.status === 'pending' && !cell.gameId) continue;
                rows.push({
                    id: cell.id,
                    white: cell.white,
                    black: cell.black,
                    status: cell.status,
                    gameId: cell.gameId,
                    date: cell.date,
                });
            }
        }
        return rows.sort((left, right) => {
            const leftTime = Date.parse(left.date);
            const rightTime = Date.parse(right.date);
            if (!Number.isNaN(leftTime) && !Number.isNaN(rightTime) && leftTime !== rightTime) {
                return rightTime - leftTime;
            }
            return left.id.localeCompare(right.id);
        });
    }

    gameListStatus(row: RRGameListRow): string {
        if (row.gameId && row.status === 'finished') return _('Finished');
        if (row.gameId || row.status === 'started') return _('Current game');
        if (row.status === 'challenged') return _('Challenge');
        return row.status;
    }

    gamesVNode() {
        const rows = this.gameListRows().map((row) => {
            const target = this.findArrangementById(row.id);
            const icon = row.gameId && row.status === 'finished' ? '●' : '◌';
            return h('tr', {
                class: {
                    actionable: !!target,
                    ongoing: !!row.gameId && row.status !== 'finished',
                    finished: row.status === 'finished',
                },
                on: {
                    click: () => {
                        if (row.gameId) {
                            window.location.assign('/' + row.gameId);
                        } else if (target) {
                            this.selectArrangement(target);
                        }
                    },
                },
            }, [
                h('td.icon-col', icon),
                h('td.matchup', [
                    userLink(row.white, [displayUsername(row.white)]),
                    ' vs ',
                    userLink(row.black, [displayUsername(row.black)]),
                ]),
                h('td.status-col', this.gameListStatus(row)),
                h('td.time-col', row.date ? h('info-date', { attrs: { timestamp: row.date } }, timeago(row.date)) : ''),
            ]);
        });
        return h('table#games.box.pairings', [
            h('thead', h('tr', [h('th'), h('th', _('Games')), h('th', _('Status')), h('th', _('When'))])),
            h('tbody', rows),
        ]);
    }

    renderGames() {
        this.renderBody();
    }

    selectPlayer(player: string) {
        this.selectedPlayer = player;
        this.renderCrossTable();
        this.doSend({ type: 'get_games', tournamentId: this.tournamentId, player });
    }

    cellDisplay(cell: RRArrangementCell): string {
        const anyCell = cell as RRArrangementCell & { result?: string };
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

    arrangementAction(cell: RRArrangementCell) {
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

    challengeRows(): RRChallengeRow[] {
        const rows: RRChallengeRow[] = [];
        const seen = new Set<string>();
        const order = this.rrPlayers.length > 0 ? this.rrPlayers : this.players.map((player) => player.name);
        for (const player of order) {
            const row = this.matrix[player] || {};
            for (const cell of Object.values(row)) {
                if (!cell.id || seen.has(cell.id)) continue;
                seen.add(cell.id);
                const canAct = [cell.white, cell.black].includes(this.username);
                const isVisible = ['challenged', 'started'].includes(cell.status) || cell.gameId !== '';
                if (!isVisible && !(canAct && cell.status === 'pending')) continue;
                const opponent = canAct
                    ? (cell.white === this.username ? cell.black : cell.white)
                    : `${cell.white} vs ${cell.black}`;
                const incoming = canAct && cell.status === 'challenged' && cell.challenger !== this.username;
                const color = canAct ? (cell.white === this.username ? 'white' : 'black') : ' ';
                let label = _('Waiting');
                if (cell.gameId) label = _('Open game');
                else if (cell.status === 'pending') label = _('Create challenge');
                else if (incoming) label = _('Accept challenge');
                else if (cell.status === 'challenged') label = _('Awaiting response');
                else if (cell.status === 'started') label = _('Game in progress');
                rows.push({
                    id: cell.id,
                    opponent,
                    round: cell.round,
                    color,
                    status: cell.status,
                    label,
                    actionable: cell.gameId !== '' || (canAct && (cell.status === 'pending' || incoming)),
                    incoming,
                    gameId: cell.gameId,
                });
            }
        }
        return rows.sort((left, right) => {
            if (left.incoming !== right.incoming) return left.incoming ? -1 : 1;
            return left.round - right.round;
        });
    }

    renderCrossTable() {
        const order = this.rrPlayers.length > 0 ? this.rrPlayers : this.players.map((player) => player.name);
        const rowHoverHandlers = (rowPlayer: string) => ({
            mouseenter: () => this.setHoveredRow(rowPlayer),
            mouseleave: () => this.clearHovered(),
        });
        const colHoverHandlers = (colPlayer: string) => ({
            mouseenter: () => this.setHoveredCol(colPlayer),
            mouseleave: () => this.clearHovered(),
        });
        const cellHoverHandlers = (rowPlayer: string, colPlayer: string) => ({
            mouseenter: () => this.setHovered(rowPlayer, colPlayer),
            mouseleave: () => this.clearHovered(),
        });
        const rows = order.map((rowPlayer, rowIndex) => {
            const rowPlayerData = this.playerByName(rowPlayer);
            return h('tr', {
                class: {
                    hovered: this.hoveredRow === rowPlayer,
                    'selected-player': this.selectedPlayer === rowPlayer,
                    selectable: true,
                    withdrawn: !!rowPlayerData?.withdrawn,
                },
                on: {
                    click: () => this.selectPlayer(rowPlayer),
                    ...rowHoverHandlers(rowPlayer),
                },
            }, [
                h('th', { on: rowHoverHandlers(rowPlayer) }, `${rowIndex + 1}`),
                h('th', { on: rowHoverHandlers(rowPlayer) }, userLink(rowPlayer, [
                    rowPlayerData?.withdrawn ? h('span.rr-player-state', '• ') : '',
                    displayUsername(rowPlayer),
                ])),
            ]);
        });

        const arrangementRows = order.map((rowPlayer) =>
            h('tr', {
                class: {
                    hovered: this.hoveredRow === rowPlayer,
                    withdrawn: !!this.playerByName(rowPlayer)?.withdrawn,
                },
                on: rowHoverHandlers(rowPlayer),
            }, order.map((colPlayer) => {
                const cell = this.matrix[rowPlayer]?.[colPlayer];
                if (rowPlayer === colPlayer) return h('td.rr-cell.rr-self', {
                    class: {
                        hovered: this.hoveredRow === rowPlayer || this.hoveredCol === colPlayer,
                    },
                    on: cellHoverHandlers(rowPlayer, colPlayer),
                });
                const isMe = !!cell && [cell.white, cell.black].includes(this.username);
                const display = cell ? this.cellDisplay(cell) : '';
                const isSelected = this.selectedArrangementId !== '' && cell?.id === this.selectedArrangementId;
                return h('td.rr-cell', {
                    attrs: {
                        title: cell ? `${rowPlayer} vs ${colPlayer}` : '',
                    },
                    class: {
                        actionable: !!cell && isMe,
                        hovered: this.hoveredRow === rowPlayer || this.hoveredCol === colPlayer,
                        selected: isSelected,
                        pending: cell?.status === 'pending',
                        challenged: cell?.status === 'challenged',
                        incoming: cell?.status === 'challenged' && cell?.challenger !== this.username,
                        outgoing: cell?.status === 'challenged' && cell?.challenger === this.username,
                        started: cell?.status === 'started',
                        draw: display === '½',
                        win: display === '1',
                        loss: display === '0',
                        empty: !cell,
                    },
                    on: cell ? {
                        click: () => this.selectArrangement(cell),
                        ...cellHoverHandlers(rowPlayer, colPlayer),
                    } : cellHoverHandlers(rowPlayer, colPlayer),
                }, display !== '' ? h('div', display) : '');
            })),
        );

        const scoreRows = order.map((playerName) => {
            const player = this.playerByName(playerName);
            const maxScore = Math.max(0, ...this.players.map((entry) => entry.score));
            return h('tr', {
                class: {
                    hovered: this.hoveredRow === playerName,
                    'selected-player': this.selectedPlayer === playerName,
                    withdrawn: !!player?.withdrawn,
                },
                on: rowHoverHandlers(playerName),
            }, [
                h('td', {
                    class: {
                        me: playerName === this.username,
                        winner: !!player && player.score === maxScore && maxScore > 0,
                    },
                    on: rowHoverHandlers(playerName),
                }, `${player?.score ?? 0}`),
                h('td', { on: rowHoverHandlers(playerName) }, `${player?.berger.toFixed(1) ?? '0.0'}`),
            ]);
        });

        if (this.crossTableNode === null) return;
        this.crossTableNode = patch(this.crossTableNode, h('div#rr-crosstable.box.r-table-wrap', [
            h('div.r-table-wrap-players', [
                h('table', [
                    h('thead', h('tr', [h('th', '#'), h('th', _('Player'))])),
                    h('tbody', rows),
                ]),
            ]),
            h('div.r-table-wrap-arrs', [
                h('table', [
                    h('thead', h('tr', order.map((playerName, index) => h('th', {
                        class: {
                            hovered: this.hoveredCol === playerName,
                            me: playerName === this.username,
                        },
                        on: colHoverHandlers(playerName),
                    }, `${index + 1}`)))),
                    h('tbody', arrangementRows),
                ]),
            ]),
            h('div.r-table-wrap-scores', [
                h('table', [
                    h('thead', h('tr', [h('th', 'Σ'), h('th', _('SB'))])),
                    h('tbody', scoreRows),
                ]),
            ]),
        ]));
    }

    renderProgress() {
        this.summaryNode = patch(this.summaryNode, h('div#summarybox.box', [
            h('h2', _('Round-Robin')),
            h('div', `${this.completedGames} / ${this.totalGames} ${_('games completed')}`),
            h('div', `${this.rounds} ${_('rounds')}`),
            this.approvalRequired ? h('div', _('Organizer approval enabled')) : null,
            this.joiningClosed ? h('div', _('Joining is currently closed')) : null,
        ]));
    }

    renderManageButton() {
        if (!this.isHost()) {
            this.manageNode = patch(this.manageNode, h('div#rr-manage'));
            return;
        }
        this.manageNode = patch(this.manageNode, h('div#rr-manage', [
            h(`button.button${this.viewMode === 'manage' ? '.active' : ''}`, {
                on: {
                    click: () => this.setViewMode(this.viewMode === 'manage' ? 'overview' : 'manage'),
                },
            }, _('Manage players')),
        ]));
    }

    viewNavVNode() {
        const nav = [
            ['overview', _('Games')],
            ['challenges', _('Challenges')],
        ] as Array<[RRViewMode, string]>;
        return h('div#rr-nav.box', nav.map(([mode, label]) =>
            h(`button.button${this.viewMode === mode ? '.active' : ''}`, {
                on: { click: () => this.setViewMode(mode) },
            }, label),
        ));
    }

    modalStatusText(cell: RRArrangementCell): string {
        const canAct = [cell.white, cell.black].includes(this.username);
        if (cell.gameId) return _('This pairing already has a tournament game.');
        if (cell.status === 'started') return _('The game is in progress.');
        if (cell.status === 'pending') return _('No challenge exists yet for this pairing.');
        if (cell.status === 'challenged' && cell.challenger === this.username) {
            return _('Your challenge is waiting for the opponent to accept.');
        }
        if (cell.status === 'challenged' && canAct) {
            return _('Your opponent has challenged you for this pairing.');
        }
        if (cell.status === 'challenged') return _('A challenge already exists for this pairing.');
        return _('This pairing is waiting for its next action.');
    }

    renderModal() {
        const cell = this.selectedArrangement();
        if (!cell) {
            this.modalNode = patch(this.modalNode, h('div#rr-modal'));
            return;
        }
        const meIsWhite = cell.white === this.username;
        const canAct = [cell.white, cell.black].includes(this.username);
        const opponent = meIsWhite ? cell.black : cell.white;
        const whitePlayer = this.playerByName(cell.white);
        const blackPlayer = this.playerByName(cell.black);
        let actionButton: VNode | null = null;
        let closeButtonLabel = _('Close');
        if (cell.gameId) {
            actionButton = h('button.button', { on: { click: () => this.arrangementAction(cell) } }, _('Open game'));
        } else if (canAct && cell.status === 'pending') {
            actionButton = h('button.button', { on: { click: () => this.arrangementAction(cell) } }, _('Create challenge'));
        } else if (canAct && cell.status === 'challenged' && cell.challenger !== this.username) {
            actionButton = h('button.button', { on: { click: () => this.arrangementAction(cell) } }, _('Accept challenge'));
        } else if (canAct && cell.status === 'challenged' && cell.challenger === this.username) {
            closeButtonLabel = _('OK');
        }
        const detailActions = [
            actionButton,
            h('button.button.button-empty', { on: { click: () => this.closeArrangement() } }, closeButtonLabel),
        ].filter((button): button is VNode => button !== null);
        this.modalNode = patch(this.modalNode, h('div#rr-modal.modal-overlay.modal-overlay-fullscreen', {
            style: { display: 'flex' },
            on: {
                click: (evt: Event) => {
                    if (evt.target === evt.currentTarget) this.closeArrangement();
                },
            },
        }, [
            h('div.rr-modal-content', [
                h('div.rr-modal-header', [
                    h('div', [
                        h('h2', _('Pairing')),
                        h('div.rr-modal-subtitle', `${_('Round')} ${cell.round}`),
                    ]),
                    h('button.close', { on: { click: () => this.closeArrangement() } }, 'x'),
                ]),
                h('div.rr-modal-players', [
                    h('div.rr-modal-player', [
                        h('div.rr-color-label', _('White')),
                        userLink(cell.white, [
                            h('player-title', whitePlayer ? ` ${whitePlayer.title} ` : ''),
                            displayUsername(cell.white),
                        ]),
                    ]),
                    h('div.rr-modal-vs', _('vs')),
                    h('div.rr-modal-player', [
                        h('div.rr-color-label', _('Black')),
                        userLink(cell.black, [
                            h('player-title', blackPlayer ? ` ${blackPlayer.title} ` : ''),
                            displayUsername(cell.black),
                        ]),
                    ]),
                ]),
                h('div.rr-modal-grid', [
                    h('div.rr-modal-stat', [h('strong', _('Status')), h('span', cell.status)]),
                    canAct ? h('div.rr-modal-stat', [h('strong', _('Your color')), h('span', meIsWhite ? _('White') : _('Black'))]) : '',
                    canAct ? h('div.rr-modal-stat', [h('strong', _('Opponent')), h('span', opponent)]) : '',
                    cell.status === 'challenged' ? h('div.rr-modal-stat', [h('strong', _('Challenge by')), h('span', cell.challenger)]) : '',
                ]),
                h('div.rr-modal-note', this.modalStatusText(cell)),
                h('div.rr-detail-actions', detailActions),
            ]),
        ]));
    }

    challengesVNode() {
        const rows = this.challengeRows();
        return h('div#rr-challenges.box', [
            h('h2', _('Challenges')),
            rows.length === 0 ? h('div.rr-empty', _('No current challenges or active pairing actions.')) : h('table.players', [
                h('thead', h('tr', [
                    h('th', _('Opponent')),
                    h('th', _('Round')),
                    h('th', _('Color')),
                    h('th', _('Status')),
                    h('th', _('Action')),
                ])),
                h('tbody', rows.map((row) => {
                    const cell = this.selectedArrangementId === row.id ? this.selectedArrangement() : undefined;
                    const target = cell || this.findArrangementById(row.id);
                    return h('tr', {
                        class: { incoming: row.incoming },
                        on: target ? { click: () => this.selectArrangement(target) } : {},
                    }, [
                        h('td', userLink(row.opponent, [displayUsername(row.opponent)])),
                        h('td', `${row.round}`),
                        h('td', row.color.toUpperCase()),
                        h('td', row.status),
                        h('td', row.actionable && target ? h('button.button', {
                            on: {
                                click: (evt: Event) => {
                                    evt.stopPropagation();
                                    this.arrangementAction(target);
                                },
                            },
                        }, row.label) : row.label),
                    ]);
                })),
            ]),
        ]);
    }

    findArrangementById(arrangementId: string): RRArrangementCell | undefined {
        for (const row of Object.values(this.matrix)) {
            for (const cell of Object.values(row)) {
                if (cell.id === arrangementId) return cell;
            }
        }
        return undefined;
    }

    renderManagement() {
        if (!this.isHost()) {
            this.bodyNode = patch(this.bodyNode, h('div#rr-body', [h('div#rr-management.box.rr-empty', _('Player management is only available to the organizer.'))]));
            return;
        }

        const approved = this.players.filter((player) => player.name !== this.createdBy && !player.withdrawn);
        const kickOptions = Array.from(new Set([
            ...approved.map((player) => player.name),
            ...this.pendingPlayers.map((player) => player.name),
            ...this.deniedPlayers.map((player) => player.name),
        ])).sort();

        const renderRow = (player: TournamentManagePlayer, actions: VNode[]) => h('tr', [
            h('td', userLink(player.name, [h('player-title', ` ${player.title} `), displayUsername(player.name)])),
            h('td', `${player.rating}`),
            h('td.manage-actions', actions),
        ]);
        const button = (label: string, message: object, reject = false) =>
            h(`button.button${reject ? '.reject' : ''}`, { on: { click: () => this.doSend(message as any) } }, label);

        this.bodyNode = patch(this.bodyNode, h('div#rr-body', [
            h('div#rr-management.box', [
                h('div.rr-section-header', [
                    h('h2', _('Player management')),
                    h(`button.button${this.joiningClosed ? '.button-green' : '.button-red'}`, {
                        on: { click: () => this.doSend({ type: 'rr_set_joining_closed', tournamentId: this.tournamentId, closed: !this.joiningClosed }) },
                    }, this.joiningClosed ? _('Open joining') : _('Close joining')),
                ]),
                h('div.rr-kick-wrap', [
                    h('label', { attrs: { for: 'rr-kick-user' } }, _('Kick player')),
                    h('div.rr-kick-controls', [
                        h('input#rr-kick-user', {
                            attrs: { list: 'rr-kick-options', placeholder: _('Enter username') },
                            props: { value: this.kickUsername },
                            on: {
                                input: (evt: Event) => {
                                    this.kickUsername = (evt.target as HTMLInputElement).value;
                                },
                            },
                        }),
                        h('datalist#rr-kick-options', kickOptions.map((name) => h('option', { attrs: { value: name } }))),
                        h('button.button.reject', {
                            class: { disabled: this.kickUsername.trim() === '' },
                            on: {
                                click: () => {
                                    const username = this.kickUsername.trim();
                                    if (username === '') return;
                                    this.doSend({ type: 'rr_kick_player', tournamentId: this.tournamentId, username });
                                    this.kickUsername = '';
                                    this.renderBody();
                                },
                            },
                        }, _('Kick')),
                    ]),
                ]),
                this.approvalRequired ? h('h3', _('Pending requests')) : null,
                this.approvalRequired ? h('table.players', [
                    h('tbody', this.pendingPlayers.length > 0
                        ? this.pendingPlayers.map((player) => renderRow(player, [
                            button(_('Accept'), { type: 'rr_approve_player', tournamentId: this.tournamentId, username: player.name }),
                            button(_('Deny'), { type: 'rr_deny_player', tournamentId: this.tournamentId, username: player.name }, true),
                        ]))
                        : [h('tr', [h('td', { attrs: { colspan: 3 } }, _('No pending requests'))])]),
                ]) : null,
                h('h3', _('Approved players')),
                h('table.players', [
                    h('tbody', approved.length > 0
                        ? approved.map((player) => renderRow(player, [
                            button(_('Kick'), { type: 'rr_kick_player', tournamentId: this.tournamentId, username: player.name }, true),
                        ]))
                        : [h('tr', [h('td', { attrs: { colspan: 3 } }, _('No approved players'))])]),
                ]),
                this.approvalRequired ? h('h3', _('Denied players')) : null,
                this.approvalRequired ? h('table.players', [
                    h('tbody', this.deniedPlayers.length > 0
                        ? this.deniedPlayers.map((player) => renderRow(player, [
                            button(_('Accept'), { type: 'rr_approve_player', tournamentId: this.tournamentId, username: player.name }),
                        ]))
                        : [h('tr', [h('td', { attrs: { colspan: 3 } }, _('No denied players'))])]),
                ]) : null,
            ]),
        ]));
    }

    renderMatrixShell(lowerContent: VNode) {
        this.bodyNode = patch(this.bodyNode, h('div#rr-body', [
            h('div#player', [
                h('div#stats.box', [h('div#rr-crosstable')]),
                this.viewNavVNode(),
                lowerContent,
            ]),
        ]));
        this.crossTableNode = patch(document.getElementById('rr-crosstable') as HTMLElement, h('div#rr-crosstable'));
        this.renderCrossTable();
    }

    renderOverview() {
        this.renderMatrixShell(this.gamesVNode());
        this.renderModal();
    }

    renderChallenges() {
        this.renderMatrixShell(this.challengesVNode());
        this.renderModal();
    }

    renderBody() {
        if (this.viewMode === 'manage') {
            this.renderManagement();
            this.renderModal();
            return;
        }
        if (this.viewMode === 'challenges') {
            this.renderChallenges();
            this.renderModal();
            return;
        }
        this.renderOverview();
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
        this.renderProgress();
    }

    private onMsgGetPlayers(msg: MsgGetPlayers) {
        this.players = msg.players;
        if (!this.selectedPlayer && this.players.length > 0) {
            this.selectedPlayer = this.players[0].name;
            this.doSend({ type: 'get_games', tournamentId: this.tournamentId, player: this.selectedPlayer });
        }
        this.doSend({ type: 'get_rr_arrangements', tournamentId: this.tournamentId });
        this.renderBody();
    }

    private onMsgGetGames(msg: MsgGetGames) {
        this.selectedPlayer = msg.name;
        this.selectedGames = msg.games;
        if (this.viewMode === 'overview') this.renderGames();
    }

    private onMsgRRArrangements(msg: MsgRRArrangements) {
        this.rrPlayers = msg.players;
        this.matrix = msg.matrix;
        this.completedGames = msg.completedGames;
        this.totalGames = msg.totalGames;
        if (this.selectedArrangementId !== '' && !this.selectedArrangement()) this.selectedArrangementId = '';
        this.renderProgress();
        this.renderBody();
    }

    private onMsgRRManagement(msg: MsgRRManagement) {
        this.createdBy = msg.createdBy;
        this.approvalRequired = msg.approvalRequired;
        this.joiningClosed = msg.joiningClosed;
        this.pendingPlayers = msg.pendingPlayers;
        this.deniedPlayers = msg.deniedPlayers;
        this.renderManageButton();
        this.renderProgress();
        this.updateActionButton();
        this.renderBody();
    }

    private onMsgRRSettings(msg: MsgRRSettings) {
        this.createdBy = msg.createdBy;
        this.approvalRequired = msg.approvalRequired;
        this.joiningClosed = msg.joiningClosed;
        this.renderManageButton();
        this.renderProgress();
        this.updateActionButton();
        if (this.viewMode === 'manage' && !this.isHost()) this.viewMode = 'overview';
        this.renderBody();
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
        if (evt.data === '/n') return;
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
        case 'rr_management':
            this.onMsgRRManagement(msg);
            break;
        case 'rr_settings':
            this.onMsgRRSettings(msg);
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
    const variant = VARIANTS[model.variant] ?? VARIANTS['chess'];
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
                        h('div#rr-info-meta', [
                            h('div#tsystem'),
                            canEdit ? h('a.icon-cog.edit-tournament', {
                                attrs: {
                                    href: `/tournaments/${model.tournamentId}/edit`,
                                    title: _('Edit tournament'),
                                },
                            }) : null,
                        ]),
                        h('div#createdBy'),
                    ]),
                ]),
                h('div#description'),
                h('div#startsAt'),
                h('div#rr-manage'),
            ]),
            h('div#lobbychat'),
        ]),
        h(`div.players.${model.variant}`, [
            h('div.box', [
                h('div.tour-header', [
                    h('h1', model.tournamentname),
                    h('div#clockdiv'),
                ]),
                h('div#page-controls.btn-controls', [h('div#action')]),
                h('div#rr-shell', { hook: { insert: (vnode) => runTournamentRR(vnode, model) } }),
                h('div#rr-body'),
                h('div.tour-faq'),
            ]),
        ]),
        h('div.tour-table', [
            h('div#summarybox'),
        ]),
        h('div#rr-modal'),
        h('under-chat#spectators'),
    ];
}
