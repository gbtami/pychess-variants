import Module from '../static/ffish.js';
import { init } from 'snabbdom';
import klass from 'snabbdom/modules/class';
import attributes from 'snabbdom/modules/attributes';
import properties from 'snabbdom/modules/props';
import listeners from 'snabbdom/modules/eventlisteners';

const patch = init([klass, attributes, properties, listeners]);

import h from 'snabbdom/h';
import { VNode } from 'snabbdom/vnode';

import { Chessground } from 'chessgroundx';
import { Api } from 'chessgroundx/api';
import { Color, Variant, dimensions, Notation } from 'chessgroundx/types';

import { _ } from './i18n';
import { selectVariant, getPockets, needPockets, validFen, VARIANTS, hasCastling, isVariantClass } from './chess';
import { boardSettings } from './boardSettings';
import { iniPieces } from './pieces';
import { updatePockets, Pockets } from './pocket';
import { copyBoardToPNG } from './png'; 
import { colorNames } from './profile';
import { variantsIni } from './variantsIni';


export default class EditorController {
    model;
    chessground: Api;
    fullfen: string;
    startfen: string;
    mycolor: Color;
    oppcolor: Color;
    parts: string[];
    castling: string;
    pocketsPart: string;
    pockets: Pockets;
    variant: string;
    hasPockets: boolean;
    vpieces0: VNode;
    vpieces1: VNode;
    vpocket0: VNode;
    vpocket1: VNode;
    vfen: VNode;
    vAnalysis: VNode;
    vChallenge: VNode;
    anon: boolean;
    flip: boolean;
    ffish;
    ffishBoard;

