import { h, VNode, toVNode } from 'snabbdom';

import * as util from 'chessgroundx/util';
import * as cg from 'chessgroundx/types';

import { getPockets, lc, colorCase } from './chess';
import RoundController from './roundCtrl';
import AnalysisController from './analysisCtrl';
import { patch, bind } from './document';

export interface Moves {
    normal?: cg.Key[],
    special?: cg.Key[]
}

export class Gating {
    private ctrl: RoundController | AnalysisController;

    private gating : null | {
                moves: Moves,
                callback: (orig: string, dest: string, promo: string) => void,
    };

    private choices: (cg.Role | "")[];

    constructor(ctrl: RoundController | AnalysisController) {
        this.ctrl = ctrl;
        this.gating = null;
        this.choices = [];
    }

    start(fen: cg.FEN, orig: cg.Key, dest: cg.Key) {
        const ground = this.ctrl.getGround();
        if (this.canGate(fen, orig)) {
            const pocket = getPockets(fen);
            const color = this.ctrl.turnColor;
            this.choices = ['h', 'e', 'q', 'r', 'b', 'n'].filter(letter => lc(pocket, letter, color === "white") > 0).map(util.roleOf);

            // prevent empty only choices in s-house (when H and E dropped before any gating move)
            if (this.choices.length === 0) return false;

            // add (first) empty gating choice
            this.choices.unshift("");

            const orientation = ground.state.orientation;

            const moves: Moves = {"normal": [orig, dest]};
            let castling = false;
            let rookOrig: cg.Key | null = null;
            const moveLength = dest.charCodeAt(0) - orig.charCodeAt(0);

            const movedPiece = ground.state.pieces.get(dest);
            const movedRole: cg.Role = movedPiece?.role ?? "k-piece";
            if (movedRole === "k-piece") {
                // King long move is always castling move
                if (Math.abs(moveLength) > 1 ) {
                    castling = true;
                    rookOrig = (((moveLength > 1) ? "h" : "a") + orig[1]) as cg.Key;
                }
                // King takes own Rook is always castling move in 960 games
                if (this.ctrl.chess960 && this.ctrl.prevPieces !== undefined) {
                    const prevPiece = this.ctrl.prevPieces.get(dest);
                    if (prevPiece !== undefined && prevPiece.role === "r-piece" && prevPiece.color === color) {
                        castling = true;
                        rookOrig = dest;
                        // remove gating possibility if king move orig is in castling destination squares 
                        if (this.inCastlingTargets(orig, color, moveLength)) {
                            delete moves["normal"];
                        }
                    }
                }
            }

            if (castling) {
                // UCI move castling + gating to rook vacant square is rook takes king!
                if (rookOrig!==null && !this.inCastlingTargets(rookOrig, color, moveLength)) {
                    moves["special"] = [rookOrig, orig, dest];
                }
                const pieces: cg.PiecesDiff = new Map();
                pieces.set(((moveLength > 0) ? "f" : "d") + orig[1] as cg.Key, {color: color, role: 'r-piece'});
                pieces.set(((moveLength > 0) ? "g" : "c") + orig[1] as cg.Key, {color: color, role: 'k-piece'});
                ground.setPieces(pieces);
            }

            // It is possible in 960 that we have no valid gating square finally
            if (Object.keys(moves).length === 0) return false;

            this.drawGating(moves, color, orientation);
            this.gating = {
                moves: moves,
                callback: this.ctrl.sendMove,
            };
            return true;
        }
        return false;
    }

    private inCastlingTargets(key: cg.Key, color: cg.Color, moveLength: number) {
        if (color === "white") {
            if (moveLength > 0) {
                // O-O
                return (key === 'f1') || (key === 'g1');
            } else {
                // O-O-O
                return (key === 'c1') || (key === 'd1');
            }
        } else {
            if (moveLength > 0) {
                return (key === 'f8') || (key === 'g8');
            } else {
                return (key === 'c8') || (key === 'd8');
            }
        }
    }

