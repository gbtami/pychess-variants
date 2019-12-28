import { h, init } from "snabbdom";
import klass from 'snabbdom/modules/class';
import attributes from 'snabbdom/modules/attributes';
import listeners from 'snabbdom/modules/eventlisteners';
import toVNode from 'snabbdom/tovnode';

import { key2pos } from 'chessgroundx/util';
import { Key, Role } from 'chessgroundx/types';

import { isPromotion, mandatoryPromotion, promotionRoles, roleToSan, kyotoPromotion } from './chess';

const patch = init([klass, attributes, listeners]);

export default function(ctrl) {

    let promoting: any = false;
    let roles: string[] = [];

    function start(movingRole: Role, orig: Key, dest: Key, meta) {
        const ground = ctrl.getGround();
        // in 960 castling case (king takes rook) dest piece may be undefined
        if (ground.state.pieces[dest] === undefined) return false;

        if (isPromotion(ctrl.variant, ground.state.pieces[dest], orig, dest, meta, ctrl.promotions)) {
            const color = ctrl.mycolor;
            const orientation = ground.state.orientation;
            // const movingRole = ground.state.pieces[dest].role;
            roles = promotionRoles(ctrl.variant, movingRole, orig, dest, ctrl.promotions);

            switch (ctrl.variant) {
            case "kyotoshogi":
                if (mandatoryPromotion(ctrl.variant, movingRole, orig, dest, color)) {
                    const promoted = kyotoPromotion[movingRole];
                    promote(ground, dest, promoted);
                    ctrl.sendMove(orig, dest, (promoted === 'pawn' || promoted === 'silver' || promoted === 'lance' || promoted === 'knight') ? '-' : '+');
                } else {
                    draw_promo(dest, color, orientation);
                    promoting = {
                        orig: orig,
                        dest: dest,
                        callback: ctrl.sendMove,
                    };
                };
                break;
            case "minishogi":
            case "shogi":
                if (mandatoryPromotion(ctrl.variant, movingRole, orig, dest, color)) {
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
            case 'cambodian':
            case 'makruk':
                promote(ground, dest, 'met');
                ctrl.sendMove(orig, dest, 'm');
                break;
            case 'sittuyin':
                promote(ground, dest, 'ferz');
                ctrl.sendMove(orig, dest, 'f');
                break;
            default:
                // in grand chess promotion on back rank is mandatory
                // and sometimes only one choice exists
                if (roles.length === 1) {
                    const role = roles[0];
                    const promo = roleToSan[role].toLowerCase();
                    promote(ground, dest, role);
                    ctrl.sendMove(orig, dest, promo);
                } else {
                    draw_promo(dest, color, orientation);
                    promoting = {
                        orig: orig,
                        dest: dest,
                        callback: ctrl.sendMove,
                    };
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
        var container = toVNode(document.querySelector('extension') as Node);
        patch(container, renderPromotion(dest, color, orientation));
    }

    function draw_no_promo() {
        var container = document.getElementById('extension_choice') as HTMLElement;
        patch(container, h('extension'));
    }

    function finish(role) {
        if (promoting) {
            draw_no_promo();
            const promoted = promote(ctrl.getGround(), promoting.dest, role);
            let promo;

            switch (ctrl.variant) {
            case "kyotoshogi":
                const promotedSign = role.startsWith("p") ? "+" : "";
                const droppedPiece = role.startsWith("p") ? roleToSan[role.slice(1)] : roleToSan[role];
                if (promoting.callback) promoting.callback(promotedSign + droppedPiece, "@", promoting.dest);
                promoting = false;
                return;
            case "minishogi":
            case "shogi":
                promo = promoted ? "+" : "";
                break;
            case "grandhouse":
            case "grand":
            case "shako":
                promo = promoted ? roleToSan[role].toLowerCase() : "";
                break;
            default:
                promo = roleToSan[role].toLowerCase();
            };
            if (promoting.callback) promoting.callback(promoting.orig, promoting.dest, promo);
            promoting = false;
        }
    };

    function cancel() {
        draw_no_promo();
        ctrl.goPly(ctrl.ply);
        return;
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
