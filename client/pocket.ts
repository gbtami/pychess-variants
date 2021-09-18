import { h, init } from "snabbdom";
import { VNode } from 'snabbdom/vnode';
import klass from 'snabbdom/modules/class';
import attributes from 'snabbdom/modules/attributes';
import properties from 'snabbdom/modules/props';
import listeners from 'snabbdom/modules/eventlisteners';
import style from 'snabbdom/modules/style';

import * as cg from 'chessgroundx/types';
import * as util from 'chessgroundx/util';
import { dragNewPiece } from 'chessgroundx/drag';
import { setDropMode, cancelDropMode } from 'chessgroundx/drop';

import { role2san, letter2role, lc, unpromotedRole } from './chess';
import RoundController from './roundCtrl';
import AnalysisController from './analysisCtrl';
import { EditorController } from './editorCtrl';

const patch = init([klass, attributes, properties, style, listeners]);

type Position = 'top' | 'bottom';

type Pocket = Partial<Record<cg.Role, number>>;
export type Pockets = [Pocket, Pocket];

// There are 2 kind of mechanics for moving a piece from pocket to the board - 1.dragging it and 2.click to select and click to drop on target square
const eventsDragging = ['mousedown', 'touchmove'];
const eventsClicking = ['click'];
const eventsDropping = ['mouseup', 'touchend'];

/**
 *
 */
