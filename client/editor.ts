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
import { copyBoardToPNG } from './png'; 


export default class EditorController {
    model;
    flip;
    chessground: Api;
    startfen: string;
    mycolor: Color;
    oppcolor: Color;
    parts: string[];
    castling: string;
    pockets: string;
    variant: string;
    pieces: any;
    vpocket0: any;
    vpocket1: any;
    vfen: any;
    vAnalysis: any;
    vChallenge: any;
    anon: boolean;

    constructor(el, model) {
        this.model = model;
        this.variant = model["variant"] as string;
        this.startfen = model["fen"] as string;
        this.flip = false;
        this.anon = model["anon"] === 'True';

        this.parts = this.startfen.split(" ");
        this.castling = this.parts.length > 2 ? this.parts[2] : '';
        this.pockets = needPockets(this.variant) ? getPockets(this.startfen) : '';

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
        const pocket0 = document.getElementById('pocket0') as HTMLElement;
        const pocket1 = document.getElementById('pocket1') as HTMLElement;
        iniPieces(this, pocket0, pocket1);

        let e = document.getElementById('fen') as HTMLElement;
        this.vfen = patch(e,
            h('input#fen', {
                props: { name: 'fen', value: model["fen"] },
                on: { input: () => this.setFen(true) },
                hook: {insert: () => this.setFen(false) },
            }),
        );

        e = document.getElementById('clear') as HTMLElement;
        patch(e, h('div', [h('a', {on: {click: () => this.setEmptyFen()}}, _('CLEAR BOARD'))]));

        e = document.getElementById('start') as HTMLElement;
        patch(e, h('div', [h('a', {on: {click: () => this.setStartFen()}}, _('STARTING POSITION'))]));

        e = document.getElementById('analysis') as HTMLElement;
        this.vAnalysis = patch(e, h('div', [h('a', {on: {click: () => this.setAnalysisFen()}}, _('ANALYSIS BOARD'))]));

        e = document.getElementById('challenge') as HTMLElement;
        const text = _('PLAY WITH MACHINE') + ((this.anon) ? _(' (must be signed in)') : '');
        this.vChallenge = patch(e, h('div', [h('a', {class: {disabled: this.anon}, on: {click: () => this.setChallengeFen()}}, text)]));

        e = document.getElementById('png') as HTMLElement;
        patch(e, h('div', [h('a', {on: {click: () => copyBoardToPNG(this.parts.join(' '))}}, _('EXPORT TO PNG'))]));

    }

    private validFen = () => {
        const e = document.getElementById('fen') as HTMLInputElement;
        return validFen(this.variant, e.value);
    }

    private setInvalid = (invalid) => {
        const text = _('PLAY WITH MACHINE') + ((this.anon) ? _(' (must be signed in)') : '');
        this.vAnalysis = patch(this.vAnalysis, h('div', [h('a', {class: {disabled: invalid}, on: {click: () => this.setAnalysisFen()}}, _('ANALYSIS BOARD'))]));
        this.vChallenge = patch(this.vChallenge, h('div', [h('a', {class: {disabled: invalid || this.anon}, on: {click: () => this.setChallengeFen()}}, text)]));
        const e = document.getElementById('fen') as HTMLInputElement;
        e.setCustomValidity(invalid ? _('Invalid FEN') : '');
    }

    private setStartFen = () => {
        this.parts = this.startfen.split(" ");
        this.pockets = needPockets(this.variant) ? getPockets(this.startfen) : '';
        this.chessground.set({fen: this.parts[0]});
        const e = document.getElementById('fen') as HTMLInputElement;
        e.value = this.startfen;
        this.setInvalid(false);
    }

    private setEmptyFen = () => {
        const w = dimensions[VARIANTS[this.variant].geometry].width;
        const h = dimensions[VARIANTS[this.variant].geometry].height
        const empty_fen = (String(w) + '/').repeat(h);

        this.chessground.set({fen: empty_fen});
        this.pockets = needPockets(this.variant) ? '[]' : '';
        this.parts[0] = this.chessground.getFen() + this.pockets;
        if (this.parts.length > 2) this.parts[2] = '-';
        const e = document.getElementById('fen') as HTMLInputElement;
        e.value = this.parts.join(' ');
        this.setInvalid(true);
    }

    private setAnalysisFen = () => {
        //this.parts[0] = this.chessground.getFen() + this.pockets;
        //this.variantFenChange();
        const fen = this.parts.join('_').replace(/\+/g, '.');
        window.location.assign(this.model["home"] + '/analysis/' + this.model["variant"] + '?fen=' + fen);
    }

    private setChallengeFen = () => {
        //this.parts[0] = this.chessground.getFen() + this.pockets;
        //this.variantFenChange();
        const fen = this.parts.join('_').replace(/\+/g, '.');
        window.location.assign(this.model["home"] + '/@/Fairy-Stockfish/challenge/' + this.model["variant"] + '?fen=' + fen);
    }

    private setFen = (isInput) => {
        const e = document.getElementById('fen') as HTMLInputElement;
        if (isInput) {
            this.parts = e.value.split(' ');
            this.pockets = (needPockets(this.variant) ? getPockets(e.value) : '');
            this.chessground.set({ fen: e.value });
            this.setInvalid(!this.validFen());
        } else {
            e.value = this.startfen;
        }
    }

    private onChange = () => {
        // onChange() will get then set and validate FEN from chessground pieces
        this.chessground.set({lastMove: []});
        this.parts[0] = this.chessground.getFen() + this.pockets;
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
                    h('div.' + VARIANTS[model["variant"]].piece + '.' + model["variant"], [
                        h('div.cg-wrap.pocket', [
                            h('div#pocket0'),
                        ]),
                    ]),
                ]),
                h('selection#board2png.' + VARIANTS[model["variant"]].board + '.' + VARIANTS[model["variant"]].piece, [
                    h('div.cg-wrap.' + VARIANTS[model["variant"]].cg,
                        { hook: { insert: (vnode) => runEditor(vnode, model)},
                    }),
                ]),
                h('div.pocket-wrapper', [
                    h('div.' + VARIANTS[model["variant"]].piece + '.' + model["variant"], [
                        h('div.cg-wrap.pocket', [
                            h('div#pocket1'),
                        ]),
                    ]),
                ]),
            ]),
            h('aside.sidebar-second', [
                h('div.editor-button-container', [
                    h('div#clear'),
                    h('div#start'),
//                    h('div', [h('a', {attrs: {href: '/editor/' + model["variant"]}}, 'CREATE A GAME')]),
                    h('div#analysis'),
                    h('div#challenge'),
                    h('div#png'),
                ])
            ]),
            h('under-board', [
                h('input#fen'),
            ]),
        ];
}
