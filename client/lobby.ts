import Sockette from 'sockette';

import { init } from 'snabbdom';
import klass from 'snabbdom/modules/class';
import attributes from 'snabbdom/modules/attributes';
import properties from 'snabbdom/modules/props';
import listeners from 'snabbdom/modules/eventlisteners';
import style from 'snabbdom/modules/style';

const patch = init([klass, attributes, properties, listeners, style]);

import { h } from 'snabbdom/h';
import { VNode } from 'snabbdom/vnode';

import { Chessground } from 'chessgroundx';

import { JSONObject } from './types';
import { _, ngettext } from './i18n';
import { chatMessage, chatView } from './chat';
import { validFen, VARIANTS, selectVariant, IVariant } from './chess';
import { sound } from './sound';
import { boardSettings } from './boardSettings';
import { timeControlStr } from './view';
import { notify } from './notification';


class LobbyController {
    model;
    sock;
    player;
    logged_in;
    challengeAI: boolean;
    inviteFriend: boolean;
    validGameData: boolean;
    _ws;
    seeks;
    streams;
    spotlights;
    minutesValues = [
        0, 1 / 4, 1 / 2, 3 / 4, 1, 3 / 2, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
        17, 18, 19, 20, 25, 30, 35, 40, 45, 60, 75, 90, 105, 120, 135, 150, 165, 180
    ];
    incrementValues = [ 
        0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
        25, 30, 35, 40, 45, 60, 90, 120, 150, 180
    ];
    minutesStrings = ["0", "¼", "½", "¾"];

    constructor(el, model) {
        console.log("LobbyController constructor", el, model);

        this.model = model;
        this.challengeAI = false;
        this.inviteFriend = false;
        this.validGameData = false;
        this.seeks = [];

        const onOpen = (evt) => {
            this._ws = evt.target;
            console.log('onOpen()');
            // console.log("---CONNECTED", evt);
            // prevent losing my seeks in case of websocket reconnections
            if (this.seeks !== undefined) {
                this.seeks.forEach(s => {
                    if (s.user === this.model["username"]) {
                        this.createSeekMsg(s.variant, s.color, s.fen, s.base, s.inc, s.byoyomi, s.chess960, s.rated, s.alternateStart);
                    }
                });
            }
            this.doSend({ type: "lobby_user_connected", username: this.model["username"]});
            this.doSend({ type: "get_seeks" });
        }

        this._ws = { "readyState": -1 };
        const opts = {
            maxAttempts: 20,
            onopen: e => onOpen(e),
            onmessage: e => this.onMessage(e),
            onreconnect: e => console.log('Reconnecting in lobby...', e),
            onmaximum: e => console.log('Stop Attempting!', e),
            onclose: e => {console.log('Closed!', e);},
            onerror: e => console.log('Error:', e),
        };

        const ws = location.host.includes('pychess') ? 'wss://' : 'ws://';
        this.sock = new Sockette(ws + location.host + "/wsl", opts);

        // get seeks when we are coming back after a game
        if (this._ws.readyState === 1) {
            this.doSend({ type: "get_seeks" });
        }
        patch(document.getElementById('seekbuttons') as HTMLElement, h('div#seekbuttons', this.renderSeekButtons()));
        patch(document.getElementById('lobbychat') as HTMLElement, chatView(this, "lobbychat"));

        this.streams = document.getElementById('streams') as HTMLElement;

        this.spotlights = document.getElementById('spotlights') as HTMLElement;

        // challenge!
        const anon = this.model.anon === 'True';
        if (model.profileid !== "") {
            this.challengeAI = model.profileid === 'Fairy-Stockfish';
            this.inviteFriend = model.profileid === 'Invite-friend';
            document.getElementById('game-mode')!.style.display = (anon || this.challengeAI) ? 'none' : 'inline-flex';
            document.getElementById('challenge-block')!.style.display = 'inline-flex';
            document.getElementById('ailevel')!.style.display = this.challengeAI ? 'block' : 'none';
            document.getElementById('id01')!.style.display = 'block';
        }

        const e = document.getElementById("fen") as HTMLInputElement;
        if (this.model.fen !== "")
            e.value = this.model.fen;
        if (anon)
            e.disabled = true;
    }

