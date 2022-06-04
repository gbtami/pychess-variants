import { h, VNode } from 'snabbdom';

import * as cg from 'chessgroundx/types';
import * as util from 'chessgroundx/util';

import { _ } from './i18n';
import { validFen, hasCastling, unpromotedRole, promotedRole, notation } from './chess'
import { diff, calculatePieceNumber } from './material';
import { iniPieces } from './pieces';
import { copyBoardToPNG } from './png';
import { patch } from './document';
import { PyChessModel } from "./types";
import { ChessgroundController } from './cgCtrl';

export class EditorController extends ChessgroundController {
    model;
    startfen: string;
    parts: string[];
    castling: string;
    vpieces0: VNode;
    vpieces1: VNode;
    vfen: VNode;
    vAnalysis: VNode;
    vChallenge: VNode;

    constructor(el: HTMLElement, model: PyChessModel) {
        super(el, model);
        this.model = model;
        this.startfen = model["fen"] as string;

        this.parts = this.startfen.split(" ");
        this.castling = this.parts.length > 2 ? this.parts[2] : '';

        this.notation = notation(this.variant);

        this.chessground.set({
            autoCastle: false,
            orientation: this.mycolor,
            movable: {
                free: true,
            },
            events: {
                change: this.onChange,
                select: this.onSelect(),
            },
            selectable: {
                enabled: false
            },
            draggable: {
                deleteOnDropOff: true,
            },
        });

        //
        ['mouseup', 'touchend'].forEach(name =>
            [this.chessground.state.dom.elements.pocketTop, this.chessground.state.dom.elements.pocketBottom].forEach(pocketEl => {
                if (pocketEl) pocketEl.addEventListener(name, (e: cg.MouchEvent) => {
                    this.dropOnPocket(e);
                } )
            })
        );
        cg.eventsDragging.forEach(name =>
            [this.chessground.state.dom.elements.pocketTop, this.chessground.state.dom.elements.pocketBottom].forEach(pocketEl => {
                if (pocketEl) pocketEl?.childNodes.forEach(p => {
                    p.addEventListener(name, (e: cg.MouchEvent) => {
                    this.drag(e);
                } ) });
            })
        );

        // initialize pieces
        const pieces0 = document.getElementById('pieces0') as HTMLElement;
        const pieces1 = document.getElementById('pieces1') as HTMLElement;
        iniPieces(this, pieces0, pieces1);

        const e = document.getElementById('fen') as HTMLElement;
        this.vfen = patch(e,
            h('input#fen', {
                props: { name: 'fen', value: model["fen"] },
                on: { input: () => this.setFen(true), paste: (e) => this.onPasteFen(e) },
                hook: {insert: () => this.setFen(false) },
            }),
        );

        //const dataIcon = VARIANTS[this.variant].icon(false);
        const dataIcon = 'icon-' + this.variant.name;
        const container = document.getElementById('editor-button-container') as HTMLElement;
        const firstColor = _(this.variant.firstColor);
        const secondColor = _(this.variant.secondColor);
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

                h('a#flip.i-pgn', { on: { click: () => this.toggleOrientation() } }, [
                    h('div.icon.icon-refresh', _('FLIP BOARD'))
                ]),
                h('a#clear.i-pgn', { on: { click: () => this.setEmptyFen() } }, [
                    h('div.icon.icon-trash-o', _('CLEAR BOARD'))
                ]),
                this.variant.drop ? h('a#fill.i-pgn', { on: { click: () => this.fillHand() } }, [
                    h('div.icon.icon-sign-in', _("FILL %1'S HAND", _(this.variant.secondColor).toUpperCase()))
                ]) : '',
                h('a#start.i-pgn', { on: { click: () => this.setStartFen() } }, [
                    h('div.icon.' + dataIcon, _('STARTING POSITION'))
                ]),
                h('a#analysis.i-pgn', { on: { click: () => this.setAnalysisFen() } }, [
                    h('div.icon.icon-microscope', _('ANALYSIS BOARD'))
                ]),
                h('a#challengeAI.i-pgn', { on: { click: () => this.setChallengeFen() } }, [
                    h('div.icon.icon-bot', _('PLAY WITH MACHINE'))
                ]),
                h('a#pgn.i-pgn', { on: { click: () => copyBoardToPNG(this.parts.join(' ')) } }, [
                    h('div.icon.icon-download', _('EXPORT TO PNG'))
                ])
            ];
            patch(container, h('div.editor-button-container', buttons));
        }
    }

    toggleOrientation() {
        super.toggleOrientation()

        if (this.vpieces0 !== undefined && this.vpieces1 !== undefined) {
            iniPieces(this, this.vpieces0, this.vpieces1);
        }
    }

    private onChangeTurn = (e: Event) => {
        this.parts[1] = ((<HTMLSelectElement>e.target).value === 'white') ? 'w' : 'b';
        this.onChange();
    }

    private onChangeCastl = () => {
        const castlings: {[key:string]:string} = {
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
    private onPasteFen = (e: ClipboardEvent) => {
        const data = e.clipboardData?.getData('text') ?? "";
        (<HTMLInputElement>e.target).value = data.trim();
        e.preventDefault();
        this.setFen(true);
    }

    private validFen = () => {
        const fen = (document.getElementById('fen') as HTMLInputElement).value;
        const valid = validFen(this.variant, fen);
        const ff = this.ffish.validateFen(fen, this.variant.name);
        const ffValid = (ff === 1) || (this.variant.gate && ff === -5);
        return valid && ffValid;
    }

    private setInvalid = (invalid: boolean) => {
        const analysis = document.getElementById('analysis') as HTMLElement;
        analysis.classList.toggle('disabled', invalid);

        const challenge = document.getElementById('challengeAI') as HTMLElement;
        challenge.classList.toggle('disabled', invalid);

        const e = document.getElementById('fen') as HTMLInputElement;
        e.setCustomValidity(invalid ? _('Invalid FEN') : '');
    }

    private setStartFen = () => {
        const e = document.getElementById('fen') as HTMLInputElement;
        e.value = this.startfen;
        this.setFen(true);
    }

    private setEmptyFen = () => {
        const w = this.variant.boardWidth;
        const h = this.variant.boardHeight;
        const emptyFen = Array(h).fill(String(w)).join('/');

        const pocketsPart = this.hasPockets ? '[]' : '';
        this.parts[0] = emptyFen + pocketsPart;
        this.parts[1] = 'w'
        if (this.parts.length > 2) this.parts[2] = '-';
        const e = document.getElementById('fen') as HTMLInputElement;
        e.value = this.parts.join(' ');
        this.setFen(true);
    }

    private fillHand = () => {
        const initialMaterial = calculatePieceNumber(this.variant);
        const currentMaterial = calculatePieceNumber(this.variant, this.fullfen);
        const neededMaterial = diff(initialMaterial, currentMaterial);

        const blackPocket = this.chessground.state.pockets!['black']!;
        for (const [role, num] of neededMaterial) {
            if (role in blackPocket && num > 0)
                blackPocket[role]! += num;
        }

        this.onChange();
    }

    private setAnalysisFen = () => {
        const fen = this.parts.join('_').replace(/\+/g, '.');
        window.location.assign(this.model["home"] + '/analysis/' + this.model["variant"] + '?fen=' + fen);
    }

    private setChallengeFen = () => {
        const fen = this.parts.join('_').replace(/\+/g, '.');
        window.location.assign(this.model["home"] + '/@/Fairy-Stockfish/challenge/' + this.model["variant"] + '?fen=' + fen);
    }

    setFen = (isInput: boolean) => {
        const fen = document.getElementById('fen') as HTMLInputElement;
        if (isInput) {
            this.parts = fen.value.split(' ');
            this.chessground.set({ fen: fen.value });
            this.setInvalid(!this.validFen());

            if (this.parts.length > 1) {
                const turn = document.getElementById('turn') as HTMLInputElement;
                turn.value = (this.parts[1] === 'w') ? 'white' : 'black';
            }

            this.fullfen = fen.value;

            if (hasCastling(this.variant, 'white')) {
                if (this.parts.length >= 3) {
                    const castlings: {[ket:string]: string} = {
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
        this.parts[0] = this.chessground.getFen();
        this.fullfen = this.parts.join(' ');
        const e = document.getElementById('fen') as HTMLInputElement;
        e.value = this.fullfen;
        this.setInvalid(!this.validFen());
    }

    onSelect = () => {
        let lastTime = performance.now();
        let lastKey: cg.Key = 'a0';
        return (key: cg.Key) => {
            const curTime = performance.now();
            if (lastKey === key && curTime - lastTime < 500) {
                const piece = this.chessground.state.pieces.get(key);
                if (piece) {
                    const newColor = this.variant.drop ? util.opposite(piece.color) : piece.color;
                    let newPiece: cg.Piece;
                    if (piece.promoted) {
                        newPiece = {
                            color: newColor,
                            role: unpromotedRole(this.variant, piece),
                            promoted: false,
                        };
                    } else {
                        const newRole = promotedRole(this.variant, piece);
                        if (newRole !== piece.role) { // The piece can be promoted
                            newPiece = {
                                color: piece.color,
                                role: newRole,
                                promoted: true,
                            };
                        } else {
                            newPiece = {
                                color: newColor,
                                role: piece.role,
                                promoted: false,
                            };
                        }
                    }
                    const pieces = new Map([[key, newPiece]]);
                    this.chessground.setPieces(pieces);
                    this.onChange();
                }
                lastKey = 'a0';
            } else {
                lastKey = key;
                lastTime = curTime;
            }
        }
    }

    dropOnPocket = (e: cg.MouchEvent): void => {
        const el = e.target as HTMLElement;
        const piece = this.chessground.state.draggable.current?.piece;
        if (piece) {
            const role = unpromotedRole(this.variant , piece);
            const color = el.getAttribute('data-color') as cg.Color;
            const pocket = this.chessground.state.pockets![color]!;
            if (role in pocket) {
                pocket[role]!++;
                this.onChange();
            }
        }
    }

    drag = (e: cg.MouchEvent): void => {
        const el = e.target as HTMLElement;
        const piece = this.chessground.state.draggable.current?.piece;
        if (piece) {
            this.chessground.state.pockets![piece.color]![piece.role]! --;
            console.log(el);
            console.log(piece);
            console.log("editor");
        }
    }

}
