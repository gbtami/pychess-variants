import WebsocketHeartbeatJs from 'websocket-heartbeat-js';

import { h, VNode } from 'snabbdom';

import { Chessground } from 'chessgroundx';

import { newWebsocket } from './socket';
import { JSONObject } from './types';
import { _, ngettext, languageSettings } from './i18n';
import { patch } from './document';
import { chatMessage, chatView, ChatController } from './chat';
import { VARIANTS, selectVariant, Variant } from './variants';
import { timeControlStr } from './view';
import { notify } from './notification';
import { PyChessModel } from "./types";
import { MsgChat, MsgFullChat } from "./messages";
import { variantPanels } from './lobby/layer1';
import { Stream, Spotlight, MsgInviteCreated, MsgHostCreated, MsgGetSeeks, MsgNewGame, MsgGameInProgress, MsgUserConnected, MsgPing, MsgError, MsgShutdown, MsgGameCounter, MsgUserCounter, MsgStreams, MsgSpotlights, Seek, CreateMode } from './lobbyType';
import { validFen } from './chess';

export class LobbyController implements ChatController {
    sock: WebsocketHeartbeatJs;
    home: string;
    assetURL: string;
    // player;
    // logged_in;
    username: string;
    profileid: string;
    anon: boolean;
    title: string;
    tournamentDirector: boolean;
    fen: string;
    variant: string;
    createMode: CreateMode;
    validGameData: boolean;
    readyState: number;
    seeks: Seek[];
    streams: VNode | HTMLElement;
    spotlights: VNode | HTMLElement;
    minutesValues = [
        0, 1 / 4, 1 / 2, 3 / 4, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
        17, 18, 19, 20, 25, 30, 35, 40, 45, 60, 75, 90
    ];
    incrementValues = [
        0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
        25, 30, 35, 40, 45, 60, 90
    ];
    minutesStrings = ["0", "¼", "½", "¾","1", "2", "3", "4","5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15", "16",
    "17", "18", "19", "20", "25", "30", "35", "40", "45", "60", "75", "90"];

    constructor(el: HTMLElement, model: PyChessModel) {
        console.log("LobbyController constructor", el, model);

        this.home = model["home"];
        this.assetURL = model["assetURL"];
        this.username = model["username"];
        this.anon = model["anon"] === 'True';
        this.title = model["title"];
        this.tournamentDirector = model["tournamentDirector"];
        this.fen = model["fen"];
        this.variant = model["variant"];
        this.profileid = model["profileid"]
        this.createMode = 'createGame';
        this.validGameData = false;
        this.seeks = [];

        const onOpen = () => {
            console.log('onOpen()');
            // console.log("---CONNECTED", evt);
            // prevent losing my seeks in case of websocket reconnections
            if (this.seeks !== undefined) {
                this.seeks.forEach( (s: Seek) => {
                    if (s.user === this.username) {
                        this.createSeekMsg(s.variant, s.color, s.fen, s.base, s.inc, s.byoyomi, s.chess960, s.rated, s.alternateStart);
                    }
                });
            }
            this.doSend({ type: "lobby_user_connected", username: this.username});
            this.doSend({ type: "get_seeks" });
        }

        this.sock = newWebsocket('wsl');
        this.sock.onopen = () => onOpen();
        this.sock.onmessage = (e: MessageEvent) => this.onMessage(e);

        patch(document.getElementById('seekbuttons') as HTMLElement, h('div#seekbuttons', this.renderSeekButtons()));

        // patch(document.getElementById('variants-catalog') as HTMLElement, variantPanels(this));

        this.streams = document.getElementById('streams') as HTMLElement;

        this.spotlights = document.getElementById('spotlights') as HTMLElement;

        // challenge!
        if (this.profileid !== "") {
            if (this.profileid === 'Fairy-Stockfish') this.createMode = 'playAI';
            else if (this.profileid === 'Invite-friend') this.createMode = 'playFriend';
            document.getElementById('game-mode')!.style.display = (this.anon || this.createMode === 'playAI') ? 'none' : 'inline-flex';
            document.getElementById('challenge-block')!.style.display = 'inline-flex';
            document.getElementById('ailevel')!.style.display = this.createMode === 'playAI' ? 'block' : 'none';
            document.getElementById('rmplay-block')!.style.display = this.createMode === 'playAI' ? 'block' : 'none';
            document.getElementById('id01')!.style.display = 'block';
            document.getElementById('color-button-group')!.style.display = 'block';
            document.getElementById('create-button')!.style.display = 'none';

            if (this.profileid === 'any#') {
                this.profileid = '';
                this.createGame();
            }
        }

        const e = document.getElementById("fen") as HTMLInputElement;
        if (this.fen !== "")
            e.value = this.fen;
    }