    doSend(message: JSONObject) {
        // console.log("---> lobby doSend():", message);
        this.sock.send(JSON.stringify(message));
    }

    createSeekMsg(variant: string, color: string, fen: string, minutes: number, increment: number, byoyomiPeriod: number, chess960: boolean, rated: boolean, alternateStart: string) {
        this.doSend({
            type: "create_seek",
            user: this.model.username,
            target: this.model.profileid,
            variant: variant,
            fen: fen,
            minutes: minutes,
            increment: increment,
            byoyomiPeriod: byoyomiPeriod,
            rated: rated,
            alternateStart: alternateStart,
            chess960: chess960,
            color: color
        });
    }

    createInviteFriendMsg(variant: string, color: string, fen: string, minutes: number, increment: number, byoyomiPeriod: number, chess960: boolean, rated: boolean, alternateStart: string) {
        this.doSend({
            type: "create_invite",
            user: this.model.username,
            target: 'Invite-friend',
            variant: variant,
            fen: fen,
            minutes: minutes,
            increment: increment,
            byoyomiPeriod: byoyomiPeriod,
            rated: rated,
            alternateStart: alternateStart,
            chess960: chess960,
            color: color
        });
    }

    createBotChallengeMsg(variant: string, color: string, fen: string, minutes: number, increment: number, byoyomiPeriod: number, level: number, chess960: boolean, rated: boolean, alternateStart: string) {
        this.doSend({
            type: "create_ai_challenge",
            user: this.model.username,
            variant: variant,
            fen: fen,
            minutes: minutes,
            increment: increment,
            byoyomiPeriod: byoyomiPeriod,
            rated: rated,
            alternateStart: alternateStart,
            level: level,
            chess960: chess960,
            color: color
        });
    }

    isNewSeek(variant: string, color: string, fen: string, minutes: number, increment: number, byoyomiPeriod: number, chess960: boolean, rated: boolean) {
        // console.log("isNewSeek()?", variant, color, fen, minutes, increment, byoyomiPeriod, chess960, rated);
        // console.log(this.seeks);
        return !this.seeks.some(seek =>
            seek.user === this.model["username"] && 
            seek.variant === variant &&
            seek.fen === fen &&
            seek.color === color &&
            seek.base === minutes &&
            seek.inc === increment &&
            seek.byoyomi === byoyomiPeriod &&
            seek.chess960 === chess960 &&
            seek.rated === rated
        );
    }

    createSeek(color) {
        document.getElementById('id01')!.style.display='none';
        if (!this.validGameData) return;

        let e;
        e = document.getElementById('variant') as HTMLSelectElement;
        const variant = VARIANTS[e.options[e.selectedIndex].value];
        localStorage.seek_variant = variant.name;

        // TODO Standardize seek color
        let seekColor;
        if (variant.name.endsWith('shogi') && color !== 'r')
            seekColor = (color === 'w') ? 'b' : 'w';
        else
            seekColor = color;

        e = document.getElementById('fen') as HTMLInputElement;
        const fen = e.value;

        let alternateStart = "";
        if (variant.alternateStart) {
            e = document.getElementById('alternate-start') as HTMLSelectElement;
            alternateStart = e.options[e.selectedIndex].value;
        }

        e = document.getElementById('min') as HTMLInputElement;
        const minutes = this.minutesValues[Number(e.value)];
        localStorage.seek_min = e.value;

        e = document.getElementById('inc') as HTMLInputElement;
        const increment = this.incrementValues[Number(e.value)];
        localStorage.seek_inc = e.value;

        e = document.getElementById('byo') as HTMLInputElement;
        const byoyomi = variant.timeControl === "byoyomi";
        const byoyomiPeriod = (byoyomi && increment > 0) ? Number(e.value) : 0;
        localStorage.seek_byo = e.value;

        e = document.querySelector('input[name="mode"]:checked') as HTMLInputElement;
        let rated: boolean;
        if (this.challengeAI ||
            this.model.anon === "True" ||
            this.model.title === "BOT" ||
            fen !== "" ||
            (minutes < 1 && increment === 0) ||
            (minutes === 0 && increment === 1)
            )
            rated = false;
        else
            rated = e.value === "1";
        localStorage.seek_rated = e.value;

        e = document.getElementById('chess960') as HTMLInputElement;
        const chess960 = (variant.chess960 && alternateStart === "") ? e.checked : false;
        localStorage.seek_chess960 = e.checked;

        // console.log("CREATE SEEK variant, color, fen, minutes, increment, hide, chess960", variant, color, fen, minutes, increment, chess960, rated);

        if (this.challengeAI) {
            e = document.querySelector('input[name="level"]:checked') as HTMLInputElement;
            const level = Number(e.value);
            localStorage.seek_level = e.value;
            // console.log(level, e.value, localStorage.getItem("seek_level"));
            this.createBotChallengeMsg(variant.name, seekColor, fen, minutes, increment, byoyomiPeriod, level, chess960, rated, alternateStart);
        } else if (this.inviteFriend) {
            this.createInviteFriendMsg(variant.name, seekColor, fen, minutes, increment, byoyomiPeriod, chess960, rated, alternateStart);
        } else {
            if (this.isNewSeek(variant.name, seekColor, fen, minutes, increment, byoyomiPeriod, chess960, rated))
                this.createSeekMsg(variant.name, seekColor, fen, minutes, increment, byoyomiPeriod, chess960, rated, alternateStart);
        }
        // prevent to create challenges continuously
        this.model.profileid = '';
        window.history.replaceState({}, this.model.title, '/');

        // We need to ask the user for permission
        notify(null, null);
    }