export function pocketView(ctrl: RoundController | AnalysisController | EditorController, color: cg.Color, position: Position) {
    const pocket = ctrl.pockets[position === 'top' ? 0 : 1];
    const roles = Object.keys(pocket); // contains the list of possible pieces/roles (i.e. for crazyhouse p-piece, n-piece, b-piece, r-piece, q-piece) in the order they will be displayed in the pocket

    let insertHook;
    // TODO Checking for type here is a mess. Should probably move to their respective classes
    if (ctrl instanceof EditorController) {
        insertHook = {
            insert: (vnode: VNode) => {
                eventsDragging.forEach(name =>
                    (vnode.elm as HTMLElement).addEventListener(name, (e: cg.MouchEvent) => {
                        drag(ctrl, e);
                    })
                );
                eventsDropping.forEach(name =>
                    (vnode.elm as HTMLElement).addEventListener(name, (e: cg.MouchEvent) => {
                        drop(ctrl, e);
                    })
                );
                /* TODO editor clickdrop
                eventsClicking.forEach(name =>
                    (vnode.elm as HTMLElement).addEventListener(name, (e: cg.MouchEvent) => {
                        click(ctrl, e);
                    })
                );
                */
            }
        };
    } else if (ctrl instanceof AnalysisController) { // enabling both the pocket whose turn it is
        insertHook = {
            insert: (vnode: VNode) => {
                eventsDragging.forEach(name =>
                    (vnode.elm as HTMLElement).addEventListener(name, (e: cg.MouchEvent) => {
                        if (color===ctrl.turnColor) drag(ctrl, e);
                    })
                );
                eventsClicking.forEach(name =>
                    (vnode.elm as HTMLElement).addEventListener(name, (e: cg.MouchEvent) => {
                        if (color===ctrl.turnColor) click(ctrl, e);
                    })
                );
            }
        }
    } else { // RoundController
        insertHook = { // always enabling only my pocket
            insert: (vnode: VNode) => {
                eventsDragging.forEach(name =>
                    (vnode.elm as HTMLElement).addEventListener(name, (e: cg.MouchEvent) => {
                        if (position === (ctrl.flip ? 'top' : 'bottom') ) drag(ctrl, e);
                    })
                );
                eventsClicking.forEach(name =>
                    (vnode.elm as HTMLElement).addEventListener(name, (e: cg.MouchEvent) => {
                        if (position === (ctrl.flip ? 'top' : 'bottom') ) click(ctrl, e);
                    })
                );
            }
        }
    }

    return h('div.pocket.' + position, {
        class: { usable: true },
        style: {
            '--pocketLength': String(roles!.length),
            '--files': String(ctrl.variant.boardWidth),
            '--ranks': String(ctrl.variant.boardHeight),
        },
        hook: insertHook
    }, roles.map( (role: cg.Role) => {
        const nb = pocket[role] || 0;

        let clazz;

        const orientation = ctrl.flip ? ctrl.oppcolor : ctrl.mycolor;
        const side = color === orientation ? "ally" : "enemy";

        const dropMode = ctrl.chessground?.state.dropmode;
        const dropPiece = ctrl.chessground?.state.dropmode.piece;
        const selectedSquare = dropMode?.active && dropPiece?.role === role && dropPiece?.color === color;

        if (ctrl instanceof RoundController) {
            const preDropRole = ctrl.predrop?.role;
            const activeColor = color === ctrl.turnColor;

            clazz = {
                premove: activeColor && preDropRole === role,
                'selected-square': selectedSquare,
            };
        } else {
            clazz = {
                premove: false,
                'selected-square': selectedSquare,
            };
        }

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

export function click(ctrl: EditorController | RoundController | AnalysisController, e: cg.MouchEvent): void {

    if (e.button !== undefined && e.button !== 0) return; // only touch or left click

    const el = e.target as HTMLElement,
    role = el.getAttribute('data-role') as cg.Role,
    color = el.getAttribute('data-color') as cg.Color,
    number = el.getAttribute('data-nb');
    if (!role || !color || number === '0') return;
    const dropMode = ctrl.chessground?.state.dropmode;
    const dropPiece = ctrl.chessground?.state.dropmode.piece;

    const canceledDropMode = el.getAttribute("canceledDropMode");
    el.setAttribute("canceledDropMode", "");

    if ((!dropMode.active || dropPiece?.role !== role ) && canceledDropMode!=="true") {
        setDropMode(ctrl.chessground.state, { color, role });

        // TODO:move below lines to drop.ts -> setDropMode
        if (ctrl instanceof RoundController || ctrl instanceof AnalysisController) {
            if (ctrl.dests/*very first move with white might be undef*/) {
                const dropDests = new Map([ [role, ctrl.dests.get(util.letterOf(role, true) + "@" as cg.Orig)! ] ]); // TODO:ideally pocket.ts should move to chessgroundx so dests must be set directly in the controller
                ctrl.chessground.set({
                    dropmode: {
                        active: true,
                        dropDests: dropDests
                    }
                });
            }
        }

    } else {
        cancelDropMode(ctrl.chessground.state);
    }
    e.stopPropagation();
    e.preventDefault();
    refreshPockets(ctrl);
}

/**
 *
 */
export function drag(ctrl: EditorController | RoundController | AnalysisController, e: cg.MouchEvent): void {

    if (e.button !== undefined && e.button !== 0) return; // only touch or left click
    if (ctrl instanceof RoundController && ctrl.spectator) return;
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
    if (ctrl.chessground.state.dropmode.active) {
        cancelDropMode(ctrl.chessground.state);

        if (ctrl.chessground.state.dropmode.piece?.role === role) {
            // we mark it with this only if we are cancelling the same piece we "drag"
            el.setAttribute("canceledDropMode", "true");
        }
    }

    if (ctrl instanceof EditorController) { // immediately decrease piece count for editor
        let index = color === 'white' ? 1 : 0;
        if (ctrl.flip) index = 1 - index;
        ctrl.pockets[index][role]!--;
        refreshPockets(ctrl);
        ctrl.onChange();
    }

    if (ctrl instanceof RoundController || ctrl instanceof AnalysisController) {
        if (ctrl.dests/*very first move with white might be undef*/) {
            const dropDests = new Map([[role, ctrl.dests.get(util.letterOf(role, true) + "@" as cg.Orig)!]]); // TODO:imho ideally pocket.ts should move to chessgroundx - this (ctrl.dests) then might not be accessible - is it?
            ctrl.chessground.set({
                dropmode: {
                    dropDests: dropDests,
                }
            });
        }
    }

    e.stopPropagation();
    e.preventDefault();
    dragNewPiece(ctrl.chessground.state, { color, role }, e);
}

export function drop(ctrl: EditorController, e: cg.MouchEvent): void {
    console.log("pocket drop()");
    const el = e.target as HTMLElement;
    const piece = ctrl.chessground.state.draggable.current?.piece;
    console.log(piece);
    if (piece) {
        const role = unpromotedRole(ctrl.variant, piece);
        const color = el.getAttribute('data-color') as cg.Color;
        let index = color === 'white' ? 1 : 0;
        if (ctrl.flip) index = 1 - index;
        const pocket = ctrl.pockets[index];
        console.log(role);
        console.log(color);
        console.log(index);
        console.log(pocket);
        if (role in pocket) {
            pocket[role]!++;
            refreshPockets(ctrl);
            ctrl.onChange();
        }
    }
}

// TODO: after 1 move made only 1 pocket update needed at once, no need to update both
export function refreshPockets(ctrl: RoundController | AnalysisController | EditorController, vpocket0?: VNode | HTMLElement, vpocket1?: VNode | HTMLElement) : void {
    // update pockets from FEN
    if (ctrl.hasPockets) {
        // console.log(o,c,po,pc);
        ctrl.vpocket0 = patch(vpocket0? vpocket0 : ctrl.vpocket0, pocketView(ctrl, (ctrl.flip) ? ctrl.mycolor : ctrl.oppcolor, "top"));
        ctrl.vpocket1 = patch(vpocket1? vpocket1 : ctrl.vpocket1, pocketView(ctrl, (ctrl.flip) ? ctrl.oppcolor : ctrl.mycolor, "bottom"));
    }
}

export function updatePockets(ctrl: RoundController | AnalysisController | EditorController, vpocket0?: VNode | HTMLElement, vpocket1?: VNode | HTMLElement): void {
    // update pockets from FEN
    if (ctrl.hasPockets) {
        const parts = ctrl.fullfen.split(" ");
        const fen_placement = parts[0];
        let pockets = "";
        const bracketPos = fen_placement.indexOf("[");
        if (bracketPos !== -1) {
            pockets = fen_placement.slice(bracketPos);
        }

        const c = ctrl.mycolor;
        const o = ctrl.oppcolor;
        const rc = ctrl.variant.pocketRoles(c) ?? [];
        const ro = ctrl.variant.pocketRoles(o) ?? [];
        const pc: Pocket = {};
        const po: Pocket = {};
        rc.forEach(r => pc[letter2role(r)] = lc(pockets, r, c==='white'));
        ro.forEach(r => po[letter2role(r)] = lc(pockets, r, o==='white'));
        if (ctrl.flip) {
            ctrl.pockets = [pc, po];
        } else {
            ctrl.pockets = [po, pc];
        }
        // console.log(o,c,po,pc);
        refreshPockets(ctrl, vpocket0, vpocket1);
    }
}

function pocket2str(pocket: Pocket) {
    const letters: string[] = [];
    for (const role in pocket) {
        letters.push(role2san(role as cg.Role).repeat(pocket[role as cg.Role] || 0));
    }
    return letters.join('');
}

export function pockets2str(ctrl: EditorController) {
    return '[' + pocket2str(ctrl.pockets[1]) + pocket2str(ctrl.pockets[0]).toLowerCase() + ']';
}
