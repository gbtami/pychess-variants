import { init, h } from "snabbdom";
import { VNode } from 'snabbdom/vnode';
import klass from 'snabbdom/modules/class';
import attributes from 'snabbdom/modules/attributes';
import properties from 'snabbdom/modules/props';
import style from 'snabbdom/modules/style';
import listeners from 'snabbdom/modules/eventlisteners';

import * as cg from 'chessgroundx/types';
import { dragNewPiece } from 'chessgroundx/drag';

import { EditorController }  from './editorCtrl';
import { letter2role } from './chess';

const patch = init([klass, attributes, properties, style, listeners]);

type Position = 'top' | 'bottom';

const eventNames = ['mousedown', 'touchstart'];

export function piecesView(ctrl: EditorController, color: cg.Color, position: Position) {
    const width = ctrl.variant.boardWidth;
    const height = ctrl.variant.boardHeight;
    const roles = ctrl.variant.pieceRoles(color);
    return h('div.pocket.' + position + '.editor.usable', {
        style: {
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
    }, roles.map(r => {
        const promoted = r.length > 1;
        if (r.endsWith('~')) {
            r = r.slice(0, -1);
        }
        const role = letter2role(r);
        const orientation = ctrl.flip ? ctrl.oppcolor : ctrl.mycolor;
        const side = color === orientation ? "ally" : "enemy";
        return h(`piece.${role}.${promoted ? "promoted." : ""}${color}.${side}`, {
            attrs: {
                'data-role': role,
                'data-color': color,
                'data-promoted': promoted ? 'true' : 'false',
                'data-nb': -1,
            }
        });
    }));
}

export function drag(ctrl: EditorController, e: cg.MouchEvent): void {
    if (e.button !== undefined && e.button !== 0) return; // only touch or left click
    const el = e.target as HTMLElement,
        role = el.getAttribute('data-role') as cg.Role,
        color = el.getAttribute('data-color') as cg.Color,
        promoted = el.getAttribute('data-promoted') === 'true';

    e.stopPropagation();
    e.preventDefault();
    dragNewPiece(ctrl.chessground.state, { color, role, promoted }, e);
}

export function iniPieces(ctrl: EditorController, vpieces0: VNode | HTMLElement, vpieces1: VNode | HTMLElement): void {
    ctrl.vpieces0 = patch(vpieces0, piecesView(ctrl, ctrl.flip ? ctrl.mycolor : ctrl.oppcolor, "top"));
    ctrl.vpieces1 = patch(vpieces1, piecesView(ctrl, ctrl.flip ? ctrl.oppcolor : ctrl.mycolor, "bottom"));
}