    renderSeekButtons() {
        const vVariant = this.model.variant || localStorage.seek_variant || "chess";
        const vMin = localStorage.seek_min ?? "5";
        const vInc = localStorage.seek_inc ?? "3";
        const vByoIdx = (localStorage.seek_byo ?? 1) - 1;
        const vRated = localStorage.seek_rated ?? "0";
        const vLevel = Number(localStorage.seek_level ?? "1");
        const vChess960 = localStorage.seek_chess960 ?? "false";

        const anon = this.model.anon === 'True';
        
        return [
            h('div#id01.modal', [
                h('form.modal-content', [
                    h('div#closecontainer', [
                        h('span.close', {
                            on: {
                                click: () => {
                                    document.getElementById('id01')!.style.display = 'none';
                                    // prevent creating challenges continuously
                                    this.model.profileid = '';
                                    window.history.replaceState({}, this.model.title, '/');
                                }
                            },
                            attrs: { 'data-icon': 'j' }, props: { title: _("Cancel") }
                        }),
                    ]),
                    h('div.container', [
                        h('div#challenge-block', [
                            h('h3', _('Challenge %1 to a game', this.model.profileid)),
                        ]),
                        h('div', [
                            h('label', { attrs: { for: "variant" } }, _("Variant")),
                            selectVariant("variant", vVariant, () => this.setVariant(), () => this.setVariant()),
                        ]),
                        h('input#fen', {
                            props: { name: 'fen', placeholder: _('Paste the FEN text here') + (anon ? _(' (must be signed in)') : ''),  autocomplete: "off" },
                            on: { input: () => this.setFen() },
                        }),
                        h('div#alternate-start-block'),
                        h('div#chess960-block', [
                            h('label', { attrs: { for: "chess960" } }, "Chess960"),
                            h('input#chess960', {
                                props: {
                                    name: "chess960",
                                    type: "checkbox",
                                },
                                attrs: {
                                    checked: vChess960 === "true"
                                },
                            }),
                        ]),
                        h('label', { attrs: { for: "min" } }, _("Minutes per side:")),
                        h('span#minutes'),
                        h('input#min.slider', {
                            props: { name: "min", type: "range", min: 0, max: this.minutesValues.length - 1, value: vMin },
                            on: { input: e => this.setMinutes((e.target as HTMLInputElement).value) },
                            hook: { insert: vnode => this.setMinutes((vnode.elm as HTMLInputElement).value) },
                        }),
                        h('label#incrementlabel', { attrs: { for: "inc" } }, ''),
                        h('span#increment'),
                        h('input#inc.slider', {
                            props: { name: "inc", type: "range", min: 0, max: this.incrementValues.length - 1, value: vInc },
                            on: { input: e => this.setIncrement(this.incrementValues[(e.target as HTMLInputElement).value]) },
                            hook: { insert: vnode => this.setIncrement(this.incrementValues[(vnode.elm as HTMLInputElement).value]) },
                        }),
                        h('div#byoyomi-period', [
                            h('label#byoyomiLabel', { attrs: { for: "byo" } }, _('Periods')),
                            h('select#byo', {
                                props: { name: "byo" },
                            },
                                [ 1, 2, 3 ].map((n, idx) => h('option', { props: { value: n }, attrs: { selected: (idx === vByoIdx) } }, n))
                            ),
                        ]),
                        h('form#game-mode', [
                            h('div.radio-group', [
                                h('input#casual', {
                                    props: { type: "radio", name: "mode", value: "0" },
                                    attrs: { checked: vRated === "0" }, 
                                    on: { input: e => this.setCasual((e.target as HTMLInputElement).value) },
                                    hook: { insert: vnode => this.setCasual((vnode.elm as HTMLInputElement).value) },
                                }),
                                h('label', { attrs: { for: "casual"} }, _("Casual")),
                                h('input#rated', {
                                    props: { type: "radio", name: "mode", value: "1" },
                                    attrs: { checked: vRated === "1" },
                                    on: { input: e => this.setRated((e.target as HTMLInputElement).value) },
                                    hook: { insert: vnode => this.setRated((vnode.elm as HTMLInputElement).value) },
                                }),
                                h('label', { attrs: { for: "rated"} }, _("Rated")),
                            ]),
                        ]),
                        // if play with the machine
                        // A.I.Level (1-8 buttons)
                        h('form#ailevel', [
                            h('h4', _("A.I. Level")),
                            h('div.radio-group',
                                [ 0, 1, 2, 3, 4, 5, 6, 7, 8 ].map(level => [
                                    h('input#ai' + level, { props: { type: "radio", name: "level", value: level }, attrs: { checked: vLevel === level } }),
                                    h('label.level-ai.ai' + level, { attrs: { for: "ai" + level } }, level),
                                ]).reduce((arr, v) => (arr.push(...v), arr), []) // flatmap
                            ),
                        ]),
                        h('div#color-button-group', [
                            h('button.icon.icon-black', { props: { type: "button", title: _("Black") }, on: { click: () => this.createSeek('b') } }),
                            h('button.icon.icon-adjust', { props: { type: "button", title: _("Random") }, on: { click: () => this.createSeek('r') } }),
                            h('button.icon.icon-white', { props: { type: "button", title: _("White") }, on: { click: () => this.createSeek('w') } }),
                        ]),
                    ]),
                ]),
            ]),
            h('button.lobby-button', {
                on: {
                    click: () => {
                        this.challengeAI = false;
                        this.inviteFriend = false;
                        document.getElementById('game-mode')!.style.display = anon ? 'none' : 'inline-flex';
                        document.getElementById('challenge-block')!.style.display = 'none';
                        document.getElementById('ailevel')!.style.display = 'none';
                        document.getElementById('id01')!.style.display = 'block';
                    }
                }
            },
                _("Create a game")
            ),
            h('button.lobby-button', {
                on: {
                    click: () => {
                        this.challengeAI = false;
                        this.inviteFriend = true;
                        document.getElementById('game-mode')!.style.display = anon ? 'none' : 'inline-flex';
                        document.getElementById('challenge-block')!.style.display = 'none';
                        document.getElementById('ailevel')!.style.display = 'none';
                        document.getElementById('id01')!.style.display = 'block';
                    }
                }
            },
                _("Play with a friend")
            ),
            h('button.lobby-button', {
                on: {
                    click: () => {
                        this.challengeAI = true;
                        this.inviteFriend = false;
                        document.getElementById('game-mode')!.style.display = (anon) ? 'none' : 'inline-flex';
                        document.getElementById('challenge-block')!.style.display = 'none';
                        document.getElementById('ailevel')!.style.display = 'inline-block';
                        document.getElementById('id01')!.style.display = 'block';
                    }
                }
            }, _("Play with AI (Fairy-Stockfish)")),
        ];
    }

