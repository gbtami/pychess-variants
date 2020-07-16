import { init } from 'snabbdom';
import listeners from 'snabbdom/modules/eventlisteners';
import style from 'snabbdom/modules/style';

import { h } from 'snabbdom/h';
import { toVNode } from 'snabbdom/tovnode';

import { key2pos } from 'chessgroundx/util';
import { Key, Role } from 'chessgroundx/types';

import { isVariantClass, isPromotion, mandatoryPromotion, promotionRoles, roleToSan, kyotoPromotion } from './chess';

const patch = init([listeners, style]);

export class Promotion {
    ctrl;
    promoting: any;
    roles: string[];

    constructor(ctrl) {
        this.ctrl = ctrl;
        this.promoting = null;
        this.roles = [];
    }

    start(movingRole: Role, orig: Key, dest: Key, meta) {
        const ground = this.ctrl.getGround();
        // in 960 castling case (king takes rook) dest piece may be undefined
        if (ground.state.pieces[dest] === undefined) return false;

        if (isPromotion(this.ctrl.variant, ground.state.pieces[dest], orig, dest, meta, this.ctrl.promotions)) {
            const color = this.ctrl.mycolor;
            const orientation = ground.state.orientation;
            if (this.ctrl.autoqueen && isVariantClass(this.ctrl.variant, "autoQueen")) {
                this.roles = ['queen'];
            } else {
                this.roles = promotionRoles(this.ctrl.variant, movingRole, orig, dest, this.ctrl.promotions);
            }

            const mandatory = mandatoryPromotion(this.ctrl.variant, movingRole, orig, dest, color);
            switch (this.ctrl.variant) {
                case "shogun":
                    if (mandatory) {
                        this.promote(ground, dest, 'ppawn');
                        this.ctrl.sendMove(orig, dest, '+');
                    } else {
                        this.draw_promo(dest, color, orientation);
                        this.promoting = {
                            orig: orig,
                            dest: dest,
                            callback: this.ctrl.sendMove,
                        };
                    };
                    break;
                case "kyotoshogi":
                    if (mandatory) {
                        const promoted = kyotoPromotion[movingRole];
                        this.promote(ground, dest, promoted);
                        this.ctrl.sendMove(orig, dest, (promoted === 'pawn' || promoted === 'silver' || promoted === 'lance' || promoted === 'knight') ? '-' : '+');
                    } else {
                        this.draw_promo(dest, color, orientation);
                        this.promoting = {
                            orig: orig,
                            dest: dest,
                            callback: this.ctrl.sendMove,
                        };
                    };
                    break;
                case "minishogi":
                case "shogi":
                    if (mandatory) {
                        this.promote(ground, dest, 'p' + ground.state.pieces[dest].role);
                        this.ctrl.sendMove(orig, dest, '+');
                    } else {
                        this.draw_promo(dest, color, orientation);
                        this.promoting = {
                            orig: orig,
                            dest: dest,
                            callback: this.ctrl.sendMove,
                        };
                    };
                    break;
                case 'cambodian':
                case 'makruk':
                case 'makpong':
                    this.promote(ground, dest, 'met');
                    this.ctrl.sendMove(orig, dest, 'm');
                    break;
                case 'sittuyin':
                    this.promote(ground, dest, 'ferz');
                    this.ctrl.sendMove(orig, dest, 'f');
                    break;
                default:
                    // in grand chess promotion on back rank is mandatory
                    // and sometimes only one choice exists
                    if (this.roles.length === 1) {
                        const role = this.roles[0];
                        const promo = roleToSan[role].toLowerCase();
                        this.promote(ground, dest, role);
                        this.ctrl.sendMove(orig, dest, promo);
                    } else {
                        this.draw_promo(dest, color, orientation);
                        this.promoting = {
                            orig: orig,
                            dest: dest,
                            callback: this.ctrl.sendMove,
                        };
                    };
            };
            return true;
        }
        return false;
    };

    private promote(g, key, role) {
        const pieces = {};
        const piece = g.state.pieces[key];
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

    private draw_promo(dest, color, orientation) {
        const container = toVNode(document.querySelector('extension') as Node);
        patch(container, this.view(dest, color, orientation));
    }

    private draw_no_promo() {
        const container = document.getElementById('extension_choice') as HTMLElement;
        patch(container, h('extension'));
    }

    private finish(role) {
        if (this.promoting) {
            this.draw_no_promo();
            const promoted = this.promote(this.ctrl.getGround(), this.promoting.dest, role);

            let promo;
            switch (this.ctrl.variant) {
                case "kyotoshogi":
                    const dropPromoted = role.startsWith("p") && role !== 'pawn';
                    const promotedSign = dropPromoted ? "+" : "";
                    const droppedPiece = dropPromoted ? roleToSan[role.slice(1)] : roleToSan[role];
                    if (this.promoting.callback) this.promoting.callback(promotedSign + droppedPiece, "@", this.promoting.dest);
                    this.promoting = false;
                    return;
                case "shogun":
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
            if (this.promoting.callback) this.promoting.callback(this.promoting.orig, this.promoting.dest, promo);
            this.promoting = false;
        }
    };

    private cancel() {
        this.draw_no_promo();
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

    private view(dest, color, orientation) {
        const dim = this.ctrl.getGround().state.dimensions
        const firstRankIs0 = dim.height === 10;
        let left = (dim.width - key2pos(dest, firstRankIs0)[0]) * (100 / dim.width);
        if (orientation === "white") left = (100 / dim.width) * (dim.width - 1) - left;
        const vertical = color === orientation ? "top" : "bottom";
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
            this.roles.map((serverRole, i) => {
                const top = (color === orientation ? i : dim.height -1 - i) * (100 / dim.height);
                return h("square", {
                    style: { top: top + "%", left: left + "%" },
                    hook: this.bind("click", e => {
                        e.stopPropagation();
                        this.finish(serverRole);
                    }, false)
                },
                    [ h("piece." + serverRole + "." + color) ]
                );
            })
        );
    }

}