    constructor(el, model) {
        this.model = model;
        this.variant = model["variant"] as string;
        this.startfen = model["fen"] as string;
        this.flip = false;
        this.anon = model["anon"] === 'True';

        this.parts = this.startfen.split(" ");
        this.castling = this.parts.length > 2 ? this.parts[2] : '';
        this.fullfen = this.startfen;

        this.hasPockets = needPockets(this.variant);

        // pocket part of the FEN (including brackets)
        this.pocketsPart = (this.hasPockets) ? getPockets(this.startfen) : '';

        this.mycolor = 'white';
        this.oppcolor = 'black';

        this.chessground = Chessground(el, {
            fen: this.parts[0],
            autoCastle: false,
            variant: this.variant as Variant,
            geometry: VARIANTS[this.variant].geometry,
            notation: (this.variant === 'janggi') ? Notation.JANGGI : Notation.DEFAULT,
            orientation: this.mycolor,
            movable: {
                free: true,
            },
            events: {
                change: this.onChange,
            },
            selectable: {
                enabled: false
            },
            draggable: {
                deleteOnDropOff: true,
            },
        });

        boardSettings.ctrl = this;
        const boardFamily = VARIANTS[this.variant].board;
        const pieceFamily = VARIANTS[this.variant].piece;
        boardSettings.updateBoardStyle(boardFamily);
        boardSettings.updatePieceStyle(pieceFamily);
        boardSettings.updateZoom(boardFamily);

        // initialize pieces
        const pieces0 = document.getElementById('pieces0') as HTMLElement;
        const pieces1 = document.getElementById('pieces1') as HTMLElement;
        iniPieces(this, pieces0, pieces1);

        // initialize pockets
        if (needPockets(this.variant)) {
            const pocket0 = document.getElementById('pocket0') as HTMLElement;
            const pocket1 = document.getElementById('pocket1') as HTMLElement;
            updatePockets(this, pocket0, pocket1);
        }

        const e = document.getElementById('fen') as HTMLElement;
        this.vfen = patch(e,
            h('input#fen', {
                props: { name: 'fen', value: model["fen"] },
                on: { input: () => this.setFen(true), paste: (e) => this.onPasteFen(e) },
                hook: {insert: () => this.setFen(false) },
            }),
        );

        //const dataIcon = VARIANTS[this.variant].icon(false);
        const dataIcon = 'icon-' + this.variant;
        const container = document.getElementById('editor-button-container') as HTMLElement;
        const firstColor = colorNames(VARIANTS[this.variant].firstColor);
        const secondColor = colorNames(VARIANTS[this.variant].secondColor);
        if (container !== null) {
            const buttons = [
                h('div#turn-block', [
                    h('select#turn', {
                        props: { name: "turn" },
                        on: { change: (e) => this.onChangeTurn(e) },
                    }, [
                        h('option', { props: { value: 'white' } }, _('%1 to play', firstColor)),
                        h('option', { props: { value: 'black' } }, _('%1 to play', secondColor)),
                    ]),
                    (!hasCastling(this.variant, 'white')) ? '' :
                    h('strong', _("Castling")),
                    (!hasCastling(this.variant, 'white')) ? '' :
                    h('div.castling', [
                        h('label.OO', { attrs: { for: "wOO" } }, _("White") + " O-O"),
                        h('input#wOO', {
                            props: {name: "wOO", type: "checkbox"},
                            attrs: {checked: this.parts[2].includes('K')},
                            on: { change: () => this.onChangeCastl() },
                        }),
                        h('label.OOO', { attrs: { for: "wOOO" } }, "O-O-O"),
                        h('input#wOOO', {
                            props: {name: "wOOO", type: "checkbox"},
                            attrs: {checked: this.parts[2].includes('Q')},
                            on: { change: () => this.onChangeCastl() },
                        }),
                    ]),
                    (!hasCastling(this.variant, 'black')) ? '' :
                    h('div.castling', [
                        h('label.OO', { attrs: { for: "bOO" } }, _("Black") +  " O-O"),
                        h('input#bOO', {
                            props: {name: "bOO", type: "checkbox"},
                            attrs: {checked: this.parts[2].includes('k')},
                            on: { change: () => this.onChangeCastl() },
                        }),
                        h('label.OOO', { attrs: { for: "bOOO" } }, "O-O-O"),
                        h('input#bOOO', {
                            props: {name: "bOOO", type: "checkbox"},
                            attrs: {checked: this.parts[2].includes('q')},
                            on: { change: () => this.onChangeCastl() },
                        }),
                    ]),
                ]),

                h('a#clear.i-pgn', { on: { click: () => this.setEmptyFen() } }, [
                    h('div', {class: {"icon": true, "icon-trash-o": true} }, _('CLEAR BOARD'))
                ]),
                h('a#start.i-pgn', { on: { click: () => this.setStartFen() } }, [
                    h('div', {class: {"icon": true, [dataIcon]: true} }, _('STARTING POSITION'))
                ]),
                h('a#analysis.i-pgn', { on: { click: () => this.setAnalysisFen() } }, [
                    h('div', {class: {"icon": true, "icon-microscope": true} }, _('ANALYSIS BOARD'))
                ]),
                h('a#challengeAI.i-pgn', { on: { click: () => this.setChallengeFen() } }, [
                    h('div', {class: {"icon": true, "icon-bot": true} }, _('PLAY WITH MACHINE') + ((model["anon"] === 'True') ? _(' (must be signed in)') : ''))
                ]),
                h('a#pgn.i-pgn', { on: { click: () => copyBoardToPNG(this.parts.join(' ')) } }, [
                    h('div', {class: {"icon": true, "icon-download": true} }, _('EXPORT TO PNG'))
                ])
            ];
            patch(container, h('div.editor-button-container', buttons));

            new (Module as any)().then(loadedModule => {
                this.ffish = loadedModule;

                if (this.ffish !== null) {
                    this.ffish.loadVariantConfig(variantsIni);
                    this.ffishBoard = new this.ffish.Board(this.variant, this.fullfen, this.model.chess960 === 'True');
                }
            });
        }
    }

    private onChangeTurn = (e) => {
        this.parts[1] = (e.target.value === 'white') ? 'w' : 'b';
        this.onChange();
    }