    doSend(message: JSONObject) {
        // console.log("---> lobby doSend():", message);
        this.sock.send(JSON.stringify(message));
    }

    createSeekMsg(variant: string, color: string, fen: string, minutes: number, increment: number, byoyomiPeriod: number, chess960: boolean, rated: boolean, alternateStart: string) {
        this.doSend({
            type: "create_seek",
            user: this.username,
            target: this.profileid,
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
            user: this.username,
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

    createBotChallengeMsg(variant: string, color: string, fen: string, minutes: number, increment: number, byoyomiPeriod: number, level: number, rm: boolean, chess960: boolean, rated: boolean, alternateStart: string) {
        this.doSend({
            type: "create_ai_challenge",
            rm: rm,
            user: this.username,
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

    createHostMsg(variant: string, color: string, fen: string, minutes: number, increment: number, byoyomiPeriod: number, chess960: boolean, rated: boolean, alternateStart: string) {
        this.doSend({
            type: "create_host",
            user: this.username,
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

    isNewSeek(variant: string, color: string, fen: string, minutes: number, increment: number, byoyomiPeriod: number, chess960: boolean, rated: boolean) {
        // console.log("isNewSeek()?", variant, color, fen, minutes, increment, byoyomiPeriod, chess960, rated);
        // console.log(this.seeks);
        return !this.seeks.some(seek =>
            seek.user === this.username &&
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

    createSeek(color: string) {
        console.log('clicked')
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
        let fen = e.value;
        // Prevent to create 'custom' games with standard startFen
        if (fen.trim() === variant.startFen) fen = '';

        let alternateStart = "";
        if (variant.alternateStart) {
            e = document.getElementById('alternate-start') as HTMLSelectElement;
            alternateStart = e.options[e.selectedIndex].value;
        }

        e = document.getElementById('min') as HTMLInputElement;
        const minutes = this.minutesValues[Number(e.value)];
        if(this.createMode == 'playAI') {
          localStorage.seek_min_ai = e.value;
        } else if(this.createMode == 'playFriend') {
          localStorage.seek_min_fr = e.value;
        } else if(this.createMode == 'createGame') {
          localStorage.seek_min_op = e.value;
        }

        e = document.getElementById('inc') as HTMLInputElement;
        const increment = this.incrementValues[Number(e.value)];
        if(this.createMode == 'playAI') {
          localStorage.seek_inc_ai = e.value;
        } else if(this.createMode == 'playFriend') {
          localStorage.seek_inc_fr = e.value;
        } else if(this.createMode == 'createGame') {
          localStorage.seek_inc_op = e.value;
        }

        e = document.getElementById('byo') as HTMLInputElement;
        const byoyomi = variant.rules.defaultTimeControl === "byoyomi";
        const byoyomiPeriod = (byoyomi && increment > 0) ? Number(e.value) : 0;
        localStorage.seek_byo = e.value;

        e = document.querySelector('input[name="mode"]:checked') as HTMLInputElement;
        let rated: boolean;
        if (this.createMode === 'playAI' ||
            this.anon ||
            this.title === "BOT" ||
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

        switch (this.createMode) {
            case 'playAI':
                e = document.querySelector('input[name="level"]:checked') as HTMLInputElement;
                const level = Number(e.value);
                localStorage.seek_level = e.value;
                // console.log(level, e.value, localStorage.getItem("seek_level"));
                e = document.getElementById('rmplay') as HTMLInputElement;
                localStorage.seek_rmplay = e.checked;
                const rm = e.checked;
                this.createBotChallengeMsg(variant.name, seekColor, fen, minutes, increment, byoyomiPeriod, level, rm, chess960, rated, alternateStart);
                break;
            case 'playFriend':
                this.createInviteFriendMsg(variant.name, seekColor, fen, minutes, increment, byoyomiPeriod, chess960, rated, alternateStart);
                break;
            case 'createHost':
                this.createHostMsg(variant.name, seekColor, fen, minutes, increment, byoyomiPeriod, chess960, rated, alternateStart);
                break;
            default:
                if (this.isNewSeek(variant.name, seekColor, fen, minutes, increment, byoyomiPeriod, chess960, rated))
                    this.createSeekMsg(variant.name, seekColor, fen, minutes, increment, byoyomiPeriod, chess960, rated, alternateStart);
        }
        // prevent to create challenges continuously
        this.profileid = '';
        window.history.replaceState({}, this.title, '/');

        // We need to ask the user for permission
        notify(null, undefined);
    }

    renderSeekButtons() {
        const vVariant = this.variant || localStorage.seek_variant || "chess";
        // 5+3 default TC needs vMin 8 because of the partial numbers at the beginning of minutesValues
        let vMin =  "8";
        let vInc =  "8";
        if(this.createMode == 'playAI') {
          vMin = localStorage.seek_min_ai ?? "90";
          vInc = localStorage.seek_inc_ai ?? "0";
        } else if(this.createMode == 'playFriend') {
          vMin = localStorage.seek_min_fr ?? "8";
          vInc = localStorage.seek_inc_fr ?? "8";
        } else if(this.createMode == 'createGame') {
          vMin = localStorage.seek_min_op ?? "8";
          vInc = localStorage.seek_inc_op ?? "8";
        }
        const vByoIdx = (localStorage.seek_byo ?? 1) - 1;
        const vRated = localStorage.seek_rated ?? "0";
        const vLevel = Number(localStorage.seek_level ?? "1");
        const vChess960 = localStorage.seek_chess960 ?? "false";
        const vRMplay = localStorage.seek_rmplay ?? "false";
        var buttonClicked = 'r';
        const addClass=(e:any)=>{
            e.target.classList.add("active");
            for (let sibling of e.target.parentNode.children) {
                if (sibling !== e.target) sibling.classList.remove('active');
            }
        }

        return [
            h('div#id01.modal', h('div.modal-content.invite-model',[
                h('h3.invite-title'),
                h('div.invite-frnd',[h('h2.section-title','JOIN A GAME'),h('p', _('If your friend gave you a game code, enter it here:')),
                h('form#invite-join', {props: {method: "post", action: ""}}, [
                  h('input#invite-code', {attrs: { spellcheck: false, value: ""}}),
                  h('button#join-player2.lobby-button.join-submit', { attrs:{value:"Join"},  on: { click: () => {var inviteCode = document.getElementById('invite-code').value; if(inviteCode != '') {document.getElementById("invite-join").action = "/invite/accept/" + inviteCode;} } } }, "Join Game")
                ])]),
                h('form.join-form', [
                    h('h3.section-title','CREATE A NEW GAME'),
                    h('div#closecontainer', [
                        h('span.close', {
                            on: {
                                click: () => {
                                    document.getElementById('id01')!.style.display = 'none';
                                    // prevent creating challenges continuously
                                    this.profileid = '';
                                    window.history.replaceState({}, this.title, '/');
                                    document.querySelector('.invite-model')!.classList.remove('two-col');
                                    if(this.createMode == 'playAI') {
                                      document.getElementById("minutes")!.innerHTML =  localStorage.seek_min_fr ?? "5";
                                      const localMinutes = localStorage.seek_min_ai ?? "5";
                                      if(this.minutesStrings.indexOf(localMinutes)>-1) {
                                        document.getElementById("min").value = this.minutesStrings.indexOf(localMinutes);
                                      }
                                      document.getElementById("increment")!.innerHTML = localStorage.seek_inc_ai ?? "0";
                                      const localInc = localStorage.seek_inc_ai ?? "8";
                                      if(this.minutesStrings.indexOf(localInc)>-1) {
                                        document.getElementById("inc").value = this.minutesStrings.indexOf(localInc);
                                      }

                                    } else if(this.createMode == 'playFriend') {
                                      document.getElementById("minutes")!.innerHTML =  localStorage.seek_min_fr ?? "5";
                                      const localMinutes = localStorage.seek_min_fr ?? "5";
                                      if(this.minutesStrings.indexOf(localMinutes)>-1) {
                                        document.getElementById("min").value = this.minutesStrings.indexOf(localMinutes);
                                      }
                                      document.getElementById("increment")!.innerHTML = localStorage.seek_inc_fr ?? "8";
                                      const localInc = localStorage.seek_inc_fr ?? "8";
                                      if(this.minutesStrings.indexOf(localInc)>-1) {
                                        document.getElementById("inc").value = this.minutesStrings.indexOf(localInc);
                                      }

                                    } else if(this.createMode == 'createGame') {
                                      document.getElementById("minutes")!.innerHTML =  localStorage.seek_min_op ?? "5";
                                      const localMinutes = localStorage.seek_min_op ?? "5";
                                      if(this.minutesStrings.indexOf(localMinutes)>-1) {
                                        document.getElementById("min").value = this.minutesStrings.indexOf(localMinutes);
                                      }
                                      document.getElementById("increment")!.innerHTML = localStorage.seek_inc_op ?? "8";
                                      const localInc = localStorage.seek_inc_op ?? "8";
                                      if(this.minutesStrings.indexOf(localInc)>-1) {
                                        document.getElementById("inc").value = this.minutesStrings.indexOf(localInc);
                                      }


                                    }

                                }
                            },
                            attrs: { 'data-icon': 'j' }, props: { title: _("Cancel") }
                        }),
                    ]),
                    h('div.container', [
                        h('div#challenge-block', [
                            h('h3', _('Challenge %1 to a game', this.profileid)),
                        ]),
                        h('div.hide', [
                            h('label', { attrs: { for: "variant" } }, _("Variant")),
                            selectVariant("variant", vVariant, () => this.setVariant(), () => this.setVariant()),
                        ]),
                        h('input#fen.hide', {
                            props: { name: 'fen', placeholder: _('Paste the FEN text here') + (this.anon ? _(' (must be signed in)') : ''),  autocomplete: "off" },
                            on: { input: () => this.setFen() }
                        }),
                        h('div#alternate-start-block', {style: {"display":"none"}}),
                        h('div#chess960-block', [
                            h('label', { attrs: { for: "chess960" }, style: {"display":"none"} }, "Chess960"),
                            h('input#chess960', {
                                props: {
                                    name: "chess960",
                                    type: "checkbox",
                                },
                                attrs: {
                                    checked: vChess960 === "true"
                                },
                                style: {"display":"none"},
                            }),
                        ]),
                        h('label#minute_label', { attrs: { for: "min" } }, _("Minutes per side:")),
                        h('span#minutes'),
                        h('input#min.slider', {
                            props: { name: "min", type: "range", min: 0, max: this.minutesValues.length - 1, value: vMin },
                            on: { input: e => this.setMinutes(parseInt((e.target as HTMLInputElement).value)) },
                            hook: { insert: vnode => this.setMinutes(parseInt((vnode.elm as HTMLInputElement).value)) },
                        }),
                        h('label#incrementlabel', { attrs: { for: "inc" } }, ''),
                        h('span#increment'),
                        h('input#inc.slider', {
                            props: { name: "inc", type: "range", min: 0, max: this.incrementValues.length - 1, value: vInc },
                            on: { input: e => this.setIncrement(this.incrementValues[parseInt((e.target as HTMLInputElement).value)]) },
                            hook: { insert: vnode => this.setIncrement(this.incrementValues[parseInt((vnode.elm as HTMLInputElement).value)]) },
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
                        h('div#rmplay-block', [
                            h('label', { attrs: { for: "rmplay" }, style: {"display":"none"}, }, "Random-Mover"),
                            h('input#rmplay', {
                                style: {"display":"none"},
                                props: {
                                    name: "rmplay",
                                    type: "checkbox",
                                    title: _("Practice with Random-Mover"),
                                },
                                attrs: {
                                    checked: vRMplay === "true"
                                },
                                on: { click: () => this.setRM() },
                            }),
                        ]),
                        // A.I.Level (1-8 buttons)
                        h('form#ailevel', [
                            h('h4', _("Difficulty Level")),
                            h('div.radio-group',
                                [ 0, 1, 2, 3, 4, 5, 6, 7, 8 ].map(level => [
                                    h('input#ai' + level, { props: { type: "radio", name: "level", value: level }, attrs: { checked: vLevel === level } }),
                                    h('label.level-ai.ai' + level, { attrs: { for: "ai" + level } }, level),
                                ]).reduce((arr, v) => (arr.push(...v), arr), []) // flatmap
                            ),
                        ]),
                        h('div#color-button-group', [
                            h('h4',{props:{title:("Choose your color:")}},_("Choose your color:")),
                            h('button.icon.icon-black', { props: { type: "button", title: _("Black") }, on: { click: (e) => {buttonClicked = 'b';addClass(e);} } }),
                            h('button.icon.icon-adjust.active', { props: { type: "button", title: _("Random") }, on: { click: (e) => {buttonClicked = 'r';addClass(e);} } }),
                            h('button.icon.icon-white', { props: { type: "button", title: _("White") }, on: { click: (e) => {buttonClicked = 'w';addClass(e);} } }),
                        ]),
                        h('div#create-button', [
                            h('button', { props: { type: "button" }, on: { click: () => this.createSeek(buttonClicked) } }),
                        ]),
                    ]),
                ]),
            ])),
            h('button.lobby-button', { on: { click: () => this.createGame() } }, _("Create Game")),
            h('button.lobby-button', { on: { click: () => this.playFriend() } }, _("Play a friend")),
            h('button.lobby-button', { on: { click: () => this.playAI() } }, _("Play vs. Computer")),
            h('button.lobby-button', { on: { click: () => this.createHost() }, style: { display: this.tournamentDirector ? "block" : "none" } }, _("Host a game for others")),
        ];
    }

    preSelectVariant(variantName: string, chess960: boolean=false) {
        if (variantName !== '') {
            const select = document.getElementById("variant") as HTMLSelectElement;
            const options = Array.from(select.options).map(o => o.value);
            if (select) select.selectedIndex = options.indexOf(variantName);

            this.setVariant();

            const check = document.getElementById("chess960") as HTMLInputElement;
            if (check) check.checked = chess960;
        }
    }

    createGame(variantName: string = '', chess960: boolean = false) {
        //random opponent call
        document.querySelector('.invite-title')!.innerHTML = "Play a random opponent";
        document.querySelector('#create-button button')!.innerHTML = 'Create game';
        this.preSelectVariant(variantName, chess960);
        this.createMode = 'createGame';
        document.getElementById('game-mode')!.style.display = this.anon ? 'none' : 'inline-flex';
        document.getElementById('challenge-block')!.style.display = 'none';
        document.getElementById('ailevel')!.style.display = 'none';
        document.getElementById('rmplay-block')!.style.display = 'none';
        document.getElementById('id01')!.style.display = 'block';
        document.getElementById('color-button-group')!.style.display = 'block';
        document.getElementById('create-button')!.style.display = 'block';
        document.getElementById("minutes")!.innerHTML =  localStorage.seek_min_op ?? "5";
        document.getElementById("increment")!.innerHTML = localStorage.seek_inc_op ?? "8";
        const localMinutes = localStorage.seek_min_op ?? "5";
        if(this.minutesStrings.indexOf(localMinutes)>-1) {
          document.getElementById("min").value = this.minutesStrings.indexOf(localMinutes);
        }
        const localInc = localStorage.seek_inc_op ?? "8";
        if(this.minutesStrings.indexOf(localInc)>-1) {
          document.getElementById("inc").value = this.minutesStrings.indexOf(localInc);
        }


    }

    playFriend(variantName: string = '', chess960: boolean = false) {
        //playFriend  call
        document.querySelector('.invite-title')!.innerHTML = "Play a friend";
        document.querySelector('#create-button button')!.innerHTML = 'Create game';
        document.querySelector('.invite-model')!.classList.add('two-col');
        this.preSelectVariant(variantName, chess960);
        this.createMode = 'playFriend';
        document.getElementById('game-mode')!.style.display = this.anon ? 'none' : 'inline-flex';
        document.getElementById('challenge-block')!.style.display = 'none';
        document.getElementById('ailevel')!.style.display = 'none';
        document.getElementById('rmplay-block')!.style.display = 'none';
        document.getElementById('id01')!.style.display = 'block';
        document.getElementById('color-button-group')!.style.display = 'block';
        document.getElementById('create-button')!.style.display = 'block';
        document.getElementById("minutes")!.innerHTML =  localStorage.seek_min_fr ?? "5";
        document.getElementById("increment")!.innerHTML = localStorage.seek_inc_fr ?? "8";
        const localMinutes = localStorage.seek_min_fr ?? "5";
        if(this.minutesStrings.indexOf(localMinutes)>-1) {
          document.getElementById("min").value = this.minutesStrings.indexOf(localMinutes);
        }
        const localInc = localStorage.seek_inc_fr ?? "8";
        if(this.minutesStrings.indexOf(localInc)>-1) {
          document.getElementById("inc").value = this.minutesStrings.indexOf(localInc);
        }

    }

    playAI(variantName: string = '', chess960: boolean = false) {
        //play computer call
        document.querySelector('.invite-title')!.innerHTML = "Play vs. computer";
        document.querySelector('#create-button button')!.innerHTML = 'Start';
        this.preSelectVariant(variantName, chess960);
        this.createMode = 'playAI';
        document.getElementById('game-mode')!.style.display = 'none';
        document.getElementById('challenge-block')!.style.display = 'none';
        const e = document.getElementById('rmplay') as HTMLInputElement;
        document.getElementById('ailevel')!.style.display = e.checked ? 'none' : 'inline-block';
        document.getElementById('rmplay-block')!.style.display = 'block';
        document.getElementById('id01')!.style.display = 'block';
        document.getElementById('color-button-group')!.style.display = 'block';
        document.getElementById('create-button')!.style.display = 'block';
        document.getElementById("minutes")!.innerHTML =  localStorage.seek_min_ai ?? "90";
        document.getElementById("increment")!.innerHTML = localStorage.seek_inc_ai ?? "0";
        const localMinutes = localStorage.seek_min_ai ?? "90";
        if(this.minutesStrings.indexOf(localMinutes)>-1) {
          document.getElementById("min").value = this.minutesStrings.indexOf(localMinutes);
        }
        const localInc = localStorage.seek_inc_ai ?? "0";
        if(this.minutesStrings.indexOf(localInc)>-1) {
          document.getElementById("inc").value = this.minutesStrings.indexOf(localInc);
        }

    }

    createHost(variantName: string = '', chess960: boolean = false) {
        this.preSelectVariant(variantName, chess960);
        this.createMode = 'createHost';
        document.getElementById('game-mode')!.style.display = this.anon ? 'none' : 'inline-flex';
        document.getElementById('challenge-block')!.style.display = 'none';
        document.getElementById('ailevel')!.style.display = 'none';
        document.getElementById('rmplay-block')!.style.display = 'none';
        document.getElementById('id01')!.style.display = 'block';
        document.getElementById('color-button-group')!.style.display = 'none';
        document.getElementById('create-button')!.style.display = 'block';
    }

    private setVariant() {
        let e;
        e = document.getElementById('variant') as HTMLSelectElement;
        const variant = VARIANTS[e.options[e.selectedIndex].value];
        const byoyomi = variant.rules.defaultTimeControl === "byoyomi";
        // TODO use toggle class instead of setting style directly
        document.getElementById('chess960-block')!.style.display = variant.chess960 ? 'block' : 'none';
        document.getElementById('byoyomi-period')!.style.display = byoyomi ? 'block' : 'none';
        e = document.getElementById('fen') as HTMLInputElement;
        e.value = "";
        e = document.getElementById('incrementlabel') as HTMLSelectElement;
        patch(e, h('label#incrementlabel', { attrs: { for: "inc"} }, (byoyomi ? _('Byoyomi in seconds:') : _('Additional seconds per turn:'))));
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
    private setAlternateStart(variant: Variant) {
        let e: HTMLSelectElement;
        e = document.getElementById('alternate-start') as HTMLSelectElement;
        const alt = e.options[e.selectedIndex].value;
        e = document.getElementById('fen') as HTMLSelectElement;
        e.value = variant.alternateStart![alt];
        (document.getElementById('chess960') as HTMLInputElement).disabled = alt !== "";
        this.setFen();
    }
    private setMinutes(val: number) {
        const minutes = val < this.minutesStrings.length ? this.minutesStrings[val] : String(this.minutesValues[val]);
        document.getElementById("minutes")!.innerHTML = minutes;
        if(this.createMode == 'playAI') {
          localStorage.seek_min_ai = minutes;
        } else if(this.createMode == 'playFriend') {
          localStorage.seek_min_fr = minutes;
        } else if(this.createMode == 'createGame') {
          localStorage.seek_min_op = minutes;
        }
        this.setStartButtons();
    }
    private setIncrement(increment: number) {
        document.getElementById("increment")!.innerHTML = ""+increment;
        if(this.createMode == 'playAI') {
          localStorage.seek_inc_ai = increment;
        } else if(this.createMode == 'playFriend') {
          localStorage.seek_inc_fr = increment;
        } else if(this.createMode == 'createGame') {
          localStorage.seek_inc_op = increment;
        }
        this.setStartButtons();
    }
    private setFen() {
        const e = document.getElementById('fen') as HTMLInputElement;
        e.setCustomValidity(this.validateFen() ? '' : _('Invalid FEN'));
        this.setStartButtons();
    }
    private setCasual(casual: string) {
        console.log("setCasual", casual);
        this.setStartButtons();
    }
    private setRated(rated: string) {
        console.log("setRated", rated);
        this.setStartButtons();
    }
    private setRM() {
        const e = document.getElementById('rmplay') as HTMLInputElement;
        document.getElementById('ailevel')!.style.display = e.checked ? 'none' : 'block';
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

        const atLeast = (this.createMode === 'playAI') ? ((min > 0 && inc > 0) || (min >= 1 && inc === 0)) : (min + inc > 0);
        const tooFast = (minutes < 1 && inc === 0) || (minutes === 0 && inc === 1);

        return atLeast && !(tooFast && rated);
    }
    private validateFen() {
        const e = document.getElementById('variant') as HTMLSelectElement;
        const variant = e.options[e.selectedIndex].value;
        const fen = (document.getElementById('fen') as HTMLInputElement).value;
        return fen === "" || validFen(VARIANTS[variant], fen);
    }

    renderSeeks(seeks: Seek[]) {
        seeks.sort((a, b) => (a.bot && !b.bot) ? 1 : -1);
        const rows = seeks.map(seek => this.seekView(seek));
        return [ seekHeader(), h('tbody', rows) ];
    }

    private seekView(seek: Seek) {
        const variant = VARIANTS[seek.variant];
        const chess960 = seek.chess960;
        console.log("color:" + seek.color);
        return this.hide(seek) ? "" : h('tr', { on: { click: () => this.onClickSeek(seek) } }, [
            // h('td', [ this.challengeIcon(seek), this.seekTitle(seek), this.user(seek) ]),
            // h('td', seek.rating),

            h('td',[
                h('span',this.mode(seek))
            ]),
            h('td',[
                h('span',timeControlStr(seek.base, seek.inc, seek.byoyomi))
            ]),

            h('td',[
                h('span',this.colorIcon(seek.color))
            ]),
        ]);
    }

    private onClickSeek(seek: Seek) {
        if (seek["user"] === this.username) {
            this.doSend({ type: "delete_seek", seekID: seek["seekID"], player: this.username });
        } else {
            this.doSend({ type: "accept_seek", seekID: seek["seekID"], player: this.username });
        }
    }
    private colorIcon(color: string) {
        return h('i-side.icon', {
            class: {
                "icon-adjust": color === "r",
                "icon-white":  color === "w",
                "icon-black":  color === "b",
            }
        });
    }
    private challengeIcon(seek: Seek) {
        const swords = (seek["user"] === this.username) ? 'vs-swords.lobby.icon' : 'vs-swords.lobby.opp.icon';
        return (seek['target'] === '') ? null : h(swords, { attrs: {"data-icon": '"'} });
    }
    private seekTitle(seek: Seek) {
        return (seek['target'] === '') ? h('player-title', " " + seek["title"] + " ") : null;
    }
    private user(seek: Seek) {
        if (seek["target"] === '' || seek["target"] === this.username)
            return seek["user"];
        else
            return seek["target"];
    }
    private hide(seek: Seek) {
        return ((this.anon || this.title === 'BOT') && seek["rated"]) ||
            (seek['target'] !== '' && this.username !== seek['user'] && this.username !== seek['target']);
    }
    private tooltip(seek: Seek, variant: Variant) {
        let tooltipImage;
        if (seek.fen) {
            tooltipImage = h('minigame.' + variant.boardFamily + '.' + variant.pieceFamily, [
                h('div.cg-wrap.' + variant.board.cg + '.minitooltip',
                    { hook: { insert: (vnode) => Chessground(vnode.elm as HTMLElement, {
                        coordinates: false,
                        fen: seek.fen,
                        dimensions: variant.board.dimensions,
                    })}}
                ),
            ]);
        } else {
            tooltipImage = '';
        }
        return h('span.tooltiptext', [ tooltipImage ]);
    }
    private mode(seek: Seek) {
        if (seek.alternateStart)
            return _(seek.alternateStart);
        else if (seek.fen)
            return _("Custom");
        else if (seek.rated)
            return _("Rated");
        else
            return _("Casual");
    }

    private streamView(stream: Stream) {
        const url = (stream.site === 'twitch') ? 'https://www.twitch.tv/' : 'https://www.youtube.com/channel/';
        const tail = (stream.site === 'youtube') ? '/live' : '';
        return h('a.stream', { attrs: { "href": url + stream.streamer + tail, "rel": "noopener nofollow", "target": "_blank" } }, [
            h('strong.text', {class: {"icon": true, "icon-mic": true} }, stream.username),
            stream.title,
        ]);
    }

    private spotlightView(spotlight: Spotlight) {
        const variant = VARIANTS[spotlight.variant];
        const chess960 = spotlight.chess960;
        const variantName = variant.displayName(chess960);
        const dataIcon = variant.icon(chess960);
        const lang = languageSettings.value;
        const name = spotlight.names[lang] ?? spotlight.names['en'];

        return h('a.tour-spotlight', { attrs: { "href": "/tournament/" + spotlight.tid } }, [
            h('i.icon', { attrs: { "data-icon": dataIcon } }),
            h('span.content', [
                h('span.name', name),
                h('span.more', [
                    h('variant', variantName + ' • '),
                    h('nb', ngettext('%1 Player', '%1 Players', spotlight.nbPlayers) + ' • '),
                    h('info-date', { attrs: { "timestamp": spotlight.startsAt } } )
                ])
            ])
        ]);
    }

    onMessage(evt: MessageEvent) {
        // console.log("<+++ lobby onMessage():", evt.data);
        if (evt.data === '/n') return;
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
            // case "fullchat":
            //     this.onMsgFullChat(msg);
            //     break;
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
            // case "spotlights":
            //     this.onMsgSpotlights(msg);
            //     break;
            case "invite_created":
                this.onMsgInviteCreated(msg);
                break;
            case "host_created":
                this.onMsgHostCreated(msg);
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

    private onMsgInviteCreated(msg: MsgInviteCreated) {
        window.location.assign('/' + msg.gameId);
    }

    private onMsgHostCreated(msg: MsgHostCreated) {
        window.location.assign('/' + msg.gameId);
    }

    private onMsgGetSeeks(msg: MsgGetSeeks) {
        this.seeks = msg.seeks;
        // console.log("!!!! got get_seeks msg:", msg);

        const oldSeeks = document.getElementById('seeks') as Element;
        oldSeeks.innerHTML = "";
        patch(oldSeeks, h('table#seeks', this.renderSeeks(msg.seeks)));
    }
    private onMsgNewGame(msg: MsgNewGame) {
        window.location.assign('/' + msg.gameId);
    }
    private onMsgGameInProgress(msg: MsgGameInProgress) {
        const response = confirm(_("You have an unfinished game!\nPress OK to continue."));
        if (response) window.location.assign('/' + msg.gameId);
    }
    private onMsgUserConnected(msg: MsgUserConnected) {
        this.username = msg.username;
    }
    private onMsgChat(msg: MsgChat) {
        chatMessage(msg.user, msg.message, "lobbychat", msg.time);
    }
    // private onMsgFullChat(msg: MsgFullChat) {
    //     // To prevent multiplication of messages we have to remove old messages div first
    //     patch(document.getElementById('messages') as HTMLElement, h('div#messages-clear'));
    //     // then create a new one
    //     patch(document.getElementById('messages-clear') as HTMLElement, h('div#messages'));
    //     // console.log("NEW FULL MESSAGES");
    //     msg.lines.forEach(line => chatMessage(line.user, line.message, "lobbychat", line.time));
    // }
    private onMsgPing(msg: MsgPing) {
        this.doSend({ type: "pong", timestamp: msg.timestamp });
    }
    private onMsgError(msg: MsgError) {
        alert(msg.message);
    }
    private onMsgShutdown(msg: MsgShutdown) {
        alert(msg.message);
    }
    private onMsgGameCounter(msg: MsgGameCounter) {
        // console.log("Gcnt=", msg.cnt);
        const gameCount = document.getElementById('g_cnt') as HTMLElement;
        patch(gameCount, h('counter#g_cnt', ngettext('%1 Active Game', '%1 Active games', msg.cnt)));
    }
    private onMsgUserCounter(msg: MsgUserCounter) {
        // console.log("Ucnt=", msg.cnt);
        const userCount = document.getElementById('u_cnt') as HTMLElement;
        patch(userCount as HTMLElement, h('counter#u_cnt', ngettext('%1 Player online', '%1 Players online', msg.cnt)));
    }

    private onMsgStreams(msg: MsgStreams) {
        this.streams = patch(this.streams, h('div#streams', msg.items.map(stream => this.streamView(stream))));
    }

    // private onMsgSpotlights(msg: MsgSpotlights) {
    //     this.spotlights = patch(this.spotlights, h('div#spotlights', [
    //         h('div', msg.items.map(spotlight => this.spotlightView(spotlight))),
    //         h('a.cont-link', { attrs: { href: '/calendar' } }, _('Tournament calendar') + ' »'),
    //     ]));
    // }
}

function seekHeader() {
    return h('thead', [
        h('tr', [
            // h('th', _('Player')),
            // h('th', _('Rating')),
            h('th', [
                h('span', _('Mode'))
            ]),
            h('th', [
                h('span', _('Time'))
            ]),
            h('th', [
                h('span', _('Opponent Color'))
            ])
        ])
    ]);
}

function runSeeks(vnode: VNode, model: PyChessModel) {
    const el = vnode.elm as HTMLElement;
    new LobbyController(el, model);
    // console.log("lobbyView() -> runSeeks()", el, model, ctrl);
}

export function lobbyView(model: PyChessModel): VNode[] {

    /* TODO move this to appropriate place
    // Get the modal
    const modal = document.getElementById('id01')!;

    // When the user clicks anywhere outside of the modal, close it
    document.addEventListener("click", function(event) {
        if (!modal.contains(event.target as Node))
            modal.style.display = "none";
    });
    */
   const cmgHOST = 'https://www.coolmathgames.com';

    return [
        // h('aside.sidebar-first', [
        // ]),
        h('div.seeks', [
            h('div#seeks-table', [
                h('div#seeks-wrapper',[
                    h('h3.seek-header',{},_("Join a Game")),
                    h('table#seeks', { hook: { insert: vnode => runSeeks(vnode, model) } })
                ]),
            ]),
        ]),
        // h('div#variants-catalog'),
        h('aside.sidebar-second',[h('div.active-player',[h('counter#u_cnt'), h('counter#g_cnt')]),
        h('div#seekbuttons'), h('div#chess_videos',[
            h('h3.chess_v_head',_("Chess Videos")),
            h('div.chess-v-body',[
                h('div.videos-sidebar-item',[
                    h('a',{attrs:{href:cmgHOST+'/chess-videos/start-the-game-strong-knights-and-bishops'}},[
                        h('img',{attrs:{src:cmgHOST+'/sites/cmatgame/files/video-play-icons/start_the_game_strong_play.png'}}),
                        h('h4',{},_('Start The Game Strong: Knights and Bishops'))
                    ])
                ]),
                h('div.videos-sidebar-item',[
                    h('a',{attrs:{href:cmgHOST+'/chess-videos/why-you-should-castle'}},[
                        h('img',{attrs:{src:cmgHOST+'/sites/cmatgame/files/video-play-icons/why_you_should_castle_play.png'}}),
                        h('h4',{},_('Why You Should Castle'))
                    ])
                ])
            ]),
            h('div.chess-v-footer',[
                h('a',{attrs:{href:'https://www.coolmathgames.com/chess-videos',target:"_blank"}},_("All Chess Videos >"))
            ])
        ]) ])
    ];
}