    private setVariant() {
        let e;
        e = document.getElementById('variant') as HTMLSelectElement;
        const variant = VARIANTS[e.options[e.selectedIndex].value];
        const byoyomi = variant.timeControl === "byoyomi";
        // TODO use toggle class instead of setting style directly
        document.getElementById('chess960-block')!.style.display = variant.chess960 ? 'block' : 'none';
        document.getElementById('byoyomi-period')!.style.display = byoyomi ? 'block' : 'none';
        e = document.getElementById('fen') as HTMLInputElement;
        e.value = "";
        e = document.getElementById('incrementlabel') as HTMLSelectElement;
        patch(e, h('label#incrementlabel', { attrs: { for: "inc"} }, (byoyomi ? _('Byoyomi in seconds:') : _('Increment in seconds:'))));
        e = document.getElementById('alternate-start-block') as HTMLElement;
        e.innerHTML = "";
        if (variant.alternateStart) {
            patch(e, h('div#alternate-start-block', [
                h('label', { attrs: { for: "alternate-start" } }, _("Alternate Start")),
                h('select#alternate-start', {
                    props: { name: "alternate-start" },
                    on: { input: () => this.setAlternateStart(variant) },
                    hook: { insert: () => this.setAlternateStart(variant) },
                },
                    Object.keys(variant.alternateStart).map(alt =>
                        h('option', { props: { value: alt } }, _(alt))
                    )
                ),
            ]));
        }
        this.setStartButtons();
    }
    private setAlternateStart(variant: IVariant) {
        let e: HTMLSelectElement;
        e = document.getElementById('alternate-start') as HTMLSelectElement;
        const alt = e.options[e.selectedIndex].value;
        e = document.getElementById('fen') as HTMLSelectElement;
        e.value = variant.alternateStart![alt];
        (document.getElementById('chess960') as HTMLInputElement).disabled = alt !== "";
        this.setFen();
    }
    private setMinutes(val) {
        const minutes = val < this.minutesStrings.length ? this.minutesStrings[val] : String(this.minutesValues[val]);
        document.getElementById("minutes")!.innerHTML = minutes;
        this.setStartButtons();
    }
    private setIncrement(increment) {
        document.getElementById("increment")!.innerHTML = increment;
        this.setStartButtons();
    }
    private setFen() {
        const e = document.getElementById('fen') as HTMLInputElement;
        e.setCustomValidity(this.validateFen() ? '' : _('Invalid FEN'));
        this.setStartButtons();
    }
    private setCasual(casual) {
        console.log("setCasual", casual);
        this.setStartButtons();
    }
    private setRated(rated) {
        console.log("setRated", rated);
        this.setStartButtons();
    }
    private setStartButtons() {
        this.validGameData = this.validateTimeControl() && this.validateFen();
        const e = document.getElementById('color-button-group') as HTMLElement;
        e.classList.toggle("disabled", !this.validGameData);
    }
    private validateTimeControl() {
        const min = Number((document.getElementById('min') as HTMLInputElement).value);
        const inc = Number((document.getElementById('inc') as HTMLInputElement).value);
        const minutes = this.minutesValues[min];

        const e = document.querySelector('input[name="mode"]:checked') as HTMLInputElement;
        const rated = e.value === "1";

        const atLeast = (this.challengeAI) ? 4 : min + inc > 0;
        const tooFast = (minutes < 1 && inc === 0) || (minutes === 0 && inc === 1);

        return atLeast && !(tooFast && rated);
    }
    private validateFen() {
        const e = document.getElementById('variant') as HTMLSelectElement;
        const variant = e.options[e.selectedIndex].value;
        const fen = (document.getElementById('fen') as HTMLInputElement).value;
        return fen === "" || validFen(VARIANTS[variant], fen);
    }