    private onChangeCastl = () => {
        const castlings = {
            'wOO': 'K',
            'wOOO': 'Q',
            'bOO': 'k',
            'bOOO': 'q',
        }
        const castl: string[] = [];
        for (const key in castlings) {
            const el = document.getElementById(key) as HTMLInputElement;
            // There are no black castlings in asymmetric variants!
            if (el !== null && el.checked) {
                castl.push(castlings[key]);
            }
        }

        let gatings = '';
        if (this.parts.length > 2) {
            const gatingLetters = this.parts[2].match(/[A-H,a-h]/g);
            if (gatingLetters !== null) gatings = gatingLetters.join('');
        }

        this.parts[2] = castl.join('') + gatings;
        if (this.parts[2].length === 0) this.parts[2] = '-';
        this.onChange();
    }

    // Remove accidentally selected leading spaces from FEN (mostly may happen on mobile)
    private onPasteFen = (e) => {
        const data = e.clipboardData.getData('text');
        e.target.value = data.trim();
        e.preventDefault();
        this.setFen(true);
    }

    private validFen = () => {
        let valid = false;
        const fen = (document.getElementById('fen') as HTMLInputElement).value;
        valid = validFen(this.variant, fen);
        if (valid) {
            // try to catch more invalid stuff using ffish.js
            try {
                const ffValid = this.ffish.validateFen(fen, this.variant);
                if (ffValid !== 1 && !(isVariantClass(this.variant, 'gate') && ffValid == -5)) return false;

                this.ffishBoard.setFen(fen);
                const fenPlacement = fen.split(' ')[0].split('[')[0];
                const ffishPlacement = this.ffishBoard.fen().split(' ')[0].split('[')[0];

                if (fenPlacement !== ffishPlacement) {
                    valid = false;
                    console.log('fenPlacement !== ffishPlacement', fenPlacement, ffishPlacement);
                }
            } catch (error) {
                console.log("validFen() failed on FEN:", fen);
                valid = false;
            }
        }
        return valid;
    }

    private setInvalid = (invalid) => {
        const analysis = document.getElementById('analysis') as HTMLElement;
        analysis.classList.toggle('disabled', invalid);

        const challenge = document.getElementById('challengeAI') as HTMLElement;
        challenge.classList.toggle('disabled', invalid || this.anon);

        const e = document.getElementById('fen') as HTMLInputElement;
        e.setCustomValidity(invalid ? _('Invalid FEN') : '');
    }

    private setStartFen = () => {
        const e = document.getElementById('fen') as HTMLInputElement;
        e.value = this.startfen;
        this.setFen(true);
    }

    private setEmptyFen = () => {
        const w = dimensions[VARIANTS[this.variant].geometry].width;
        const h = dimensions[VARIANTS[this.variant].geometry].height
        const empty_fen = (String(w) + '/').repeat(h);

        this.pocketsPart = needPockets(this.variant) ? '[]' : '';
        this.parts[0] = empty_fen + this.pocketsPart;
        this.parts[1] = 'w'
        if (this.parts.length > 2) this.parts[2] = '-';
        const e = document.getElementById('fen') as HTMLInputElement;
        e.value = this.parts.join(' ');
        this.setFen(true);
    }

    private setAnalysisFen = () => {
        const fen = this.parts.join('_').replace(/\+/g, '.');
        window.location.assign(this.model["home"] + '/analysis/' + this.model["variant"] + '?fen=' + fen);
    }

    private setChallengeFen = () => {
        const fen = this.parts.join('_').replace(/\+/g, '.');
        window.location.assign(this.model["home"] + '/@/Fairy-Stockfish/challenge/' + this.model["variant"] + '?fen=' + fen);
    }

