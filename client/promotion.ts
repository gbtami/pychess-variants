import { init } from 'snabbdom';
import listeners from 'snabbdom/modules/eventlisteners';
import style from 'snabbdom/modules/style';

import { h } from 'snabbdom/h';
import { toVNode } from 'snabbdom/tovnode';

import { key2pos } from 'chessgroundx/util';
import { Key, Role, Color, dimensions } from 'chessgroundx/types';

import { VARIANTS, isVariantClass, sanToRole, roleToSan } from './chess';
import { bind } from './document';

const patch = init([listeners, style]);

export class Promotion {
    ctrl;
    promoting: any;
    choices: { [ role: string ]: string };

    constructor(ctrl) {
        this.ctrl = ctrl;
        this.promoting = null;
        this.choices = {};
    }

    start(movingRole: Role, orig: Key, dest: Key) {
        const ground = this.ctrl.getGround();
        // in 960 castling case (king takes rook) dest piece may be undefined
        if (ground.state.pieces[dest] === undefined) return false;

        if (this.canPromote(movingRole, orig, dest)) {
            const color = this.ctrl.turnColor;
            const orientation = ground.state.orientation;

            if (this.ctrl.autoqueen && isVariantClass(this.ctrl.variant, "autoQueen"))
                this.choices = { 'queen': 'q' };
            else
                this.choices = this.promotionChoices(movingRole, orig, dest);

            if (Object.keys(this.choices).length === 1) {
                const role = Object.keys(this.choices)[0];
                const promo = this.choices[role];
                this.promote(ground, dest, role);
                this.ctrl.sendMove(orig, dest, promo);
            } else {
                this.drawPromo(dest, color, orientation);
                this.promoting = {
                    orig: orig,
                    dest: dest,
                    callback: this.ctrl.sendMove,
                };
            };

            return true;
        }
        return false;
    }

    private promotionFilter(move, role, orig, dest) {
        if (this.ctrl.variant === "kyotoshogi")
            if (orig === "z0")
                return move.startsWith("+" + roleToSan[role]);
        return move.slice(0, -1) === orig + dest;
    }

    private canPromote(role, orig, dest) {
        return this.ctrl.promotions.some(move => this.promotionFilter(move, role, orig, dest));
    }

    private promotionChoices(role: Role, orig: Key, dest: Key) {
        const variant = this.ctrl.variant;
        const possiblePromotions = this.ctrl.promotions.filter(move => this.promotionFilter(move, role, orig, dest));
        const choice = {};
        if ([ "shogi", "minishogi", "shogun" ].includes(variant)) {
            choice["p" + role] = "+";
        } else if (variant === "kyotoshogi") {
            if (orig === "z0" || possiblePromotions[0].slice(-1) === "+")
                choice["p" + role] = "+";
            else
                choice[role.slice(1)] = "-";
        } else {
            possiblePromotions.forEach(move => {
                const r = move.slice(-1);
                choice[sanToRole[r]] = r;
            });
        }

        if (!this.isMandatoryPromotion(role, orig, dest))
            choice[role] = "";
        return choice;
    }

    private isMandatoryPromotion(role: Role, orig: Key, dest: Key) {
        const variant = this.ctrl.variant;
        const color = this.ctrl.mycolor;
        const destRank = Number(dest[1]);
        switch (variant) {
            case "kyotoshogi":
                return orig !== 'z0';
            case "shogi":
                if (role === "pawn" || role === "lance")
                    return this.isAwayFromLastRank(destRank, 1, color);
                else if (role === "knight")
                    return this.isAwayFromLastRank(destRank, 2, color);
                else
                    return false;
            case "minishogi":
            case "grand":
            case "grandhouse":
            case "shogun":
                return role === "pawn" && this.isAwayFromLastRank(destRank, 1, color);
            default:
                return true;
        }
    }

    // fromLastRank = 1 means destRank IS the last rank of the color's side
    private isAwayFromLastRank(destRank: number, fromLastRank: number, color: Color) {
        const height = dimensions[VARIANTS[this.ctrl.variant].geometry].height;
        if (height === 10)
            destRank += 1;
        if (color === "white")
            return destRank >= height - fromLastRank + 1;
        else
            return destRank <= fromLastRank;
    }

    private promote(g, key, role) {
        const pieces = {};
        const piece = g.state.pieces[key];
        if (role === "met") role = "ferz"; // Show the graphic of the flipped pawn instead of met for Makruk et al
        if (g.state.pieces[key].role !== role) {
            pieces[key] = {
                color: piece.color,
                role: role,
                promoted: true
            };
            g.setPieces(pieces);
        }
    }

    private drawPromo(dest, color, orientation) {
        const container = toVNode(document.querySelector('extension') as Node);
        patch(container, this.view(dest, color, orientation));
    }

    private drawNoPromo() {
        const container = document.getElementById('extension_choice') as HTMLElement;
        patch(container, h('extension'));
    }

    private finish(role) {
        if (this.promoting) {
            this.drawNoPromo();
            this.promote(this.ctrl.getGround(), this.promoting.dest, role);
            const promo = this.choices[role];

            if (this.ctrl.variant === "kyotoshogi") {
                const droppedPiece = promo ? roleToSan[role.slice(1)] : roleToSan[role];
                if (this.promoting.callback) this.promoting.callback(promo + droppedPiece, "@", this.promoting.dest);
            } else {
                if (this.promoting.callback) this.promoting.callback(this.promoting.orig, this.promoting.dest, promo);
            }

            this.promoting = null;
        }
    };

    private cancel() {
        this.drawNoPromo();
        this.ctrl.goPly(this.ctrl.ply);
        return;
    }

    private view(dest, color, orientation) {
        const dim = this.ctrl.getGround().state.dimensions
        const firstRankIs0 = dim.height === 10;
        const pos = key2pos(dest, firstRankIs0);

        const leftFile = (orientation === "white") ? pos[0] - 1 : dim.width - pos[0];
        const left = leftFile * (100 / dim.width);

        const direction = color === orientation ? "top" : "bottom";

        const choices = Object.keys(this.choices);
        const topRank = Math.max(0, (color === "white") ? dim.height - pos[1] + 1 - choices.length : pos[1] - choices.length);

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
            choices.map((serverRole, i) => {
                const top = (color === orientation ? topRank + i : dim.height - 1 - topRank - i) * (100 / dim.height);
                return h("square", {
                    style: { top: top + "%", left: left + "%" },
                    hook: bind("click", e => {
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