    renderSeeks(seeks) {
        seeks.sort((a, b) => (a.bot && !b.bot) ? 1 : -1);
        const rows = seeks.map(seek => this.seekView(seek));
        return [ seekHeader(), h('tbody', rows) ];
    }

    private seekView(seek) {
        const variant = VARIANTS[seek.variant];
        const chess960 = seek.chess960;

        return this.hide(seek) ? "" : h('tr', { on: { click: () => this.onClickSeek(seek) } }, [
            h('td', [ this.colorIcon(seek.color) ]),
            h('td', [ this.challengeIcon(seek), this.title(seek), this.user(seek) ]),
            h('td', seek.rating),
            h('td', timeControlStr(seek.base, seek.inc, seek.byoyomi)),
            h('td.icon', { attrs: { "data-icon": variant.icon(chess960) } }, [h('variant-name', " " + variant.displayName(chess960))]),
            h('td', { class: { tooltip: seek.fen } }, [
                this.tooltip(seek, variant),
                this.mode(seek),
            ]),
        ]);
    }

    private onClickSeek(seek) {
        if (seek["user"] === this.model["username"]) {
            this.doSend({ type: "delete_seek", seekID: seek["seekID"], player: this.model["username"] });
        } else {
            this.doSend({ type: "accept_seek", seekID: seek["seekID"], player: this.model["username"] });
        }
    }
    private colorIcon(color) {
        return h('i-side.icon', {
            class: {
                "icon-adjust": color === "r",
                "icon-white":  color === "w",
                "icon-black":  color === "b",
            }
        });
    }
    private challengeIcon(seek) {
        const swords = (seek["user"] === this.model['username']) ? 'vs-swords.lobby.icon' : 'vs-swords.lobby.opp.icon';
        return (seek['target'] === '') ? null : h(swords, { attrs: {"data-icon": '"'} });
    }
    private title(seek) {
        return (seek['target'] === '') ? h('player-title', " " + seek["title"] + " ") : null;
    }
    private user(seek) {
        if (seek["target"] === '' || seek["target"] === this.model["username"])
            return seek["user"];
        else
            return seek["target"];
    }
    private hide(seek) {
        return ((this.model["anon"] === 'True' || this.model["title"] === 'BOT') && seek["rated"]) ||
            (seek['target'] !== '' && this.model['username'] !== seek['user'] && this.model['username'] !== seek['target']);
    }
    private tooltip(seek, variant) {
        let tooltipImage;
        if (seek.fen) {
            tooltipImage = h('minigame.' + variant.board + '.' + variant.piece, [
                h('div.cg-wrap.' + variant.cg + '.mini',
                    { hook: { insert: (vnode) => Chessground(vnode.elm as HTMLElement, { coordinates: false, fen: seek.fen, geometry: variant.geometry }) } }
                ),
            ]);
        } else {
            tooltipImage = '';
        }
        return h('span.tooltiptext', [ tooltipImage ]);
    }
    private mode(seek) {
        if (seek.alternateStart)
            return seek.alternateStart;
        else if (seek.fen)
            return _("Custom");
        else if (seek.rated)
            return _("Rated");
        else
            return _("Casual");
    }

