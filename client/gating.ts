import { init } from 'snabbdom';
import event from 'snabbdom/modules/eventlisteners';
import style from 'snabbdom/modules/style';

import { h } from 'snabbdom/h';
import { toVNode } from 'snabbdom/tovnode';

import { key2pos } from 'chessgroundx/util';

import { canGate, roleToSan } from './chess';
import { pocketView } from './pocket';

const patch = init([event, style]);

export class Gating {
    private ctrl;
    private gating: any;
    private roles: string[];

    constructor(ctrl) {
        this.ctrl = ctrl;
        this.gating = null;
        this.roles = [];
    }

    start(fen, orig, dest) {
        const ground = this.ctrl.getGround();
        const gatable = canGate(fen, ground.state.pieces[dest], orig)
        this.roles = ["hawk", "elephant", "queen", "rook", "bishop", "knight", ""];

        if (gatable.some(x => x)) {
            const color = this.ctrl.mycolor;
            const orientation = ground.state.orientation;
            if (this.roles.indexOf("hawk") !== -1 && !gatable[0]) this.roles.splice(this.roles.indexOf("hawk"), 1);
            if (this.roles.indexOf("elephant") !== -1 && !gatable[1]) this.roles.splice(this.roles.indexOf("elephant"), 1);
            if (this.roles.indexOf("queen") !== -1 && !gatable[2]) this.roles.splice(this.roles.indexOf("queen"), 1);
            if (this.roles.indexOf("rook") !== -1 && !gatable[3]) this.roles.splice(this.roles.indexOf("rook"), 1);
            if (this.roles.indexOf("bishop") !== -1 && !gatable[4]) this.roles.splice(this.roles.indexOf("bishop"), 1);
            if (this.roles.indexOf("knight") !== -1 && !gatable[5]) this.roles.splice(this.roles.indexOf("knight"), 1);

            const origs = [orig];
            const castling = ground.state.pieces[dest].role === "king" && orig[0] === "e" && dest[0] !== "d" && dest[0] !== "e" && dest[0] !== "f";
            let rookDest = "";
            if (castling) {
                // O-O
                if (dest[0] > "e") {
                    origs.push("h" + orig[1]);
                    rookDest =  "e" + orig[1];
                    // O-O-O
                } else {
                    origs.push("a" + orig[1]);
                    rookDest =  "e" + orig[1];
                };
            };
            this.draw_gating(origs, color, orientation);
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

    private gate(orig, dest, role) {
        const g = this.ctrl.getGround();
        const color = g.state.pieces[dest].color;
        g.newPiece({ "role": role, "color": color }, orig)
        this.ctrl.pockets[(this.ctrl.flip) ? 0 : 1][role]--;
        this.ctrl.vpocket1 = patch(this.ctrl.vpocket1, pocketView(this.ctrl, color, "bottom"));
    }

    private draw_gating(origs, color, orientation) {
        const container = toVNode(document.querySelector('extension') as Node);
        patch(container, this.view(origs, color, orientation));
    }

    private draw_no_gating() {
        const container = document.getElementById('extension_choice') as HTMLElement;
        patch(container, h('extension'));
    }

    private finish(role, index) {
        if (this.gating) {
            this.draw_no_gating();
            if (role) this.gate(this.gating.origs[index], this.gating.dest, role);
            else index = 0;
            const gated = role ? roleToSan[role].toLowerCase() : "";
            if (this.gating.callback)
                this.gating.callback(this.gating.origs[index], index === 0 ? this.gating.dest : this.gating.rookDest, gated);
            this.gating = null;
        }
    };

    private cancel() {
        this.draw_no_gating();
        this.ctrl.goPly(this.ctrl.ply);
        return;
    }

    private bind(eventName: string, f: (e: Event) => void, redraw) {
        return {
            insert(vnode) {
                vnode.elm.addEventListener(eventName, e => {
                    const res = f(e);
                    if (redraw) redraw();
                    return res;
                });
            }
        };
    }

    private squareView(orig, color, orientation, index) {
        const firstRankIs0 = false;
        let left = (8 - key2pos(orig, firstRankIs0)[0]) * 12.5;
        if (orientation === "white") left = 87.5 - left;
        return this.roles.map((serverRole, i) => {
            const top = (color === orientation ? 7 - i : i) * 12.5;
            return h("square", {
                style: { top: top + "%", left: left + "%" },
                hook: this.bind("click", e => {
                    e.stopPropagation();
                    this.finish(serverRole, index);
                }, false)
            }, [
                h("piece." + serverRole + "." + color)
            ]);
        })
    }

    private view(origs, color, orientation) {
        const vertical = color === orientation ? "top" : "bottom";
        let squares = this.squareView(origs[0], color, orientation, 0);
        if (origs.length > 1) squares = squares.concat(this.squareView(origs[1], color, orientation, 1));
        return h("div#extension_choice." + vertical, {
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
