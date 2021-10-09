import { init, h } from 'snabbdom';
import { toVNode } from 'snabbdom/tovnode';
import listeners from 'snabbdom/modules/eventlisteners';
import style from 'snabbdom/modules/style';

import * as util from 'chessgroundx/util';
import * as cg from 'chessgroundx/types';

import { san2role, role2san } from './chess';
import { bind } from './document';
import RoundController from './roundCtrl';
import AnalysisController from './analysisCtrl';
import { Api } from "chessgroundx/api";

const patch = init([listeners, style]);

export class Promotion {
    ctrl: RoundController | AnalysisController;
    promoting: {orig: cg.Key, dest: cg.Key, callback: (orig: string, dest: string, promo: string) => void} | null;
    choices: { [ role: string ]: string };

    constructor(ctrl: RoundController | AnalysisController) {
        this.ctrl = ctrl;
        this.promoting = null;
        this.choices = {};
    }

    start(movingRole: cg.Role, orig: cg.Key, dest: cg.Key, disableAutoqueen: boolean = false) {
        const ground = this.ctrl.getGround();
        // in 960 castling case (king takes rook) dest piece may be undefined
        if (ground.state.pieces.get(dest) === undefined) return false;

        if (this.canPromote(movingRole, orig, dest)) {
            const color = this.ctrl.turnColor;
            const orientation = ground.state.orientation;
            const pchoices = this.promotionChoices(movingRole, orig, dest);

            if (this.ctrl instanceof RoundController && this.ctrl.autoqueen && !disableAutoqueen && this.ctrl.variant.autoQueenable && 'q-piece' in pchoices)
                this.choices = { 'q-piece': 'q' };
            else
                this.choices = pchoices;

            if (Object.keys(this.choices).length === 1) {
                const role = Object.keys(this.choices)[0];
                const promo = this.choices[role];
                this.promote(ground, dest, role as cg.Role);
                this.ctrl.sendMove(orig, dest, promo);
            } else {
                this.drawPromo(dest, color, orientation);
                this.promoting = {
                    orig: orig,
                    dest: dest,
                    callback: this.ctrl.sendMove,
                };
            }

            return true;
        }
        return false;
    }

    private promotionFilter(move: string, role: cg.Role, orig: cg.Key, dest: cg.Key) {
        if (this.ctrl.variant.promotion === 'kyoto')
            if (orig === "a0")
                return move.startsWith("+" + role2san(role));
        return move.slice(0, -1) === orig + dest;
    }

    private canPromote(role: cg.Role, orig: cg.Key, dest: cg.Key) {
        return this.ctrl.promotions.some(move => this.promotionFilter(move, role, orig, dest));
    }

    private promotionChoices(role: cg.Role, orig: cg.Key, dest: cg.Key) {
        const variant = this.ctrl.variant;
        const possiblePromotions = this.ctrl.promotions.filter(move => this.promotionFilter(move, role, orig, dest));
        const choice: { [ role: string ]: string } = {}; // TODO: same type as this.choices - maybe create a named type
        switch (variant.promotion) {
            case 'shogi':
                choice["p" + role] = "+";
                break;
            case 'kyoto':
                if (orig === "a0" || possiblePromotions[0].slice(-1) === "+")
                    choice["p" + role] = "+";
                else
                    choice[role.slice(1)] = "-";
                break;
            case 'grand':
            default:
                possiblePromotions.forEach(move => {
                    const r = move.slice(-1);
                    choice[san2role(r)] = r;
                });
        }

        if (!this.isMandatoryPromotion(role, orig, dest))
            choice[role] = "";
        return choice;
    }

    private isMandatoryPromotion(role: cg.Role, orig: cg.Key, dest: cg.Key) {
        return this.ctrl.variant.isMandatoryPromotion(role, orig, dest, this.ctrl.mycolor);
    }

    private promote(g: Api, key: cg.Key, role: cg.Role) {
        const pieces: cg.PiecesDiff = new Map();
        const piece = g.state.pieces.get(key);
        if (piece && piece.role !== role) {
            pieces.set(key, {
                color: piece.color,
                role: role,
                promoted: true
            });
            g.setPieces(pieces);
        }
    }

    private drawPromo(dest: cg.Key, color: cg.Color, orientation: cg.Color) {
        const container = toVNode(document.querySelector('extension') as Node);
        patch(container, this.view(dest, color, orientation));
    }

    private drawNoPromo() {
        const container = document.getElementById('extension_choice') as HTMLElement;
        patch(container, h('extension'));
    }

    private finish(role: cg.Role) {
        if (this.promoting) {
            this.drawNoPromo();
            this.promote(this.ctrl.getGround(), this.promoting.dest, role);
            const promo = this.choices[role];

            if (this.ctrl.variant.promotion === 'kyoto') {
                const droppedPiece = promo ? role2san(role.slice(1) as cg.Role) : role2san(role);
                if (this.promoting.callback) this.promoting.callback(promo + droppedPiece + "@", this.promoting.dest, "");
            } else {
                if (this.promoting.callback) this.promoting.callback(this.promoting.orig, this.promoting.dest, promo);
            }

            this.promoting = null;
        }
    }

    private cancel() {
        this.drawNoPromo();
        this.ctrl.goPly(this.ctrl.ply);
        return;
    }

    private view(dest: cg.Key, color: cg.Color, orientation: cg.Color) {
        const dim = this.ctrl.getGround().state.dimensions
        const pos = util.key2pos(dest);

        const leftFile = (orientation === "white") ? pos[0] - 1 : dim.width - pos[0];
        const left = leftFile * (100 / dim.width);

        const direction = color === orientation ? "top" : "bottom";
        const side = color === orientation ? "ally" : "enemy";

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
            choices.map((role, i) => {
                const top = (color === orientation ? topRank + i : dim.height - 1 - topRank - i) * (100 / dim.height);
                return h("square", {
                    style: { top: top + "%", left: left + "%" },
                    hook: bind("click", e => {
                        e.stopPropagation();
                        this.finish(role as cg.Role);
                    }, null)
                },
                    [ h(`piece.${role}.${color}.${side}`) ]
                );
            })
        );
    }

}
