import { h, toVNode, VNode } from 'snabbdom';

import * as util from 'chessgroundx/util';
import * as cg from 'chessgroundx/types';

import { PromotionSuffix, promotedRole, unpromotedRole, promotionSuffix } from '@/chess';
import { patch, bind } from '@/document';
import { GameController } from '@/gameCtrl';
import { ExtraInput } from './input';

type PromotionChoices = Partial<Record<cg.Role, PromotionSuffix>>;

export class PromotionInput extends ExtraInput {
    private choices: PromotionChoices;

    constructor(ctrl: GameController) {
        super(ctrl);
        this.type = 'promotion';
        this.choices = {};
    }

    start(piece: cg.Piece, orig: cg.Orig, dest: cg.Key, meta: cg.MoveMetadata): void {
        this.data = { piece, orig, dest, meta };

        // in 960 castling case (king takes rook) dest piece may be undefined
        if (this.ctrl.chessground.state.boardState.pieces.get(dest) === undefined) {
            this.next('');
            return;
        }

        const choices = this.promotionChoices(piece, orig, dest);
        const autoSuffix = this.ctrl.variant.promotion.order[0];
        const autoRole = this.ctrl.variant.promotion.type === "shogi" ? undefined : util.roleOf(autoSuffix as cg.Letter);
        const disableAutoPromote = meta.ctrlKey;

        if (this.ctrl.variant.promotion.autoPromoteable &&
            this.ctrl.autoPromote &&
            !disableAutoPromote &&
            autoRole &&
            autoSuffix &&
            choices[autoRole] === autoSuffix)
            this.choices = { [autoRole]: autoSuffix };
        else
            this.choices = choices;

        if (Object.keys(this.choices).length === 1) {
            const role = Object.keys(this.choices)[0] as cg.Role;
            this.finish(role);
        } else {
            this.drawPromo(dest, piece.color);
        }
    }

    private promotionChoices(piece: cg.Piece, orig: cg.Orig, dest: cg.Key): PromotionChoices {
        const variant = this.ctrl.variant;
        const possiblePromotions = this.ctrl.legalMoves().filter(move => move.includes(orig + dest));
        const choices: PromotionChoices = {};

        possiblePromotions.map(promotionSuffix).forEach(suffix => {
            let role: cg.Role;
            if (suffix === '+') role = promotedRole(variant, piece);
            else if (suffix === '-') role = unpromotedRole(variant, piece);
            else if (suffix === '') role = piece.role;
            else role = util.roleOf(suffix);
            choices[role] = suffix;
        });

        return choices;
    }

    private promote(key: cg.Key, role: cg.Role): void {
        const ground = this.ctrl.chessground;
        const piece = ground.state.boardState.pieces.get(key);
        if (piece && piece.role !== role) {
            ground.setPieces(new Map([[key, {
                color: piece.color,
                role: role,
                promoted: true
            }]]));
        }
    }

    private drawPromo(dest: cg.Key, color: cg.Color): void {
        const container = toVNode(this.ctrl.chessground.state.dom.elements.container.querySelector('extension') as Node);
        patch(container, this.view(dest, color, this.ctrl.chessground.state.orientation));
    }

    private drawNoPromo(): void {
        const container = document.getElementById('extension_choice') as HTMLElement;
        if (container) patch(container, h('extension'));
    }

    private finish(role: cg.Role): void {
        if (this.data) {
            this.drawNoPromo();
            this.promote(this.data.dest, role);
            if (util.isDropOrig(this.data.orig))
                this.dropNext(role);
            else
                this.next(this.choices[role]!);
        }
    }

    private dropNext(role: cg.Role): void {
        // Drop promotion is executed by modifying the orig
        if (this.data)
            this.ctrl.processInput(this.data.piece, util.dropOrigOf(role), this.data.dest, this.data.meta, '', 'promotion');
        this.data = undefined;
    }

    private cancel(): void {
        this.drawNoPromo();
        this.ctrl.goPly(this.ctrl.ply);
    }

    private view(dest: cg.Key, color: cg.Color, orientation: cg.Color): VNode {
        const variant = this.ctrl.variant;
        const width = variant.board.dimensions.width;
        const height = variant.board.dimensions.height;
        const pos = util.key2pos(dest);

        const choices = Object.keys(this.choices) as cg.Role[];
        choices.sort((a, b) => variant.promotion.order.indexOf(this.choices[a]!) - variant.promotion.order.indexOf(this.choices[b]!));

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
