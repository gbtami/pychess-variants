import { h, init } from "snabbdom";
import klass from 'snabbdom/modules/class';
import attributes from 'snabbdom/modules/attributes';
import properties from 'snabbdom/modules/props';
import style from 'snabbdom/modules/style';
import listeners from 'snabbdom/modules/eventlisteners';

import * as cg from 'chessgroundx/types';
import { dragNewPiece } from 'chessgroundx/drag';
import { Color, dimensions } from 'chessgroundx/types';

import EditorController from './editor';
import { VARIANTS } from './chess';

const patch = init([klass, attributes, properties, style, listeners]);

type Position = 'top' | 'bottom';

const eventNames = ['mousedown', 'touchstart'];

export function piecesView(ctrl: EditorController, color: Color, position: Position) {
    const roles = VARIANTS[ctrl.variant].pieceRoles(color);
    return h('div.pocket.' + position + '.editor.usable', {
        style: { '--pieces': String(roles.length), '--files': String(dimensions[VARIANTS[ctrl.variant].geometry].width) },
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
        return h('piece.' + role + '.' + color, {
            attrs: {
                'data-role': role,
                'data-color': color,
                'data-nb': -1,
            }
        });
    }));
}

export function drag(ctrl: EditorController, e: cg.MouchEvent): void {
    if (e.button !== undefined && e.button !== 0) return; // only touch or left click
    const el = e.target as HTMLElement,
    role = el.getAttribute('data-role') as cg.Role,
    color = el.getAttribute('data-color') as cg.Color;

    e.stopPropagation();
    e.preventDefault();
    dragNewPiece(ctrl.chessground.state, { color, role }, e);
}

export function iniPieces(ctrl: EditorController, vpocket0, vpocket1): void {
    ctrl.vpocket0 = patch(vpocket0, piecesView(ctrl, ctrl.flip ? ctrl.mycolor : ctrl.oppcolor, "top"));
    ctrl.vpocket1 = patch(vpocket1, piecesView(ctrl, ctrl.flip ? ctrl.oppcolor : ctrl.mycolor, "bottom"));
    console.log(vpocket1);
}
