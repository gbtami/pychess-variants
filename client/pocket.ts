import { h, init } from "snabbdom";
import klass from 'snabbdom/modules/class';
import attributes from 'snabbdom/modules/attributes';
import properties from 'snabbdom/modules/props';
import listeners from 'snabbdom/modules/eventlisteners';
import style from 'snabbdom/modules/style';

import * as cg from 'chessgroundx/types';
import { dragNewPiece } from 'chessgroundx/drag';
import { setDropMode, cancelDropMode } from 'chessgroundx/drop';

import {role2san, unpromotedRole, VARIANTS} from './chess';
import {PockStateStuff} from "./pockTempStuff";
import {VNode} from "snabbdom/vnode";
import {opposite} from "chessgroundx/util";

const patch = init([klass, attributes, properties, style, listeners]);

type Position = 'top' | 'bottom';

export type Pocket = Partial<Record<cg.Role, number>>;
export type Pockets = [Pocket, Pocket];

// TODO:niki: update comment: There are 2 kind of mechanics for moving a piece from pocket to the board - 1.dragging it and 2.click to select and click to drop on target square
export const eventsDragging = ['mousedown', 'touchmove'];
export const eventsClicking = ['click'];
export const eventsDropping = ['mouseup', 'touchend'];

/**
 *
 */
export function pocketView(pockStateStuff: PockStateStuff,/*ctrl: RoundController | AnalysisController | EditorController,*/ color: cg.Color, position: Position) {
    const chessground = pockStateStuff.chessground;
    const pocket = pockStateStuff.pockets[position === 'top' ? 0 : 1];
    const roles = Object.keys(pocket); // contains the list of possible pieces/roles (i.e. for crazyhouse p-piece, n-piece, b-piece, r-piece, q-piece) in the order they will be displayed in the pocket

    // TODO Checking for type here is a mess. Should probably move to their respective classes
    const insertHook = {
        insert: (vnode: VNode) => {
            eventsDragging.forEach(name =>
                (vnode.elm as HTMLElement).addEventListener(name, (e: cg.MouchEvent) => {
                    if (chessground.state.movable.free || chessground.state.movable.color === color) drag(pockStateStuff, e);
                })
            );
            eventsDropping.forEach(name =>
                (vnode.elm as HTMLElement).addEventListener(name, (e: cg.MouchEvent) => {
                    if (chessground.state.movable.free) drop(pockStateStuff, e);
                })
            );
            eventsClicking.forEach(name =>
                (vnode.elm as HTMLElement).addEventListener(name, (e: cg.MouchEvent) => {
                    if (chessground.state.movable.free || chessground.state.movable.color === color) click(pockStateStuff, e);
                })
            );
            /* TODO editor clickdrop - NIKI:i don't think click drop makes sense - there is no click-move for board pieces either - should discuss in discord
            */
        }
    };

    return h('div.pocket.' + position, {
        class: { usable: true },
        style: {
            '--pocketLength': String(roles!.length),
            '--files': String(chessground.state.dimensions.width),
            '--ranks': String(chessground.state.dimensions.height),
        },
        hook: insertHook
    }, roles.map( (role: cg.Role) => {
        const nb = pocket[role] || 0;

        let clazz;

        const orientation = chessground.state.orientation;//ctrl.flip ? ctrl.oppcolor : ctrl.mycolor;
        const side = color === orientation ? "ally" : "enemy";

        const dropMode = chessground?.state.dropmode;
        const dropPiece = chessground?.state.dropmode.piece;
        const selectedSquare = dropMode?.active && dropPiece?.role === role && dropPiece?.color === color;

        // if (ctrl instanceof RoundController) { TODO:niki:in what cases is this check really needed ? can this code actually run and something appear as predrop without actually having to?
            const preDropRole = chessground.state.predroppable.current?.role;//ctrl.predrop?.role;TODO:niki:test this! not sure about it
            const activeColor = color === chessground.state.movable.color;//ctrl.turnColor;

            clazz = {
                premove: activeColor && preDropRole === role,
                'selected-square': selectedSquare,
            };
        // } else {
        //     clazz = {
        //         premove: false,
        //         'selected-square': selectedSquare,
        //     };
        // }

        return h(`piece.${role}.${color}.${side}`, {
            class: clazz,
            attrs: {
                'data-role': role,
                'data-color': color,
                'data-nb': nb,
            }
        });

    } ) );
}

export function click(pockStateStuff: PockStateStuff/*ctrl: EditorController | RoundController | AnalysisController*/, e: cg.MouchEvent): void {
    const chessground = pockStateStuff.chessground;

    if (e.button !== undefined && e.button !== 0) return; // only touch or left click

    const el = e.target as HTMLElement,
    role = el.getAttribute('data-role') as cg.Role,
    color = el.getAttribute('data-color') as cg.Color,
    number = el.getAttribute('data-nb');
    if (!role || !color || number === '0') return;
    const dropMode = chessground?.state.dropmode;
    const dropPiece = chessground?.state.dropmode.piece;

    const canceledDropMode = el.getAttribute("canceledDropMode");
    el.setAttribute("canceledDropMode", "");

    if ((!dropMode.active || dropPiece?.role !== role ) && canceledDropMode!=="true") {
        setDropMode(chessground.state, { color, role });

        // TODO:move below lines to drop.ts -> setDropMode
        // if (ctrl instanceof RoundController || ctrl instanceof AnalysisController) {TODO:niki:see same commented if in drag()
            if (chessground.state.movable.dests/*very first move with white might be undef*/) {
                const dropDests = new Map([ [role, chessground.state.movable.dests[role2san(role) + "@"] ] ]); // TODO:ideally pocket.ts should move to chessgroundx so dests must be set directly in the controller
                chessground.set({
                    dropmode: {
                        active: true,
                        dropDests: dropDests
                    }
                });
            }
        // }

    } else {
        cancelDropMode(chessground.state);
    }
    e.stopPropagation();
    e.preventDefault();
    refreshPockets(pockStateStuff);
}

