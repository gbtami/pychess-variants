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
import { selectVariant, getPockets, needPockets, validFen, VARIANTS } from './chess';
import { boardSettings } from './boardSettings';
import { iniPieces } from './pieces';
import { updatePockets, Pockets } from './pocket';
import { copyBoardToPNG } from './png'; 


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
    pieces: any;
    vpieces0: any;
    vpieces1: any;
    vpocket0: any;
    vpocket1: any;
    vfen: any;
    vAnalysis: any;
    vChallenge: any;
    anon: boolean;
    flip: boolean;

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

        const dataIcon = VARIANTS[this.variant].icon(false);
        const container = document.getElementById('editor-button-container') as HTMLElement;
        if (container !== null) {
            const buttons = [
                h('a.i-pgn', { on: { click: () => this.setEmptyFen() } }, [
                    h('i', {class: {"icon": true, "icon-trash-o": true} }, _('CLEAR BOARD'))
                ]),
                h('a.i-pgn', { on: { click: () => this.setStartFen() } }, [
                    h('i', {attrs: {"data-icon": dataIcon} }, _('STARTING POSITION'))
                ]),
                h('a.i-pgn', { on: { click: () => this.setAnalysisFen() } }, [
                    h('i', {class: {"icon": true, "icon-microscope": true} }, _('ANALYSIS BOARD'))
                ]),
                h('a.i-pgn', { class: {disabled: this.anon}, on: { click: () => this.setChallengeFen() } }, [
                    h('i', {class: {"icon": true, "icon-bot": true} }, _('PLAY WITH MACHINE') + ((model["anon"] === 'True') ? _(' (must be signed in)') : ''))
                ]),
                h('a.i-pgn', { on: { click: () => copyBoardToPNG(this.parts.join(' ')) } }, [
                    h('i', {class: {"icon": true, "icon-download": true} }, _('EXPORT TO PNG'))
                ])
            ];
            patch(container, h('div.editor-button-container', buttons));
        }
    }

    // Remove accidentally selected leading spaces from FEN (mostly may happen on mobile)
    private onPasteFen = (e) => {
        const data = e.clipboardData.getData('text');
        e.target.value = data.trim();
        e.preventDefault();
        this.setFen(true);
    }

    private validFen = () => {
        const e = document.getElementById('fen') as HTMLInputElement;
        return validFen(this.variant, e.value);
    }

    private setInvalid = (invalid) => {
        this.vAnalysis = patch(this.vAnalysis, h('a#analysis', {class: {disabled: invalid}, on: {click: () => this.setAnalysisFen()}}));
        this.vChallenge = patch(this.vChallenge, h('a#challengeAI', {class: {disabled: invalid || this.anon}, on: {click: () => this.setChallengeFen()}}));
        const e = document.getElementById('fen') as HTMLInputElement;
        e.setCustomValidity(invalid ? _('Invalid FEN') : '');
    }

    private setStartFen = () => {
        this.parts = this.startfen.split(" ");
        this.pocketsPart = needPockets(this.variant) ? getPockets(this.startfen) : '';
        this.chessground.set({fen: this.parts[0]});
        const e = document.getElementById('fen') as HTMLInputElement;
        e.value = this.startfen;
        this.setInvalid(false);

        this.fullfen = e.value;
        if (needPockets(this.variant)) {
            updatePockets(this, this.vpocket0, this.vpocket1);
        }
    }

    private setEmptyFen = () => {
        const w = dimensions[VARIANTS[this.variant].geometry].width;
        const h = dimensions[VARIANTS[this.variant].geometry].height
        const empty_fen = (String(w) + '/').repeat(h);

        this.chessground.set({fen: empty_fen});
        this.pocketsPart = needPockets(this.variant) ? '[]' : '';
        this.parts[0] = this.chessground.getFen() + this.pocketsPart;
        if (this.parts.length > 2) this.parts[2] = '-';
        const e = document.getElementById('fen') as HTMLInputElement;
        e.value = this.parts.join(' ');
        this.setInvalid(true);

        this.fullfen = e.value;
        if (needPockets(this.variant)) {
            updatePockets(this, this.vpocket0, this.vpocket1);
        }
    }

    private setAnalysisFen = () => {
        //this.parts[0] = this.chessground.getFen() + this.pocketsPart;
        //this.variantFenChange();
        const fen = this.parts.join('_').replace(/\+/g, '.');
        window.location.assign(this.model["home"] + '/analysis/' + this.model["variant"] + '?fen=' + fen);
    }

    private setChallengeFen = () => {
        //this.parts[0] = this.chessground.getFen() + this.pocketsPart;
        //this.variantFenChange();
        const fen = this.parts.join('_').replace(/\+/g, '.');
        window.location.assign(this.model["home"] + '/@/Fairy-Stockfish/challenge/' + this.model["variant"] + '?fen=' + fen);
    }

    private setFen = (isInput) => {
        const e = document.getElementById('fen') as HTMLInputElement;
        if (isInput) {
            this.parts = e.value.split(' ');
            this.pocketsPart = (needPockets(this.variant) ? getPockets(e.value) : '');
            this.chessground.set({ fen: e.value });
            this.setInvalid(!this.validFen());

            this.fullfen = e.value;
            if (needPockets(this.variant)) {
                updatePockets(this, this.vpocket0, this.vpocket1);
            }
        } else {
            e.value = this.startfen;
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

    return [h('aside.sidebar-first', [
                h('div.container', [
                    h('div', [
                        h('label', { attrs: { for: "variant" } }, _("Variant")),
                        selectVariant("variant", vVariant, () => setVariant(true), () => setVariant(false)),
                    ]),
                ])
            ]),
            h('boardeditor', [
                h('div.pocket-wrapper', [
                    h('div.' + variant.piece + '.' + model["variant"], [
                        h('div.cg-wrap.pocket', [
                            h('div#pieces0'),
                        ]),
                    ]),
                ]),
                h('selection#board2png.' + variant.board + '.' + variant.piece, [
                    h('div.cg-wrap.' + variant.cg,
                        { hook: { insert: (vnode) => runEditor(vnode, model)},
                    }),
                ]),
                h('div.pocket-wrapper', [
                    h('div.' + variant.piece + '.' + model["variant"], [
                        h('div.cg-wrap.pocket', [
                            h('div#pieces1'),
                        ]),
                    ]),
                ]),
            ]),
            h('aside.sidebar-second', [
                h('div.editorhint', (needPockets(model['variant'])) ? _('Click/Ctrl+click to increase/decrease number of pieces') : ''),
                h('div.' + variant.piece + '.' + model["variant"], [
                    h('div.cg-wrap.pocket', [
                        h('div#pocket0'),
                    ]),
                ]),
                h('div#editor-button-container'),
                h('div.' + variant.piece + '.' + model["variant"], [
                    h('div.cg-wrap.pocket', [
                        h('div#pocket1'),
                    ]),
                ]),
            ]),
            h('under-board', [
                h('input#fen'),
            ]),
        ];
}
