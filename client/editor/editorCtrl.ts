import { h, VNode } from 'snabbdom';

import * as cg from 'chessgroundx/types';
import * as util from 'chessgroundx/util';

import { _ } from '@/i18n';
import { validFen, hasCastling, unpromotedRole, promotedRole } from '@/chess'
import { diff, calculatePieceNumber } from '@/material';
import { copyBoardToPNG } from '@/png';
import { patch } from '@/document';
import { PyChessModel } from "@/types";
import { ChessgroundController } from '@/cgCtrl';
import { copyTextToClipboard } from '@/clipboard';
import { initPieceRow } from './pieceRow';
import { setPocketRowCssVars } from '@/pocketRow';

export class EditorController extends ChessgroundController {
    model: PyChessModel;
    startfen: string;
    parts: string[];
    castling: string;
    vpieces0: VNode;
    vpieces1: VNode;
    vfen: VNode;
    vAnalysis: VNode;
    vChallenge: VNode;

    constructor(el: HTMLElement, model: PyChessModel) {
        super(el, model, model.fen, document.getElementById('pocket0') as HTMLElement, document.getElementById('pocket1') as HTMLElement, '');
        this.model = model;
        this.startfen = model["fen"] as string;

        this.parts = this.startfen.split(" ");
        this.castling = this.parts.length > 2 ? this.parts[2] : '';

        this.chessground.set({
            autoCastle: false,
            orientation: this.mycolor,
            movable: {
                free: true,
            },
            events: {
                change: this.onChangeBoard,
                select: this.onSelect(),
            },
            selectable: {
                enabled: false
            },
            draggable: {
                deleteOnDropOff: true,
            },
            highlight: {
                lastMove: false,
            },
        });

        [this.chessground.state.dom.elements.pocketTop, this.chessground.state.dom.elements.pocketBottom].forEach(pocketEl => {
            pocketEl?.addEventListener('mouseup', this.dropOnPocket);
            pocketEl?.addEventListener('touchend', this.dropOnPocket);
        });

        this.chessground.state.dom.elements.board.addEventListener('touchend', this.dropOnPocket);

        // initialize pieces
        const pieces0 = document.getElementById('pieces0') as HTMLElement;
        const pieces1 = document.getElementById('pieces1') as HTMLElement;
        initPieceRow(this, pieces0, pieces1);
        this.vpieces0.elm?.addEventListener('touchend', this.dropOnPocket);
        this.vpieces1.elm?.addEventListener('touchend', this.dropOnPocket);

        if (this.hasPockets) {
            setPocketRowCssVars(this);
        }

        const e = document.getElementById('fen') as HTMLElement;
        this.vfen = patch(e,
            h('input#fen', {
                props: { name: 'fen', value: model["fen"] },
                on: { input: () => this.onChangeFen(), paste: (e) => this.onPasteFen(e) },
            }),
        );

        //const dataIcon = VARIANTS[this.variant].icon(false);
        const dataIcon = 'icon-' + this.variant.name;
        const container = document.getElementById('editor-button-container') as HTMLElement;
        const firstColor = _(this.variant.colors.first);
        const secondColor = _(this.variant.colors.second);
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
                            on: { change: () => this.onChangeCastling() },
                        }),
                        h('label.OOO', { attrs: { for: "wOOO" } }, "O-O-O"),
                        h('input#wOOO', {
                            props: {name: "wOOO", type: "checkbox"},
                            attrs: {checked: this.parts[2].includes('Q')},
                            on: { change: () => this.onChangeCastling() },
                        }),
                    ]),
                    (!hasCastling(this.variant, 'black')) ? '' :
                    h('div.castling', [
                        h('label.OO', { attrs: { for: "bOO" } }, _("Black") +  " O-O"),
                        h('input#bOO', {
                            props: {name: "bOO", type: "checkbox"},
                            attrs: {checked: this.parts[2].includes('k')},
                            on: { change: () => this.onChangeCastling() },
                        }),
                        h('label.OOO', { attrs: { for: "bOOO" } }, "O-O-O"),
                        h('input#bOOO', {
                            props: {name: "bOOO", type: "checkbox"},
                            attrs: {checked: this.parts[2].includes('q')},
                            on: { change: () => this.onChangeCastling() },
                        }),
                    ]),
                ]),

                h('a#flip.i-pgn', { on: { click: () => this.toggleOrientation() } }, [
                    h('div.icon.icon-refresh', _('FLIP BOARD'))
                ]),
                h('a#clear.i-pgn', { on: { click: () => this.setEmptyFen() } }, [
                    h('div.icon.icon-trash-o', _('CLEAR BOARD'))
                ]),
                this.variant.pocket?.captureToHand ? h('a#fill.i-pgn', { on: { click: () => this.fillHand() } }, [
                    h('div.icon.icon-sign-in', _("FILL %1'S HAND", secondColor.toUpperCase()))
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
                ]),
                h('a#pgn.i-pgn', { on: { click: () => copyTextToClipboard(this.parts.join(' ')) } }, [
                    h('div.icon.icon-clipboard', _('COPY FEN TO CLIPBOARD'))
                ]),
            ];
            patch(container, h('div.editor-button-container', buttons));
        }
    }

    toggleOrientation() {
        super.toggleOrientation()

        if (this.vpieces0 !== undefined && this.vpieces1 !== undefined) {
            initPieceRow(this, this.vpieces0, this.vpieces1);
        }

        if (this.hasPockets) {
            setPocketRowCssVars(this);
        }
    }

    private onChangeTurn = (e: Event) => {
        this.parts[1] = ((<HTMLSelectElement>e.target).value === 'white') ? 'w' : 'b';
        this.onChangeBoard();
    }

    private onChangeCastling = () => {
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
        this.onChangeBoard();
    }

    // Remove accidentally selected leading spaces from FEN (mostly may happen on mobile)
    private onPasteFen = (e: ClipboardEvent) => {
        (<HTMLInputElement>e.target).value = e.clipboardData?.getData('text').trim() ?? "";
        e.preventDefault();
        this.onChangeFen();
    }

    private validFen = () => {
        const fen = (document.getElementById('fen') as HTMLInputElement).value;
        const valid = validFen(this.variant, fen);
        const ff = this.ffish.validateFen(fen, this.variant.name);
        const ffValid = (ff === 1) || (this.variant.rules.gate && ff === -5) || (this.variant.rules.duck && ff === -10);
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
        this.onChangeFen();
    }

    private setEmptyFen = () => {
        const w = this.variant.board.dimensions.width;
        const h = this.variant.board.dimensions.height;
        const emptyFen = Array(h).fill(String(w)).join('/');

        const pocketsPart = this.hasPockets ? '[]' : '';
        this.parts[0] = emptyFen + pocketsPart;
        this.parts[1] = 'w'
        if (this.parts.length > 2) this.parts[2] = '-';
        const e = document.getElementById('fen') as HTMLInputElement;
        e.value = this.parts.join(' ');
        this.onChangeFen();
    }

    private fillHand = () => {
        const initialMaterial = calculatePieceNumber(this.variant);
        const currentMaterial = calculatePieceNumber(this.variant, this.fullfen);
        const neededMaterial = diff(initialMaterial, currentMaterial);
        for (const [role, num] of neededMaterial)
            if (num > 0)
                this.chessground.changePocket({ role, color: 'black' }, num);
        this.onChangeBoard();
    }

    private setAnalysisFen = () => {
        const fen = this.parts.join('_').replace(/\+/g, '.');
        window.location.assign(this.model["home"] + '/analysis/' + this.model["variant"] + '?fen=' + fen);
    }

    private setChallengeFen = () => {
        const fen = this.parts.join('_').replace(/\+/g, '.');
        window.location.assign(this.model["home"] + '/@/Fairy-Stockfish/challenge/' + this.model["variant"] + '?fen=' + fen);
    }

    private onChangeFen = () => {
        const fen = (document.getElementById('fen') as HTMLInputElement).value;
        this.parts = fen.split(' ');
        this.chessground.set({ fen: fen });
        this.setInvalid(!this.validFen());

        if (this.parts.length > 1) {
            const turn = document.getElementById('turn') as HTMLInputElement;
            turn.value = (this.parts[1] === 'w') ? 'white' : 'black';
        }

        this.fullfen = fen;

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
    }

    private onChangeBoard = () => {
        if (this.variant.promotion.strict) {
            // Convert each piece to its correct promotion state
            for (const [key, piece] of this.chessground.state.boardState.pieces) {
                if (this.variant.promotion.strict.isPromoted(piece, util.key2pos(key))) {
                    piece.role = promotedRole(this.variant, piece);
                    piece.promoted = true;
                } else {
                    piece.role = unpromotedRole(this.variant, piece);
                    piece.promoted = false;
                }
            }
            this.chessground.redrawAll();
        }

        // onChange() will get then set and validate FEN from chessground pieces
        this.parts[0] = this.chessground.getFen();
        this.fullfen = this.parts.join(' ');
        const e = document.getElementById('fen') as HTMLInputElement;
        e.value = this.fullfen;
        this.setInvalid(!this.validFen());
    }

    private onSelect = () => {
        let lastTime = performance.now();
        let lastKey: cg.Key | undefined;
        return (key: cg.Key) => {
            const curTime = performance.now();
            if (lastKey === key && curTime - lastTime < 500) {
                const piece = this.chessground.state.boardState.pieces.get(key);
                if (piece) {
                    const newColor = this.variant.pocket?.captureToHand ? util.opposite(piece.color) : piece.color;
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
                    this.onChangeBoard();
                }
                lastKey = undefined;
            } else {
                lastKey = key;
                lastTime = curTime;
            }
        }
    }

    private dropOnPocket = (): void => {
        const dragCurrent = this.chessground.state.draggable.current;
        if (dragCurrent) {
            const el = document.elementFromPoint(dragCurrent.pos[0], dragCurrent.pos[1]);
            // Needs to check whether the drop is actually on a pocket since touchend events
            //     are bound to the *starting* point of the touch, not the end point
            const onPocket = Number(el?.getAttribute('data-nb') ?? -1) >= 0;
            if (onPocket) {
                const role = unpromotedRole(this.variant, dragCurrent.piece);
                const color = el?.getAttribute('data-color') as cg.Color;
                this.chessground.changePocket({ role, color }, 1);
                this.onChangeBoard();
            }
        }
    }
}