    private setFen = (isInput) => {
        const fen = document.getElementById('fen') as HTMLInputElement;
        if (isInput) {
            this.parts = fen.value.split(' ');
            this.pocketsPart = (needPockets(this.variant) ? getPockets(fen.value) : '');
            this.chessground.set({ fen: fen.value });
            this.setInvalid(!this.validFen());

            if (this.parts.length > 1) {
                const turn = document.getElementById('turn') as HTMLInputElement;
                turn.value = (this.parts[1] === 'w') ? 'white' : 'black';
            }

            this.fullfen = fen.value;
            if (needPockets(this.variant)) {
                updatePockets(this, this.vpocket0, this.vpocket1);
            }

            if (hasCastling(this.variant, 'white')) {
                if (this.parts.length >= 3) {
                    const castlings = {
                        'K': 'wOO',
                        'Q': 'wOOO',
                        'k': 'bOO',
                        'q': 'bOOO',
                    }
                    for (const key in castlings) {
                        const el = document.getElementById(castlings[key]) as HTMLInputElement;
                        // There are no black castlings in asymmetric variants!
                        if (el !== null) el.checked = this.parts[2].includes(key);
                    }
                }
            }
        } else {
            fen.value = this.startfen;
        }
    }

    onChange = () => {
        // onChange() will get then set and validate FEN from chessground pieces
        this.chessground.set({lastMove: []});
        this.parts[0] = this.chessground.getFen() + this.pocketsPart;
        this.variantFenChange();
        const e = document.getElementById('fen') as HTMLInputElement;
        e.value = this.parts.join(' ');
        this.setInvalid(!this.validFen());
    }

    private variantFenChange = () => {
        if (this.variant === "makruk" || this.variant === "makpong" || this.variant === "cambodian") {
            this.parts[0] = this.parts[0].replace(/F/g, "M~").replace(/f/g, "m~");
        }
    }
}

function runEditor(vnode: VNode, model) {
    const el = vnode.elm as HTMLElement;
    const ctrl = new EditorController(el, model);
    const cg = ctrl.chessground;
    window['cg'] = cg;
}


export function editorView(model): VNode[] {

    const setVariant = (isInput) => {
        let e;
        e = document.getElementById('variant') as HTMLSelectElement;
        const variant = e.options[e.selectedIndex].value;
        if (isInput) window.location.assign('/editor/' + variant);
    }

    const vVariant = model.variant || "chess";
    const variant = VARIANTS[vVariant];

    return [
        h('div.editor-app', [
            h('aside.sidebar-first', [
                h('div.container', [
                    h('div', [
                        h('label', { attrs: { for: "variant" } }, _("Variant")),
                        selectVariant("variant", vVariant, () => setVariant(true), () => setVariant(false)),
                    ]),
                ])
            ]),

            h('div.pocket-wrapper.top', [
                h('div.' + variant.piece + '.' + model["variant"], [
                    h('div.cg-wrap.pocket', [
                        h('div#pieces0'),
                    ]),
                ]),
            ]),
            h('selection#mainboard.' + variant.board + '.' + variant.piece, [
                h('div.cg-wrap.' + variant.cg,
                    { hook: { insert: (vnode) => runEditor(vnode, model)},
                }),
            ]),
            h('div.pocket-wrapper.bot', [
                h('div.' + variant.piece + '.' + model["variant"], [
                    h('div.cg-wrap.pocket', [
                        h('div#pieces1'),
                    ]),
                ]),
            ]),

            h('div.editorhint', (needPockets(model['variant'])) ? _('Click/Ctrl+click to increase/decrease number of pieces') : ''),
            h('div.pocket-top', [
                h('div.' + variant.piece + '.' + model["variant"], [
                    h('div.cg-wrap.pocket', [
                        h('div#pocket0'),
                    ]),
                ]),
            ]),
            h('div#editor-button-container'),
            h('div.pocket-bot', [
                h('div.' + variant.piece + '.' + model["variant"], [
                    h('div.cg-wrap.pocket', [
                        h('div#pocket1'),
                    ]),
                ]),
            ]),
            h('under-board', [
                h('input#fen'),
            ]),
        ]),
    ];
}
