import Sockette from 'sockette';

import { init } from 'snabbdom';
import klass from 'snabbdom/modules/class';
import attributes from 'snabbdom/modules/attributes';
import properties from 'snabbdom/modules/props';
import listeners from 'snabbdom/modules/eventlisteners';

const patch = init([klass, attributes, properties, listeners]);

import { h } from 'snabbdom/h';
import { VNode } from 'snabbdom/vnode';

import { Chessground } from 'chessgroundx';

import { _, _n } from './i18n';
import { chatMessage, chatView } from './chat';
import { enabled_variants, validFen, variants960, SHOGI_HANDICAP_NAME, SHOGI_HANDICAP_FEN , VARIANTS, isVariantClass } from './chess';
import { sound } from './sound';
import { boardSettings } from './boardSettings';
import { debounce } from './document';

class LobbyController {
    test_ratings: boolean;
    model;
    sock;
    player;
    logged_in;
    challengeAI: boolean;
    _ws;
    seeks;

    constructor(el, model) {
        console.log("LobbyController constructor", el, model);
        // enable for local testong only !!!
        // this.test_ratings = true;
        this.test_ratings = false;

        this.model = model;
        this.challengeAI = false;

        const onOpen = (evt) => {
            this._ws = evt.target;
            // console.log("---CONNECTED", evt);
            this.doSend({ type: "lobby_user_connected", username: this.model["username"]});
            this.doSend({ type: "get_seeks" });

            window.addEventListener("resize", debounce(resizeSeeksHeader, 10));
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

        const ws = (location.host.indexOf('pychess') === -1) ? 'ws://' : 'wss://';
        this.sock = new Sockette(ws + location.host + "/wsl", opts);

        // get seeks when we are coming back after a game
        if (this._ws.readyState === 1) {
            this.doSend({ type: "get_seeks" });
        };
        patch(document.getElementById('seekbuttons') as HTMLElement, h('div#seekbuttons', this.renderSeekButtons()));
        patch(document.getElementById('lobbychat') as HTMLElement, chatView(this, "lobbychat"));

        // challenge!
        const anon = this.model["anon"] === 'True';
        if (model["profileid"] !== '') {
            this.challengeAI = model["profileid"] === 'Fairy-Stockfish';
            document.getElementById('game-mode')!.style.display = (anon || this.challengeAI) ? 'none' : 'inline-flex';
            document.getElementById('challenge-block')!.style.display = 'inline-flex';
            document.getElementById('ailevel')!.style.display = this.challengeAI ? 'block' : 'none';
            document.getElementById('id01')!.style.display = 'block';
        }

        const e = document.getElementById("fen") as HTMLInputElement;
        if (this.model["fen"] !== "")
            e.value = this.model["fen"];
        if (anon)
            e.disabled = true;
    }

    doSend(message) {
        // console.log("---> lobby doSend():", message);
        this.sock.send(JSON.stringify(message));
    }

    createSeekMsg(variant, color, fen, minutes, increment, byoyomiPeriod, chess960, rated, handicap) {
        this.doSend({
            type: "create_seek",
            user: this.model["username"],
            target: this.model["profileid"],
            variant: variant,
            fen: fen,
            minutes: minutes,
            increment: increment,
            byoyomi_period: byoyomiPeriod,
            rated: rated,
            handicap: handicap,
            chess960: chess960,
            color: color });
    }

    createBotChallengeMsg(variant, color, fen, minutes, increment, byoyomiPeriod, level, chess960, rated, handicap) {
        this.doSend({
            type: "create_ai_challenge",
            user: this.model["username"],
            variant: variant,
            fen: fen,
            minutes: minutes,
            increment: increment,
            byoyomi_period: byoyomiPeriod,
            rated: rated,
            handicap: handicap,
            level: level,
            chess960: chess960,
            color: color
        });
    }

    isNewSeek(variant, color, fen, minutes, increment, byoyomiPeriod, chess960, rated) {
        // console.log("isNewSeek()?", variant, color, fen, minutes, increment, byoyomiPeriod, chess960, rated);
        // console.log(this.seeks);
        return !this.seeks.some(seek =>
            seek.user === this.model["username"] && 
            seek.variant === variant &&
            seek.fen === fen &&
            seek.color === color &&
            seek.tc === minutes + "+" + ((byoyomiPeriod > 1) ? (byoyomiPeriod + "x") : "") + increment + ((byoyomiPeriod > 0) ? "(b)" : "") &&
            seek.chess960 === chess960 &&
            seek.rated === rated
        );
    }

    createSeek(color) {
        document.getElementById('id01')!.style.display='none';
        let e;
        e = document.getElementById('variant') as HTMLSelectElement;
        const variant = e.options[e.selectedIndex].value;
        localStorage.setItem("seek_variant", variant);

        let seekColor;
        if (variant.endsWith('shogi') && color !== 'r') {
            seekColor = (color === 'w') ? 'b' : 'w';
        } else {
            seekColor = color;
        }

        e = document.getElementById('fen') as HTMLInputElement;
        const fen = e.value;

        let handicap;
        if (variant == 'shogi') {
            e = document.getElementById('handicap') as HTMLSelectElement;
            handicap = e.options[e.selectedIndex].value;
        } else {
            handicap = '';
        }

        e = document.getElementById('min') as HTMLInputElement;
        const minutes = parseInt(e.value);
        localStorage.setItem("seek_min", e.value);

        e = document.getElementById('inc') as HTMLInputElement;
        const increment = parseInt(e.value);
        localStorage.setItem("seek_inc", e.value);

        e = document.getElementById('byo') as HTMLInputElement;
        const byoyomi = isVariantClass(variant, 'byoyomi');
        const byoyomiPeriod = (byoyomi && increment > 0) ? parseInt(e.value) : 0;
        localStorage.setItem("seek_byo", e.value);

        e = document.querySelector('input[name="mode"]:checked') as HTMLInputElement;
        let rated = 0;
        if (this.test_ratings) {
            rated = parseInt(e.value);
        } else {
            rated = (this.challengeAI || this.model["anon"] === 'True' || this.model["title"] === 'BOT' || fen !== '') ? 0 : parseInt(e.value);
        }
        localStorage.setItem("seek_rated", e.value);

        e = document.getElementById('chess960') as HTMLInputElement;
        const hide = variants960.indexOf(variant) === -1;
        const chess960 = (hide) ? false : e.checked;
        localStorage.setItem("seek_chess960", e.checked);

        // console.log("CREATE SEEK variant, color, fen, minutes, increment, hide, chess960", variant, color, fen, minutes, increment, chess960, rated);

        if (this.challengeAI) {
            e = document.querySelector('input[name="level"]:checked') as HTMLInputElement;
            const level = parseInt(e.value);
            localStorage.setItem("seek_level", e.value);
            // console.log(level, e.value, localStorage.getItem("seek_level"));
            this.createBotChallengeMsg(variant, seekColor, fen, minutes, increment, byoyomiPeriod, level, chess960, rated===1, handicap);
        } else {
            if (this.isNewSeek(variant, seekColor, fen, minutes, increment, byoyomiPeriod, chess960, rated===1)) {
                this.createSeekMsg(variant, seekColor, fen, minutes, increment, byoyomiPeriod, chess960, rated===1, handicap);
            }
        }
        // prevent to create challenges continuously
        this.model["profileid"] = '';
        window.history.replaceState({}, this.model['title'], this.model["home"] + '/');
    }

    renderSeekButtons() {
        let vIdx: number;
        if (this.model["variant"])
            vIdx = enabled_variants.sort().indexOf(this.model["variant"]);
        else if (localStorage.seek_variant)
            vIdx = enabled_variants.sort().indexOf(localStorage.seek_variant);
        else
            vIdx = 0;

        const vMin = localStorage.seek_min ?? "5";
        const vInc = localStorage.seek_inc ?? "3";
        const vByoIdx = (localStorage.seek_byo ?? 1) - 1;
        const vRated = localStorage.seek_rated ?? "0";
        const vLevel = Number(localStorage.seek_level ?? "1");
        const vChess960 = localStorage.seek_chess960 ?? "false";

        const anon = this.model["anon"] === 'True';

        return [
            h('div#id01.modal', [
                h('form.modal-content', [
                    h('div#closecontainer', [
                        h('span.close', {
                            on: {
                                click: () => {
                                    document.getElementById('id01')!.style.display='none';
                                    // prevent to create challenges continuously
                                    this.model["profileid"] = '';
                                    window.history.replaceState({}, this.model['title'], '/');
                                }
                            },
                            attrs: { 'data-icon': 'j' }, props: { title: _("Cancel") }
                        }),
                    ]),
                    h('div.container', [
                        h('div#challenge-block', [
                            h('h3', _('Challenge %1 to a game', this.model["profileid"])),
                        ]),
                        h('div', [
                            h('label', { attrs: { for: "variant" } }, _("Variant")),
                            h('select#variant', {
                                props: { name: "variant" },
                                on: { input: () => this.setVariant() },
                                hook: { insert: () => this.setVariant() },
                            },
                                enabled_variants.sort().map((variant, idx) =>
                                    h('option', {
                                        props: {
                                            value: variant,
                                            title: VARIANTS[variant].tooltip,
                                        },
                                        attrs: {
                                            selected: idx === vIdx
                                        },
                                    },
                                        VARIANTS[variant].displayName(false),
                                    )
                                )
                            ),
                        ]),
                        h('input#fen', {
                            props: { name: 'fen', placeholder: _('Paste the FEN text here') + (anon ? _(' (must be signed in)') : ''),  autocomplete: "off" },
                            on: { input: () => this.setFen() },
                        }),
                        h('div#handicap-block', [
                            h('label', { attrs: { for: "handicap" } }, _("Handicap")),
                            h('select#handicap', {
                                props: { name: "handicap" },
                                on: { input: () => this.setHandicap() },
                                hook: { insert: () => this.setHandicap() },
                            },
                                SHOGI_HANDICAP_NAME.map(handicap => h('option', { props: { value: handicap } }, handicap))),
                        ]),
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
                            props: { name: "min", type: "range", min: 0, max: 60, value: vMin },
                            on: { input: e => this.setMinutes((e.target as HTMLInputElement).value) },
                            hook: { insert: vnode => this.setMinutes((vnode.elm as HTMLInputElement).value) },
                        }),
                        h('label#incrementlabel', { attrs: { for: "inc" } }, ''),
                        h('span#increment'),
                        h('input#inc.slider', {
                            props: { name: "inc", type: "range", min: 0, max: 60, value: vInc },
                            on: { input: e => this.setIncrement((e.target as HTMLInputElement).value) },
                            hook: { insert: vnode => this.setIncrement((vnode.elm as HTMLInputElement).value) },
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
                                h('input#casual', { props: { type: "radio", name: "mode", value: "0" }, attrs: { checked: vRated === "0" }, }),
                                h('label', { attrs: { for: "casual"} }, _("Casual")),
                                h('input#rated', { props: { type: "radio", name: "mode", value: "1" }, attrs: { checked: vRated === "1" }, }),
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
                        this.challengeAI = true;
                        document.getElementById('game-mode')!.style.display = (!this.test_ratings || anon) ? 'none' : 'inline-flex';
                        document.getElementById('challenge-block')!.style.display = 'none';
                        document.getElementById('ailevel')!.style.display = 'inline-block';
                        document.getElementById('id01')!.style.display = 'block';
                    }
                }
            }, _("Play with AI (Fairy-Stockfish)")),
        ];
    }

    private setHandicap() {
        let e;
        e = document.getElementById('handicap') as HTMLSelectElement;
        const handicap = e.options[e.selectedIndex].value;
        e = document.getElementById('fen') as HTMLSelectElement;
        e!.value = SHOGI_HANDICAP_FEN[handicap];
    }
    private setVariant() {
        let e;
        e = document.getElementById('variant') as HTMLSelectElement;
        const variant = e.options[e.selectedIndex].value;
        const hide960 = variants960.indexOf(variant) === -1;
        const hideHandicap = variant !== 'shogi';
        const byoyomi = isVariantClass(variant, 'byoyomi');
        document.getElementById('chess960-block')!.style.display = (hide960) ? 'none' : 'block';
        document.getElementById('handicap-block')!.style.display = (hideHandicap) ? 'none' : 'block';
        document.getElementById('byoyomi-period')!.style.display = (byoyomi) ? 'block' : 'none';
        e = document.getElementById('incrementlabel') as HTMLSelectElement;
        patch(e, h('label#incrementlabel', { attrs: {for: "inc"} }, ((byoyomi) ? _('Byoyomi in seconds:') : _('Increment in seconds:'))));
        this.setStartButtons();
    }
    private setMinutes(minutes) {
        const el = document.getElementById("minutes") as HTMLElement;
        if (el) el.innerHTML = minutes;
        this.setStartButtons();
    }
    private setIncrement(increment) {
        const el = document.getElementById("increment") as HTMLElement;
        if (el) el.innerHTML = increment;
        this.setStartButtons();
    }
    private setFen() {
        const e = document.getElementById('fen') as HTMLInputElement;
        e.setCustomValidity(this.validateFen() ? '' : _('Invalid FEN'));
        this.setStartButtons();
    }
    private setStartButtons() {
        const valid = this.validateTimeControl() && this.validateFen();
        const e = document.getElementById('color-button-group') as HTMLElement;
        if (valid)
            e.classList.remove("disabled");
        else
            e.classList.add("disabled");
    }
    private validateTimeControl() {
        let min = 0, inc = 0;
        let e;
        e = document.getElementById('min') as HTMLInputElement;
        if (e) min = Number(e.value);
        e = document.getElementById('inc') as HTMLInputElement;
        if (e) inc = Number(e.value);
        return min + inc > ((this.challengeAI) ? 4 : 0);
    }
    private validateFen() {
        let e;
        e = document.getElementById('variant') as HTMLSelectElement;
        const variant = e.options[e.selectedIndex].value;
        e = document.getElementById('fen') as HTMLInputElement;
        return e.value === "" || validFen(variant, e.value);
    }

    renderSeeks(seeks) {
        seeks.sort((a, b) => (a.bot && !b.bot) ? 1 : -1);
        const rows = seeks.map(seek => this.seekView(seek));
        return [ this.seekHeader(), h('tbody', rows) ];
    }

    private seekHeader() {
        return h('thead', [
            h('tr', [
                h('th', ''),
                h('th', _('Player')),
                h('th', _('Rating')),
                h('th', _('Time')),
                h('th', _('Variant')),
                h('th', _('Mode'))
            ])
        ]);
    }

    private seekView(seek) {
        const variant = VARIANTS[seek.variant];
        const chess960 = seek.chess960;
        let tooltipImage;
        if (seek["fen"]) {
            tooltipImage = h('minigame.' + variant + '-board.' + variant.piece, [
                h('div.cg-wrap.' + variant.cg + '.mini',
                    { hook: { insert: (vnode) => Chessground(vnode.elm as HTMLElement, { coordinates: false, fen: seek["fen"], geometry: variant.geometry }) } }
                ),
            ]);
        }
        else {
            tooltipImage = '';
        }
        const tooltip = h('span.tooltiptext', [ tooltipImage ]);
        return this.hide(seek) ? "" : h('tr', {
            on: { click: () => this.onClickSeek(seek) }
        }, [
            h('td', [ this.colorIcon(seek["color"]) ]),
            h('td', [ this.challengeIcon(seek), this.title(seek), this.user(seek) ]),
            h('td', seek["rating"]),
            h('td', seek["tc"]),
            h('td.icon', { attrs: { "data-icon": variant.icon(chess960) } }, " " + variant.displayName(chess960)),
            h('td', { class: { "tooltip": seek["fen"] } }, [
                tooltip,
                (seek["handicap"]) ? seek["handicap"] : (seek["fen"]) ? _('Custom') : (seek["rated"]) ? _('Rated') : _('Casual')
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
    };
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

    private onMsgGetSeeks(msg) {
        this.seeks = msg.seeks;
        // console.log("!!!! got get_seeks msg:", msg);

        const oldSeeks = document.getElementById('seeks') as Element;
        oldSeeks.innerHTML = "";
        patch(oldSeeks, h('table#seeks', this.renderSeeks(msg.seeks)));
    }
    private onMsgNewGame(msg) {
        // console.log("LobbyController.onMsgNewGame()", this.model["gameId"])
        window.location.assign('/' + msg["gameId"]);
    }
    private onMsgGameInProgress(msg) {
        const response = confirm(_("You have an unfinished game!\nPress OK to continue."));
        if (response === true)
            window.location.assign('/' + msg["gameId"]);
    }
    private onMsgUserConnected(msg) {
        this.model["username"] = msg["username"];
    }
    private onMsgChat(msg) {
        chatMessage(msg.user, msg.message, "lobbychat");
        if (msg.user.length !== 0 && msg.user !== '_server')
            sound.chat();
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
        console.log("Gcnt=", msg["cnt"]);
        const oldVNode = document.getElementById('g_cnt');
        if (oldVNode instanceof Element) {
            // oldVNode.innerHTML = '';
            patch(oldVNode as HTMLElement, h('counter#g_cnt', _n('%1 game in play', '%1 games in play', msg["cnt"])));
        }
    }
    private onMsgUserCounter(msg) {
        console.log("Ucnt=", msg["cnt"]);
        const oldVNode = document.getElementById('u_cnt');
        if (oldVNode instanceof Element) {
            // oldVNode.innerHTML = '';
            patch(oldVNode as HTMLElement, h('counter#u_cnt', _n('%1 player', '%1 players', msg["cnt"])));
        }
    }

}

function runSeeks(vnode: VNode, model) {
    const el = vnode.elm as HTMLElement;
    const ctrl = new LobbyController(el, model);
    console.log("lobbyView() -> runSeeks()", el, model, ctrl);
}

export function lobbyView(model): VNode[] {
    // Get the modal
    const modal = document.getElementById('id01')!;

    // When the user clicks anywhere outside of the modal, close it
    window.onclick = function(event) {
        if (event.target == modal) {
            modal.style.display = "none";
        }
    }
    boardSettings.updateBoardAndPieceStyles();

    return [
        h('aside.sidebar-first', [ h('div#lobbychat.lobbychat') ]),
        h('div.seeks', [
            h('div#seeks-table', [
                h('table#seeks-header', {
                    hook: { insert: _ => resizeSeeksHeader() },
                }, [
                    h('thead', [
                        h('tr', [
                            h('th', ''),
                            h('th', _('Player')),
                            h('th', _('Rating')),
                            h('th', _('Time')),
                            h('th', _('Variant')),
                            h('th', _('Mode')),
                        ]),
                    ]),
                ]),
                h('div#seeks-wrapper', [ h('table#seeks', { hook: { insert: vnode => runSeeks(vnode, model) } }) ]),
            ]),
        ]),
        h('aside.sidebar-second', [ h('div#seekbuttons') ]),
        h('under-left', [
            h('a.reflist', { attrs: { href: 'https://discord.gg/aPs8RKr' } }, 'Discord'),
            h('a.reflist', { attrs: { href: 'https://github.com/gbtami/pychess-variants' } }, 'Github'),
            h('a.reflist', { attrs: { href: '/patron' } }, _("Donate")),
            h('a.reflist', { attrs: { href: '/stats' } }, _("Stats")),
        ]),
        h('under-lobby'),
        h('under-right', [
            h('a', { attrs: { href: '/players' } }, [ h('counter#u_cnt', _('0 players')) ]),
            h('a', { attrs: { href: '/games' } }, [ h('counter#g_cnt', _('0 games in play')) ]),
        ]),
    ];
}

function resizeSeeksHeader() {
    const seeksHeader = document.getElementById('seeks-header') as HTMLElement;
    const seeks = document.getElementById('seeks') as HTMLElement;
    seeksHeader.style.width = seeks.clientWidth + 'px';
}
