import { init, h } from 'snabbdom';
import { toVNode } from 'snabbdom/tovnode';
import listeners from 'snabbdom/modules/eventlisteners';
import style from 'snabbdom/modules/style';

import * as util from 'chessgroundx/util';
import * as cg from 'chessgroundx/types';

import { PromotionSuffix } from './chess';
import { bind } from './document';
import RoundController from './roundCtrl';
import AnalysisController from './analysisCtrl';
import { Api } from "chessgroundx/api";

const patch = init([listeners, style]);

type PromotionChoices = Partial<Record<cg.Role, PromotionSuffix>>;

export class Promotion {
    ctrl: RoundController | AnalysisController;
    promoting: {orig: cg.Key, dest: cg.Key, callback: (orig: string, dest: string, promo: string) => void} | null;
    choices: PromotionChoices;

    constructor(ctrl: RoundController | AnalysisController) {
        this.ctrl = ctrl;
        this.promoting = null;
        this.choices = {};
    }

    start(movingRole: cg.Role, orig: cg.Key, dest: cg.Key, disableAutoPromote: boolean = false) {
        const ground = this.ctrl.getGround();
        // in 960 castling case (king takes rook) dest piece may be undefined
        if (ground.state.pieces.get(dest) === undefined) return false;

        if (this.canPromote(movingRole, orig, dest)) {
            const color = this.ctrl.turnColor;
            const orientation = ground.state.orientation;
            const pchoices = this.promotionChoices(movingRole, orig, dest);
            const autoSuffix = this.ctrl.variant.promotionOrder[0];
            const autoRole = ["shogi", "kyoto"].includes(this.ctrl.variant.promotion) ?
                undefined :
                util.roleOf(autoSuffix as cg.PieceLetter);

            if (this.ctrl instanceof RoundController &&
                this.ctrl.variant.autoPromoteable &&
                this.ctrl.autoPromote &&
                !disableAutoPromote &&
                autoRole &&
                autoRole in pchoices)
                this.choices = { [autoRole]: autoSuffix };
            else
                this.choices = pchoices;

            if (Object.keys(this.choices).length === 1) {
                const role = Object.keys(this.choices)[0] as cg.Role;
                const promo = this.choices[role];
                this.promote(ground, dest, role);
                this.ctrl.sendMove(orig, dest, promo!);
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
                return move.startsWith("+" + util.letterOf(role, true));
        return move.slice(0, -1) === orig + dest;
    }

    private canPromote(role: cg.Role, orig: cg.Key, dest: cg.Key) {
        return this.ctrl.promotions.some(move => this.promotionFilter(move, role, orig, dest));
    }

    private promotionChoices(role: cg.Role, orig: cg.Key, dest: cg.Key) {
        const variant = this.ctrl.variant;
        const possiblePromotions = this.ctrl.promotions.filter(move => this.promotionFilter(move, role, orig, dest));
        const choice: PromotionChoices = {};
        switch (variant.promotion) {
            case 'shogi':
                choice["p" + role as cg.Role] = "+";
                break;
            case 'kyoto':
                if (orig === "a0" || possiblePromotions[0].slice(-1) === "+")
                    choice["p" + role as cg.Role] = "+";
                else
                    choice[role.slice(1) as cg.Role] = "-";
                break;
            default:
                possiblePromotions.
                    map(move => move.slice(-1) as cg.PieceLetter).
                    sort((a, b) => variant.promotionOrder.indexOf(a) - variant.promotionOrder.indexOf(b)).
                    forEach(letter => {
                        choice[util.roleOf(letter)] = letter;
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
                const dropOrig = util.dropOrigOf(role);
                if (this.promoting.callback) this.promoting.callback(dropOrig, this.promoting.dest, "");
            } else {
                if (this.promoting.callback) this.promoting.callback(this.promoting.orig, this.promoting.dest, promo!);
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
        const width = this.ctrl.variant.boardWidth;
        const height = this.ctrl.variant.boardHeight;
        const pos = util.key2pos(dest);

        const choices = Object.keys(this.choices);

        const direction = color === orientation ? "bottom" : "top";
        const leftFile = (orientation === "white") ? pos[0] : width - 1 - pos[0];
        const left = leftFile * (100 / width);
        const topRank = (orientation === "white") ? height - 1 - pos[1] : pos[1];

        const side = color === orientation ? "ally" : "enemy";

        return h("div#extension_choice", {
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
                const rank = topRank + (direction === "bottom" ? i : -i);
                const top = rank * (100 / height);
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