    private canGate(fen: cg.FEN, orig: cg.Key) {
        const parts = fen.split(" ");
        const castling = parts[2];
        const color = parts[1] === 'w' ? 'white' : 'black';

        const cc = (str: string) => colorCase(color, str);
        const gateRank = color === 'white' ? '1' : '8';

        if (orig[1] === gateRank) {
            if (castling.includes(cc(orig[0]))) {
                return true;
            }
            if (!this.ctrl.chess960) {
                // In non-960, if both the king and the corresponding rook haven't moved,
                // the virginity of BOTH pieces will be encoded in the castling right
                if (orig[0] === 'e' || orig[0] === 'h')
                    if (castling.includes(cc('K')))
                        return true;
                if (orig[0] === 'e' || orig[0] === 'a')
                    if (castling.includes(cc('Q')))
                        return true;
            }
        }
        return false;
    }

    private gate(orig: cg.Key, color: cg.Color, role: cg.Role) {
        const g = this.ctrl.getGround();
        g.newPiece({ "role": role, "color": color }, orig)
    }

    private drawGating(moves: Moves, color: cg.Color, orientation: cg.Color) {
        const container = toVNode(document.querySelector('extension') as Node);
        patch(container, this.view(moves, color, orientation));
    }

    private drawNoGating() {
        const container = document.getElementById('extension_choice') as HTMLElement;
        patch(container, h('extension'));
    }

    private finish(gatedPieceRole: cg.Role|"", moveType: keyof Moves, color: cg.Color) {
        if (this.gating) {
            this.drawNoGating();

            const move = this.gating.moves[moveType];
            if (gatedPieceRole && move) this.gate(move[0], color, gatedPieceRole);

            const gatedPieceLetter = gatedPieceRole ? util.letterOf(gatedPieceRole) : "";
            if (move && this.gating.callback) {
                if (moveType === "special") {
                    if (gatedPieceLetter === "") {
                        // empty gating was chosen on vacant rook square (simple castling)
                        this.gating.callback(move[1], move[2], gatedPieceLetter);
                    } else {
                        // gating to rook square while castling need special UCI move (rook takes king)
                        this.gating.callback(move[0], move[1], gatedPieceLetter);
                    }
                } else {
                    this.gating.callback(move[0], move[1], gatedPieceLetter);
                }
            }
            this.gating = null;
        }
    }

    private cancel() {
        this.drawNoGating();
        this.ctrl.goPly(this.ctrl.ply);
        return;
    }

    private squareView(orig: cg.Key, color: cg.Color, orientation: cg.Color, moveType: keyof Moves) {
        const leftFile = util.key2pos(orig)[0];
        const left = (orientation === "white" ? leftFile : 7 - leftFile) * 12.5;
        return this.choices.map((gatedPieceRole, i) => {
            const top = (color === orientation ? 7 - i : i) * 12.5;
            return h("square", {
                style: { top: top + "%", left: left + "%" },
                hook: bind("click", e => {
                    e.stopPropagation();
                    this.finish(gatedPieceRole, moveType, color);
                }, null)
            }, [
                h("piece." + gatedPieceRole + "." + color)
            ]);
        })
    }

    private view(moves: Moves, color: cg.Color, orientation: cg.Color) {
        const direction = color === orientation ? "top" : "bottom";
        let squares: VNode[] = [];
        if (moves.normal) squares = this.squareView(moves.normal[0], color, orientation, "normal");
        if (moves.special) squares = squares.concat(this.squareView(moves.special[0], color, orientation, "special"));
        return h("div#extension_choice." + direction, {
            hook: {
                insert: vnode => {
                    const el = vnode.elm as HTMLElement;
                    el.addEventListener("click", () => this.cancel());
                    el.addEventListener("contextmenu", e => {
                        e.preventDefault();
                        return false;
                    });
                }
            }
        },
            squares
        );
    }

}
