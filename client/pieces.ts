import { h, VNode } from "snabbdom";

import * as cg from 'chessgroundx/types';

import { EditorController } from './editorCtrl';
import { patch } from './document';
import { promotedRole } from "./chess";

type Position = 'top' | 'bottom';

const eventNames = ['mousedown', 'touchstart'];

export function piecesView(ctrl: EditorController, color: cg.Color, position: Position) {
    const width = ctrl.variant.boardWidth;
    const height = ctrl.variant.boardHeight;
    const roles: (cg.Role | '')[] = [...ctrl.variant.pieceRoles[color]];
    if (['shogi', 'kyoto'].includes(ctrl.variant.promotion)) {
        const len = roles.length;
        const width = ctrl.variant.boardWidth;
        const extraRoles = roles.
            filter(r => ctrl.variant.promoteableRoles.includes(r as cg.Role)).
            map(r => promotedRole(ctrl.variant, { role: r as cg.Role, color: color }));
        if (len <= width && len + extraRoles.length > width) {
            for (let i = len; i < width; i++)
                roles.push('');
            let j = 0;
            for (let i = 0; i < len; i++) {
                if (roles[i][0] === extraRoles[j][1]) {
                    roles.push(extraRoles[j]);
                    j++;
                } else {
                    roles.push('');
                }
            }
        } else {
            roles.push(...extraRoles);
        }
    }
    return h('div.pocket.' + position + '.editor.usable', {
        style: {
            '--pocketLength': String(width),
            '--editorLength': String(roles.length),
            '--piecerows': String(Math.ceil(roles.length / width)),
            '--files': String(width),
            '--ranks': String(height),
        },
        hook: {
            insert: vnode => {
                eventNames.forEach(name => {
                    (vnode.elm as HTMLElement).addEventListener(name, (e: cg.MouchEvent) => {
                        drag(ctrl, e);
                    })
                });
            }
        }
    }, roles.map(role => {
        if (role === '') return h('nosquare');
        const promoted = role.slice(0, role.indexOf('-')).length > 1;
        if (role[1] === '~')
            role = role[0] + role.slice(2) as cg.Role;
        const orientation = ctrl.flipped() ? ctrl.oppcolor : ctrl.mycolor;
        const side = color === orientation ? "ally" : "enemy";
        return h('square', h(`piece.${role}.${promoted ? "promoted." : ""}${color}.${side}`, {
            attrs: {
                'data-role': role,
                'data-color': color,
                'data-promoted': promoted ? 'true' : 'false',
                'data-nb': -1,
            }
        }));
    }));
}

export function drag(ctrl: EditorController, e: cg.MouchEvent): void {
    if (e.button !== undefined && e.button !== 0) return; // only touch or left click
    const el = (e.target as HTMLElement).firstChild as HTMLElement,
        role = el.getAttribute('data-role') as cg.Role,
        color = el.getAttribute('data-color') as cg.Color,
        promoted = el.getAttribute('data-promoted') === 'true';

    if (role) {
        e.stopPropagation();
        e.preventDefault();
        ctrl.chessground.dragNewPiece({ color, role, promoted }, false, e);
    }
}

export function iniPieces(ctrl: EditorController, vpieces0: VNode | HTMLElement, vpieces1: VNode | HTMLElement): void {
    ctrl.vpieces0 = patch(vpieces0, piecesView(ctrl, ctrl.flipped() ? ctrl.mycolor : ctrl.oppcolor, "top"));
    ctrl.vpieces1 = patch(vpieces1, piecesView(ctrl, ctrl.flipped() ? ctrl.oppcolor : ctrl.mycolor, "bottom"));
}
