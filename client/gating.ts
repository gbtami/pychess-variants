import { init } from 'snabbdom';
import attributes from 'snabbdom/modules/attributes';
import event from 'snabbdom/modules/eventlisteners';
import style from 'snabbdom/modules/style';

import { h } from 'snabbdom/h';
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
        if (this.canGate(fen, orig)) {
            const pocket = getPockets(fen);
            const color = this.ctrl.turnColor;
            this.choices = ["hawk", "elephant", "queen", "rook", "bishop", "knight"].filter(role => lc(pocket, roleToSan[role], color === "white") > 0);
            this.choices.unshift("");

            const ground = this.ctrl.getGround();
            const orientation = ground.state.orientation;

            const origs = [orig];
            const castling = ground.state.pieces[dest].role === "king" && orig[0] === "e" && dest[0] !== "d" && dest[0] !== "e" && dest[0] !== "f";
            let rookDest = "";
            if (castling) {
                if (dest[0] > "e") {
                    // O-O
                    origs.push("h" + orig[1]);
                    rookDest = "e" + orig[1];
                } else {
                    // O-O-O
                    origs.push("a" + orig[1]);
                    rookDest = "e" + orig[1];
                };
            };
            this.drawGating(origs, color, orientation);
            this.gating = {
                origs: origs,
                dest: dest,
                rookDest: rookDest,
                callback: this.ctrl.sendMove,
            };
            return true;
        }
        return false;
    };

    private canGate(fen: string, orig: Key) {
        const parts = fen.split(" ");
        const castling = parts[2];

        // At the starting position, the virginities of both king AND rooks are encoded in KQkq
        // "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR[HEhe] w KQBCDFGkqbcdfg - 0 1"

        // but after the king moves, rook virginity is encoded in AHah
        // rnbq1bnr/ppppkppp/8/4p3/4P3/8/PPPPKPPP/RNBQ1BNR[HEhe] w ABCDFGHabcdfgh - 2 3

        // King virginity is encoded in Ee after either of the rooks move, but the king hasn't

        switch (orig) {
            case "a1": return castling.includes("A") || castling.includes("Q");
            case "b1": return castling.includes("B");
            case "c1": return castling.includes("C");
            case "d1": return castling.includes("D");
            case "e1": return castling.includes("E") || castling.includes("K") || castling.includes("Q");
            case "f1": return castling.includes("F");
            case "g1": return castling.includes("G");
            case "h1": return castling.includes("H") || castling.includes("K");

            case "a8": return castling.includes("a") || castling.includes("q");
            case "b8": return castling.includes("b");
            case "c8": return castling.includes("c");
            case "d8": return castling.includes("d");
            case "e8": return castling.includes("e") || castling.includes("k") || castling.includes("q");
            case "f8": return castling.includes("f");
            case "g8": return castling.includes("g");
            case "h8": return castling.includes("h") || castling.includes("k");

            default: return false;
        }
    }

    private gate(orig, dest, role) {
        const g = this.ctrl.getGround();
        const color = g.state.pieces[dest].color;
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

    private drawGating(origs, color, orientation) {
        const container = toVNode(document.querySelector('extension') as Node);
        patch(container, this.view(origs, color, orientation));
    }

    private drawNoGating() {
        const container = document.getElementById('extension_choice') as HTMLElement;
        patch(container, h('extension'));
    }

    private finish(role, index) {
        if (this.gating) {
            this.drawNoGating();
            if (role) this.gate(this.gating.origs[index], this.gating.dest, role);
            else index = 0;
            const gated = role ? roleToSan[role].toLowerCase() : "";
            if (this.gating.callback)
                this.gating.callback(this.gating.origs[index], index === 0 ? this.gating.dest : this.gating.rookDest, gated);
            this.gating = null;
        }
    };

    private cancel() {
        this.drawNoGating();
        this.ctrl.goPly(this.ctrl.ply);
        return;
    }

    private squareView(orig, color, orientation, index) {
        const firstRankIs0 = false;
        let left = (8 - key2pos(orig, firstRankIs0)[0]) * 12.5;
        if (orientation === "white") left = 87.5 - left;
        return this.choices.map((serverRole, i) => {
            const top = (color === orientation ? 7 - i : i) * 12.5;
            return h("square", {
                style: { top: top + "%", left: left + "%" },
                hook: bind("click", e => {
                    e.stopPropagation();
                    this.finish(serverRole, index);
                }, false)
            }, [
                h("piece." + serverRole + "." + color)
            ]);
        })
    }

    private view(origs, color, orientation) {
        const direction = color === orientation ? "top" : "bottom";
        let squares = this.squareView(origs[0], color, orientation, 0);
        if (origs.length > 1) squares = squares.concat(this.squareView(origs[1], color, orientation, 1));
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