/**
 *
 */
export function drag(pockStateStuff: PockStateStuff/*EditorController | RoundController | AnalysisController*/, e: cg.MouchEvent): void {
    const chessground = pockStateStuff.chessground;

    if (e.button !== undefined && e.button !== 0) return; // only touch or left click
    // if (ctrl instanceof RoundController && ctrl.spectator) return;TODO:niki:move to the canDragFromIt boolean
    const el = e.target as HTMLElement,
    role = el.getAttribute('data-role') as cg.Role,
    color = el.getAttribute('data-color') as cg.Color,
    n = Number(el.getAttribute('data-nb'));
    el.setAttribute("canceledDropMode", ""); // We want to know if later in this method cancelDropMode was called,
                                             // so right after mouse button is up and dragging is over if a click event is triggered
                                             // (which annoyingly does happen if mouse is still over same pocket element)
                                             // then we know not to call setDropMode selecting the piece we have just unselected.
                                             // Alternatively we might not cancelDropMode on drag of same piece but then after drag is over
                                             // the selected piece remains selected which is not how board pieces behave and more importantly is counter intuitive
    if (!role || !color || n === 0) return;

    // always cancel drop mode if it is active
    if (chessground.state.dropmode.active) {
        cancelDropMode(chessground.state);

        if (chessground.state.dropmode.piece?.role === role) {
            // we mark it with this only if we are cancelling the same piece we "drag"
            el.setAttribute("canceledDropMode", "true");
        }
    }

    //TODO:niki: hmm? is this even a good idea? does drag always result in deleting no matter what?
    // if (ctrl instanceof EditorController) { // immediately decrease piece count for editor
    //     let index = color === 'white' ? 1 : 0;
    //     if (ctrl.flip) index = 1 - index;
    //     ctrl.pockStateStuff.pockets[index][role]!--;
    //     refreshPockets(ctrl.pockStateStuff);
    //     ctrl.onChange();
    // }

    // if (ctrl instanceof RoundController || ctrl instanceof AnalysisController) {//TODO:niki:maybe checking for chessground.movable.dests is enough - maybe editor does not init that ever
        if (chessground.state.movable.dests/*very first move with white might be undef - also editor probably always undef?*/) {
            const dropDests = new Map([[role, chessground.state.movable.dests[role2san(role) + "@"]]]); // TODO:imho ideally pocket.ts should move to chessgroundx - this (ctrl.dests) then might not be accessible - is it?
            chessground.set({
                dropmode: {
                    dropDests: dropDests,
                }
            });
        }
    // }

    e.stopPropagation();
    e.preventDefault();
    dragNewPiece(chessground.state, { color, role }, e);
}

export function drop(pockStateStuff: PockStateStuff, e: cg.MouchEvent): void {
    console.log("pocket drop()");
    const el = e.target as HTMLElement;
    const piece = pockStateStuff.chessground.state.draggable.current?.piece;
    console.log(piece);
    if (piece) {
        const role = unpromotedRole(/*pockStateStuff.variant TODO:niki:what about this?*/VARIANTS.chess, piece);
        const color = el.getAttribute('data-color') as cg.Color;
        let index = color === 'white' ? 1 : 0;
        if (pockStateStuff.isFlipped()) index = 1 - index;
        const pocket = pockStateStuff.pockets[index];
        console.log(role);
        console.log(color);
        console.log(index);
        console.log(pocket);
        if (role in pocket) {
            pocket[role]!++;
            refreshPockets(pockStateStuff);
            // ctrl.onChange();//TODO:niki:what to do with this - call somehow via chessground
        }
    }
}

// TODO: after 1 move made only 1 pocket update needed at once, no need to update both
export function refreshPockets(state: PockStateStuff/*ctrl: RoundController | AnalysisController | EditorController*//*, vpocket0?: VNode | HTMLElement, vpocket1?: VNode | HTMLElement*/) : void {
    // update pockets from FEN
        // console.log(o,c,po,pc);
    const topColor = opposite(state.chessground.state.orientation);
    const bottomColor = state.chessground.state.orientation;

    state.vpocket0 = patch(/*vpocket0? vpocket0 :*/ state.vpocket0, pocketView(state, topColor, "top"));
    state.vpocket1 = patch(/*vpocket1? vpocket1 :*/ state.vpocket1, pocketView(state, bottomColor, "bottom"));
}

function pocket2str(pocket: Pocket) {
    const letters: string[] = [];
    for (const role in pocket) {
        letters.push(role2san(role as cg.Role).repeat(pocket[role as cg.Role] || 0));
    }
    return letters.join('');
}

export function pockets2str(pockStateStuff: PockStateStuff) {
    return '[' + pocket2str(pockStateStuff.pockets[1]) + pocket2str(pockStateStuff.pockets[0]).toLowerCase() + ']';
}