    private streamView(stream) {
        const url = (stream.site === 'twitch') ? 'https://www.twitch.tv/' : 'https://www.youtube.com/channel/';
        return h('a.stream', { attrs: { "href": url + stream.streamer, "rel": "noopener nofollow", "target": "_blank" } }, [
            h('strong.text', {class: {"icon": true, "icon-mic": true} }, stream.username),
            stream.title,
        ]);
    }

    private spotlightView(spotlight) {
        const variant = VARIANTS[spotlight.variant];
        const chess960 = spotlight.chess960;
        const dataIcon = variant.icon(chess960);

        return h('a.tour-spotlight', { attrs: { "href": "/tournament/" + spotlight.tid } }, [
            h('i.icon', { attrs: { "data-icon": dataIcon } }),
            h('span.content', [
                h('span.name', spotlight.name),
                h('span.more', [
                    h('nb', spotlight.nbPlayers + ' players • '),
                    h('info-date', { attrs: { "timestamp": spotlight.startsAt } } )
                ])
            ])
        ]);
    }

    onMessage(evt) {
        // console.log("<+++ lobby onMessage():", evt.data);
        const msg = JSON.parse(evt.data);
        switch (msg.type) {
            case "get_seeks":
                this.onMsgGetSeeks(msg);
                break;
            case "new_game":
                this.onMsgNewGame(msg);
                break;
            case "game_in_progress":
                this.onMsgGameInProgress(msg);
                break;
            case "lobby_user_connected":
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
            case "g_cnt":
                this.onMsgGameCounter(msg);
                break;
            case "u_cnt":
                this.onMsgUserCounter(msg);
                break;
            case "streams":
                this.onMsgStreams(msg);
                break;
            case "spotlights":
                this.onMsgSpotlights(msg);
                break;
            case "invite_created":
                this.onMsgInviteCreated(msg);
                break;
            case "shutdown":
                this.onMsgShutdown(msg);
                break;
            case "error":
                this.onMsgError(msg);
                break;
            case "logout":
                this.doSend({type: "logout"});
                break;
        }
    }

