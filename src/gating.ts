import { h, init } from "snabbdom";
import klass from 'snabbdom/modules/class';
import attributes from 'snabbdom/modules/attributes';
import listeners from 'snabbdom/modules/eventlisteners';
import toVNode from 'snabbdom/tovnode';

import { key2pos } from 'chessgroundx/util';

import { canGate, roleToSan } from './chess';
import { pocketView } from './pocket';

const patch = init([klass, attributes, listeners]);

export default function(ctrl) {

    let gating: any = false;
    let roles;

    function start(fen, orig, dest, meta) {
        const ground = ctrl.getGround();
        const gatable = canGate(fen, ground.state.pieces[dest], orig, dest, meta)
        roles = ["hawk", "elephant", "queen", "rook", "bishop", "knight", ""];

        if (gatable[0] || gatable[1] || gatable[2] || gatable[3] || gatable[4] || gatable[5]) {
            const color = ctrl.mycolor;
            const orientation = ground.state.orientation;
            if (roles.indexOf("hawk") !== -1 && !gatable[0]) roles.splice(roles.indexOf("hawk"), 1);
            if (roles.indexOf("elephant") !== -1 && !gatable[1]) roles.splice(roles.indexOf("elephant"), 1);
            if (roles.indexOf("queen") !== -1 && !gatable[2]) roles.splice(roles.indexOf("queen"), 1);
            if (roles.indexOf("rook") !== -1 && !gatable[3]) roles.splice(roles.indexOf("rook"), 1);
            if (roles.indexOf("bishop") !== -1 && !gatable[4]) roles.splice(roles.indexOf("bishop"), 1);
            if (roles.indexOf("knight") !== -1 && !gatable[5]) roles.splice(roles.indexOf("knight"), 1);

            var origs = [orig];
            const castling = ground.state.pieces[dest].role === "king" && orig[0] === "e" && dest[0] !== "d" && dest[0] !== "e" && dest[0] !== "f";
            var rookDest = "";
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
            draw_gating(origs, color, orientation);
            gating = {
                origs: origs,
                dest: dest,
                rookDest: rookDest,
                callback: ctrl.sendMove,
            };
            return true;
        }
        return false;
    };

    function gate(ctrl, orig, dest, role) {
        const g = ctrl.getGround();
        const color = g.state.pieces[dest].color;
        g.newPiece({"role": role, "color": color}, orig)
        ctrl.pockets[color === 'white' ? 0 : 1][role]--;
        ctrl.vpocket1 = patch(ctrl.vpocket1, pocketView(ctrl, color, "bottom"));
    }

    function draw_gating(origs, color, orientation) {
        var container = toVNode(document.querySelector('extension') as Node);
        patch(container, renderGating(origs, color, orientation));
    }

    function draw_no_gating() {
        var container = document.getElementById('extension_choice') as HTMLElement;
        patch(container, h('extension'));
    }

    function finish(role, index) {
        if (gating) {
            draw_no_gating();
            if (role) gate(ctrl, gating.origs[index], gating.dest, role);
            else index = 0;
            const gated = role ? roleToSan[role].toLowerCase() : "";
            if (gating.callback) gating.callback(gating.origs[index], index === 0 ? gating.dest : gating.rookDest, gated);
            gating = false;
        }
    };

    function cancel() {
        console.log("CANCEL gating");
        return
    }

    function bind(eventName: string, f: (e: Event) => void, redraw) {
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

    function renderSquares(orig, color, orientation, index) {
        const firstRankIs0 = false;
        var left = (8 - key2pos(orig, firstRankIs0)[0]) * 12.5;
        if (orientation === "white") left = 87.5 - left;
        return roles.map((serverRole, i) => {
            var top = (color === orientation ? 7 - i : i) * 12.5;
            return h(
                "square",
                {
                    attrs: { style: "top: " + top + "%;left: " + left + "%" },
                    hook: bind("click", e => {
                        e.stopPropagation();
                        finish(serverRole, index);
                    }, false)
                },
                [h("piece." + serverRole + "." + color)]
            );
        })
    }

    function renderGating(origs, color, orientation) {
        var vertical = color === orientation ? "top" : "bottom";
        var squares = renderSquares(origs[0], color, orientation, 0);
        if (origs.length > 1) squares = squares.concat(renderSquares(origs[1], color, orientation, 1));
        return h(
            "div#extension_choice." + vertical,
            {
                hook: {
                    insert: vnode => {
                        const el = vnode.elm as HTMLElement;
                        el.addEventListener("click", () => cancel());
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

    return {
        start,
    };
}
