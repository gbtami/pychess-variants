import { init } from 'snabbdom';
import attributes from 'snabbdom/modules/attributes';
import event from 'snabbdom/modules/eventlisteners';
import style from 'snabbdom/modules/style';

import { h } from 'snabbdom/h';
import { VNode } from 'snabbdom/vnode';
import { toVNode } from 'snabbdom/tovnode';

import { key2pos } from 'chessgroundx/util';
import { Key } from 'chessgroundx/types';

import { getPockets, roleToSan, lc } from './chess';
import { bind } from './document';
import { pocketView } from './pocket';

const patch = init([attributes, event, style]);

export class Gating {
    private ctrl;
    private gating: any;
    private choices: string[];

    constructor(ctrl) {
        this.ctrl = ctrl;
        this.gating = null;
        this.choices = [];
    }

    start(fen, orig, dest) {
        const ground = this.ctrl.getGround();
        if (this.canGate(ground, fen, orig, dest)) {
            const pocket = getPockets(fen);
            const color = this.ctrl.turnColor;
            this.choices = ["hawk", "elephant", "queen", "rook", "bishop", "knight"].filter(role => lc(pocket, roleToSan[role], color === "white") > 0);

            // prevent empty only choices in s-house (when H and E dropped before any gating move)
            if (this.choices.length === 0) return false;

            // add (first) empty gating choice
            this.choices.unshift("");

            const orientation = ground.state.orientation;

            let moves = {"normal": [orig, dest]};
            let castling = false;
            let rookOrig: string = "";
            const moveLength = dest[0].charCodeAt() - orig[0].charCodeAt();

            if (ground.state.pieces[dest].role === "king") {
                // King long move is always castling move
                if (Math.abs(moveLength) > 1 ) {
                    castling = true;
                    rookOrig = ((moveLength > 1) ? "h" : "a") + orig[1];
                }
                // King takes own Rook is always castling move in 960 games
                if (this.ctrl.model.chess960 === 'True' && this.ctrl.prevPieces[dest] !== undefined) {
                    if (this.ctrl.prevPieces[dest].role === "rook" && this.ctrl.prevPieces[dest].color === color) {
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
                if (!this.inCastlingTargets(rookOrig, color, moveLength)) {
                    moves["special"] = [rookOrig, orig];
                }
                const pieces = {};
                pieces[((moveLength > 0) ? "f" : "d") + orig[1]] = {color: color, role: 'rook'};
                pieces[((moveLength > 0) ? "g" : "c") + orig[1]] = {color: color, role: 'king'};
                ground.setPieces(pieces);
            };

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
    };

    private inCastlingTargets(key, color, moveLength) {
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

    private canGate(ground, fen: string, orig: Key, dest: Key) {
        const parts = fen.split(" ");
        const castling = parts[2];
        const color = parts[1];
        // At the starting position, the virginities of both king AND rooks are encoded in KQkq
        // "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR[HEhe] w KQBCDFGkqbcdfg - 0 1"

        // but after the king moves, rook virginity is encoded in AHah
        // rnbq1bnr/ppppkppp/8/4p3/4P3/8/PPPPKPPP/RNBQ1BNR[HEhe] w ABCDFGHabcdfgh - 2 3

        // King virginity is encoded in Ee after either of the rooks move, but the king hasn't

        const moveType = ground.state.pieces[dest].role;
        if (moveType === 'king' || moveType === 'rook') {
            if ((color === 'w' && orig[1] === "1" && (castling.includes("K") || castling.includes("Q"))) ||
                (color === 'b' && orig[1] === "8" && (castling.includes("k") || castling.includes("q")))) {
                return true;
            }
        }
        if (color === 'w') {
            switch (orig) {
            case "a1": return castling.includes("A");
            case "b1": return castling.includes("B");
            case "c1": return castling.includes("C");
            case "d1": return castling.includes("D");
            case "e1": return castling.includes("E");
            case "f1": return castling.includes("F");
            case "g1": return castling.includes("G");
            case "h1": return castling.includes("H");
            default: return false;
            }
        } else {
            switch (orig) {
            case "a8": return castling.includes("a");
            case "b8": return castling.includes("b");
            case "c8": return castling.includes("c");
            case "d8": return castling.includes("d");
            case "e8": return castling.includes("e");
            case "f8": return castling.includes("f");
            case "g8": return castling.includes("g");
            case "h8": return castling.includes("h");
            default: return false;
            }
        }
    }

    private gate(orig, color, role) {
        const g = this.ctrl.getGround();
        g.newPiece({ "role": role, "color": color }, orig)
        let position = (this.ctrl.turnColor === this.ctrl.mycolor) ? "bottom": "top";
        if (this.ctrl.flip) position = (position === "top") ? "bottom" : "top";
        if (position === "bottom") {
            this.ctrl.pockets[1][role]--;
            this.ctrl.vpocket1 = patch(this.ctrl.vpocket1, pocketView(this.ctrl, color, "bottom"));
        } else {
            this.ctrl.pockets[0][role]--;
            this.ctrl.vpocket0 = patch(this.ctrl.vpocket0, pocketView(this.ctrl, color, "top"));
        }
    }

    private drawGating(moves, color, orientation) {
        const container = toVNode(document.querySelector('extension') as Node);
        patch(container, this.view(moves, color, orientation));
    }

    private drawNoGating() {
        const container = document.getElementById('extension_choice') as HTMLElement;
        patch(container, h('extension'));
    }

    private finish(gatedPieceRole, moveType, color) {
        if (this.gating) {
            this.drawNoGating();

            const move = this.gating.moves[moveType];
            if (gatedPieceRole) this.gate(move[0], color, gatedPieceRole);

            const gatedPieceLetter = gatedPieceRole ? roleToSan[gatedPieceRole].toLowerCase() : "";
            if (this.gating.callback) {
                if (moveType === "special" && gatedPieceLetter === "") {
                    // empty gating was chosen on vacant rook square
                    this.gating.callback(move[1], move[0], gatedPieceLetter);
                } else {
                    this.gating.callback(move[0], move[1], gatedPieceLetter);
                }
            }
            this.gating = null;
        }
    };

    private cancel() {
        this.drawNoGating();
        this.ctrl.goPly(this.ctrl.ply);
        return;
    }

    private squareView(orig, color, orientation, moveType) {
        const firstRankIs0 = false;
        let left = (8 - key2pos(orig, firstRankIs0)[0]) * 12.5;
        if (orientation === "white") left = 87.5 - left;
        return this.choices.map((gatedPieceRole, i) => {
            const top = (color === orientation ? 7 - i : i) * 12.5;
            return h("square", {
                style: { top: top + "%", left: left + "%" },
                hook: bind("click", e => {
                    e.stopPropagation();
                    this.finish(gatedPieceRole, moveType, color);
                }, false)
            }, [
                h("piece." + gatedPieceRole + "." + color)
            ]);
        })
    }

    private view(moves, color, orientation) {
        const direction = color === orientation ? "top" : "bottom";
        let squares: VNode[] = [];
        if ("normal" in moves) squares = this.squareView(moves["normal"][0], color, orientation, "normal");
        if ("special" in moves) squares = squares.concat(this.squareView(moves["special"][0], color, orientation, "special"));
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
