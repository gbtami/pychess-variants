import { h, init } from "snabbdom";
import klass from 'snabbdom/modules/class';
import attributes from 'snabbdom/modules/attributes';
import listeners from 'snabbdom/modules/eventlisteners';
import toVNode from 'snabbdom/tovnode';

import { key2pos } from 'chessgroundx/util';

import { isPromotion, mandatoryPromotion, promotionRoles, roleToSan } from './chess';

const patch = init([klass, attributes, listeners]);

export default function(ctrl) {

    let promoting: any = false;
    let roles: string[] = [];
    function start(orig, dest, meta) {
        const ground = ctrl.getGround();
        if (isPromotion(ctrl.variant, ground.state.pieces[dest], orig, dest, meta)) {
            const color = ctrl.mycolor;
            const orientation = ground.state.orientation;
            const movingRole = ground.state.pieces[dest].role;
            roles = promotionRoles(ctrl.variant, movingRole);

            switch (ctrl.variant) {
            case "shogi":
                if (mandatoryPromotion(movingRole, dest, color)) {
                    promote(ground, dest, 'p' + ground.state.pieces[dest].role);
                    ctrl.sendMove(orig, dest, '+');
                } else {
                    draw_promo(dest, color, orientation);
                    promoting = {
                        orig: orig,
                        dest: dest,
                        callback: ctrl.sendMove,
                    };
                };
                break;
            case 'makruk':
                promote(ground, dest, 'met');
                ctrl.sendMove(orig, dest, 'm');
                break;
            case 'sittuyin':
                promote(ground, dest, 'ferz');
                ctrl.sendMove(orig, dest, 'f');
                break;
            default:
                draw_promo(dest, color, orientation);
                promoting = {
                    orig: orig,
                    dest: dest,
                    callback: ctrl.sendMove,
                };
            };
            return true;
        }
        return false;
    };

    function promote(g, key, role) {
        var pieces = {};
        var piece = g.state.pieces[key];
        if (g.state.pieces[key].role === role) {
            return false;
        } else {
            pieces[key] = {
                color: piece.color,
                role: role,
                promoted: true
            };
            g.setPieces(pieces);
            return true;
        }
    }

    function draw_promo(dest, color, orientation) {
        var container = toVNode(document.querySelector('.extension') as Node);
        patch(container, renderPromotion(dest, color, orientation));
    }

    function draw_no_promo() {
        var container = document.getElementById('extension_choice') as HTMLElement;
        patch(container, h('div.extension'));
    }

    function finish(role) {
        if (promoting) {
            draw_no_promo();
            const promoted = promote(ctrl.getGround(), promoting.dest, role);
            const promo = ctrl.variant === "shogi" ? promoted ? "+" : "" : roleToSan[role].toLowerCase();
            if (promoting.callback) promoting.callback(promoting.orig, promoting.dest, promo);
            promoting = false;
        }
    };

    function cancel() {
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

    function renderPromotion(dest, color, orientation) {
        const dim = ctrl.getGround().state.dimensions
        const firstRankIs0 = dim.height === 10;
        var left = (dim.width - key2pos(dest, firstRankIs0)[0]) * (100 / dim.width);
        if (orientation === "white") left = (100 / dim.width) * (dim.width - 1) - left;
        var vertical = color === orientation ? "top" : "bottom";
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
            roles.map((serverRole, i) => {
                var top = (color === orientation ? i : dim.height -1 - i) * (100 / dim.height);
                return h(
                    "square",
                    {
                        attrs: { style: "top: " + top + "%;left: " + left + "%" },
                        hook: bind("click", e => {
                            e.stopPropagation();
                            finish(serverRole);
                        }, false)
                    },
                    [h("piece." + serverRole + "." + color)]
                );
            })
        );
    }

    return {
        start,
    };
}