    private onMsgInviteCreated(msg) {
        window.location.assign('/' + msg.gameId);
    }

    private onMsgGetSeeks(msg) {
        this.seeks = msg.seeks;
        // console.log("!!!! got get_seeks msg:", msg);

        const oldSeeks = document.getElementById('seeks') as Element;
        oldSeeks.innerHTML = "";
        patch(oldSeeks, h('table#seeks', this.renderSeeks(msg.seeks)));
    }
    private onMsgNewGame(msg) {
        // console.log("LobbyController.onMsgNewGame()", this.model["gameId"])
        window.location.assign('/' + msg.gameId);
    }
    private onMsgGameInProgress(msg) {
        const response = confirm(_("You have an unfinished game!\nPress OK to continue."));
        if (response) window.location.assign('/' + msg.gameId);
    }
    private onMsgUserConnected(msg) {
        this.model.username = msg.username;
    }
    private onMsgChat(msg) {
        chatMessage(msg.user, msg.message, "lobbychat");
        // seems this is annoying for most of the users
        //if (msg.user.length !== 0 && msg.user !== '_server')
        //    sound.socialNotify();
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
    private onMsgShutdown(msg) {
        alert(msg.message);
    }
    private onMsgGameCounter(msg) {
        // console.log("Gcnt=", msg.cnt);
        const gameCount = document.getElementById('g_cnt') as HTMLElement;
        patch(gameCount, h('counter#g_cnt', ngettext('%1 game in play', '%1 games in play', msg.cnt)));
    }
    private onMsgUserCounter(msg) {
        // console.log("Ucnt=", msg.cnt);
        const userCount = document.getElementById('u_cnt') as HTMLElement;
        patch(userCount as HTMLElement, h('counter#u_cnt', ngettext('%1 player', '%1 players', msg.cnt)));
    }

    private onMsgStreams(msg) {
        this.streams = patch(this.streams, h('div#streams', msg.items.map(stream => this.streamView(stream))));
    }

    private onMsgSpotlights(msg) {
        this.spotlights = patch(this.spotlights, h('div#spotlights', msg.items.map(spotlight => this.spotlightView(spotlight))));
    }
}

function seekHeader() {
    return h('thead', [
        h('tr', [
            h('th', [h('div#santa')]),
            h('th', _('Player')),
            h('th', _('Rating')),
            h('th', _('Time')),
            h('th', _('Variant')),
            h('th', _('Mode'))
        ])
    ]);
}

function runSeeks(vnode: VNode, model) {
    const el = vnode.elm as HTMLElement;
    new LobbyController(el, model);
    // console.log("lobbyView() -> runSeeks()", el, model, ctrl);
}

export function lobbyView(model): VNode[] {

    /* TODO move this to appropriate place
    // Get the modal
    const modal = document.getElementById('id01')!;

    // When the user clicks anywhere outside of the modal, close it
    document.addEventListener("click", function(event) {
        if (!modal.contains(event.target as Node))
            modal.style.display = "none";
    });
    */

    boardSettings.updateBoardAndPieceStyles();

    if (model['anon'] === 'False') {
        const evtSource = new EventSource(model["home"] + "/api/notify");
        // console.log("new EventSource" + model["home"] + "/api/notify");
        evtSource.onmessage = e => {
            const message = JSON.parse(e.data);
            console.log(message);
            sound.socialNotify();
        };
    }

    return [
        h('aside.sidebar-first', [
            h('div#streams'),
            h('div#spotlights'),
            h('div#lobbychat')
        ]),
        h('div.seeks', [
            h('div#seeks-table', [
                h('div#seeks-wrapper', h('table#seeks', { hook: { insert: vnode => runSeeks(vnode, model) } })),
            ]),
        ]),
        h('aside.sidebar-second', [ h('div#seekbuttons') ]),
        h('under-left', [
            h('a.reflist', { attrs: { href: 'https://discord.gg/aPs8RKr' } }, 'Discord'),
            h('a.reflist', { attrs: { href: 'https://github.com/gbtami/pychess-variants' } }, 'Github'),
            h('a.reflist', { attrs: { href: '/patron' } }, _("Donate")),
            h('a.reflist', { attrs: { href: '/faq' } }, _("FAQ")),
            h('a.reflist', { attrs: { href: '/stats' } }, _("Stats")),
            h('a.reflist', { attrs: { href: '/about' } }, _("About")),
        ]),
        h('under-lobby', [
            h('news-latest', [
                h('icon', { attrs: {"data-icon": '2'} }),
                h('a.reflist', { attrs: {href: '/news'} }, _("Latest updates")),
            ]),
            h('posts', [
                // TODO: create news documents in mongodb and load latest 3 dinamically here
                h('a.post', { attrs: {href: '/news/Empire_Chess_and_Orda_Mirror_Have_Arrived'} }, [
                    h('img', { attrs: {src: model["asset-url"] + '/images/Darth-Vader-Comic.jpg'} }),
                    h('span.text', [
                        h('strong', "Empire Chess and Orda Mirror Have Arrived!"),
                        h('span', 'New variants'),
                    ]),
                    h('time', '2021.07.30'),
                ]),
                h('a.post', { attrs: {href: '/news/Shinobi_Arrives_in_Time_For_the_Sakura_Blossoms'} }, [
                    h('img', { attrs: {src: model["asset-url"] + '/icons/shinobi.svg'} }),
                    h('span.text', [
                        h('strong', "Shinobi Arrives in Time For the Sakura Blossoms"),
                        h('span', 'Shinobi Chess has arrived!'),
                    ]),
                    h('time', '2021.04.21'),
                ]),
                h('a.post', { attrs: {href: '/news/The_Winner_Is_Tasshaq'} }, [
                    h('img', { attrs: {src: model["asset-url"] + '/icons/Dobutsu.svg'} }),
                    h('span.text', [
                        h('strong', "And the winner is Tasshaq"),
                        h('span', 'Subjective report on 1st Dōbutsu Tournament'),
                    ]),
                    h('time', '2021.03.28'),
                ]),
                /*
                h('a.post', { attrs: {href: '/news/New_Weapons_Arrived'} }, [
                    h('img', { attrs: {src: model["asset-url"] + '/images/RS-24.jpg'} }),
                    h('span.text', [
                        h('strong', "Atomic chess and Atomic960 are here"),
                        h('span', 'New Weapons Arrived'),
                    ]),
                    h('time', '2021.03.03'),
                ]),
                h('a.post', { attrs: {href: '/news/Short_History_Of_Pychess'} }, [
                    h('img', { attrs: {src: model["asset-url"] + '/images/TomatoPlasticSet.svg'} }),
                    h('span.text', [
                        h('strong', "And Now for Something Completely Different"),
                        h('span', 'Short History Of Pychess'),
                    ]),
                    h('time', '2021.02.27'),
                ]),
                h('a.post', { attrs: {href: '/news/Dobutsu_Tournament'} }, [
                    h('img', { attrs: {src: model["asset-url"] + '/icons/Dobutsu.svg'} }),
                    h('span.text', [
                        h('strong', "PyChess tournament announcement"),
                        h('span', 'The 1st Dōbutsu Tournament on PyChess'),
                    ]),
                    h('time', '2021.02.04'),
                ]),
                */ 
            ]),
        ]),
        h('under-right', [
            h('a', { attrs: { href: '/players' } }, [ h('counter#u_cnt') ]),
            h('a', { attrs: { href: '/games' } }, [ h('counter#g_cnt') ]),
        ]),
    ];
}
