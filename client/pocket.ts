import { h, init } from "snabbdom";
import { VNode } from 'snabbdom/vnode';
import klass from 'snabbdom/modules/class';
import attributes from 'snabbdom/modules/attributes';
import properties from 'snabbdom/modules/props';
import listeners from 'snabbdom/modules/eventlisteners';
import style from 'snabbdom/modules/style';

import * as cg from 'chessgroundx/types';
import { dragNewPiece } from 'chessgroundx/drag';
import { setDropMode, cancelDropMode } from 'chessgroundx/drop';
import { Color, Role } from 'chessgroundx/types';

import { role2san, letter2role, lc } from './chess';
import RoundController from './roundCtrl';
import AnalysisController from './analysisCtrl';
import EditorController from './editor';

const patch = init([klass, attributes, properties, style, listeners]);

type Position = 'top' | 'bottom';

type Pocket = Partial<Record<Role, number>>;
export type Pockets = [Pocket, Pocket];

// There are 2 kind of mechanics for moving a piece from pocket to the board - 1.dragging it and 2.click to select and click to drop on target square
const eventsDragging = ['mousedown', 'touchmove'];
const eventsClicking = ['click'];

/**
 *
 */
export function pocketView(ctrl: RoundController | AnalysisController | EditorController, color: Color, position: Position) {
    const pocket = ctrl.pockets[position === 'top' ? 0 : 1];
    const roles = Object.keys(pocket); // contains the list of possible pieces/roles (i.e. for crazyhouse p-piece, n-piece, b-piece, r-piece, q-piece) in the order they will be displayed in the pocket

    let insertHook;
    if (ctrl instanceof EditorController) {
        insertHook = {}; // TODO:editor not implemented for zh. always enable both pockets all the time
    } else if (ctrl instanceof AnalysisController) { // enabling both the pocket whose turn it is
        insertHook = {
            insert: vnode => {
                eventsDragging.forEach(name =>
                    (vnode.elm as HTMLElement).addEventListener(name, (e: cg.MouchEvent) => {
                        if (color===ctrl.turnColor) drag((ctrl as RoundController | AnalysisController), e);
                    })
                );
                eventsClicking.forEach(name =>
                    (vnode.elm as HTMLElement).addEventListener(name, (e: cg.MouchEvent) => {
                        if (color===ctrl.turnColor) click((ctrl as RoundController | AnalysisController), e);
                    })
                );
            }
        }
    } else { // RoundController
        insertHook = { // always enabling only my pocket
            insert: vnode => {
                eventsDragging.forEach(name =>
                    (vnode.elm as HTMLElement).addEventListener(name, (e: cg.MouchEvent) => {
                        if (position === (ctrl.flip ? 'top' : 'bottom') ) drag((ctrl as RoundController | AnalysisController), e);
                    })
                );
                eventsClicking.forEach(name =>
                    (vnode.elm as HTMLElement).addEventListener(name, (e: cg.MouchEvent) => {
                        if (position === (ctrl.flip ? 'top' : 'bottom') ) click((ctrl as RoundController | AnalysisController), e);
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
      }, roles.map(role => {
        const nb = pocket[role] || 0;

        let clazz;

        const dropMode = ctrl.chessground?.state.dropmode;
        const dropPiece = ctrl.chessground?.state.dropmode.piece;
        const selectedSquare = dropMode?.active && dropPiece?.role == role && dropPiece?.color == color;

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

        return h('piece.' + role + '.' + color, {
            class: clazz,
            attrs: {
                'data-role': role,
                'data-color': color,
                'data-nb': nb,
            }
        });

    } ) );
}

export function click(ctrl: RoundController | AnalysisController, e: cg.MouchEvent): void {

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
        if ( ctrl.dests/*very first move with white might be undef*/ && ctrl.turnColor === ctrl.mycolor) {
            const dropDests = new Map([ [role, ctrl.dests[role2san(role) + "@"] ] ]); // TODO:ideally pocket.ts should move to chessgroundx - this (ctrl.dests) then might not be accessible - is it?
            ctrl.chessground.set({
                dropmode: {
                    active: true,
                    dropDests: dropDests
                }
            });
        } else {
            // predrop logic already moved to setDropMode
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
export function drag(ctrl: RoundController | AnalysisController, e: cg.MouchEvent): void {

    if (e.button !== undefined && e.button !== 0) return; // only touch or left click
    if (ctrl.spectator && ctrl instanceof RoundController) return;
    const el = e.target as HTMLElement,
    role = el.getAttribute('data-role') as cg.Role,
    color = el.getAttribute('data-color') as cg.Color,
    number = el.getAttribute('data-nb');
    el.setAttribute("canceledDropMode", ""); // We want to know if later in this method cancelDropMode was called,
                                                                // so right after mouse button is up and dragging is over if a click event is triggered
                                                                // (which annoyingly does happen if mouse is still over same pocket element)
                                                                // then we know not to call setDropMode selecting the piece we have just unselected.
                                                                // Alternatively we might not cancelDropMode on drag of same piece but then after drag is over
                                                                // the selected piece remains selected which is not how board pieces behave and more importantly is counter intuitive
    if (!role || !color || number === '0') return;

    // always cancel drop mode if it is active
    if (ctrl.chessground.state.dropmode.active) {
        cancelDropMode(ctrl.chessground.state);

        if (ctrl.chessground.state.dropmode.piece?.role == role) {
            // we mark it with this only if we are cancelling the same piece we "drag"
            el.setAttribute("canceledDropMode", "true");
        }
    }

    if ( ctrl.dests/*very first move with white might be undef*/ && ctrl.turnColor === ctrl.mycolor) {
        const dropDests = new Map([[role, ctrl.dests[role2san(role) + "@"]]]); // TODO:imho ideally pocket.ts should move to chessgroundx - this (ctrl.dests) then might not be accessible - is it?
        ctrl.chessground.set({
            dropmode: {
                dropDests: dropDests,
            }
        });
    }

    e.stopPropagation();
    e.preventDefault();
    dragNewPiece(ctrl.chessground.state, { color, role }, e);
}

export function dropIsValid(dests: cg.Dests, role: cg.Role, key: cg.Key): boolean {
    const drops = dests[role2san(role) + "@"];
    if (drops === undefined || drops === null) return false;
    return drops.indexOf(key) !== -1;
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
        letters.push(role2san(role as Role).repeat(pocket[role]));
    }
    return letters.join('');
}

export function pockets2str(ctrl) {
    return '[' + pocket2str(ctrl.pockets[1]) + pocket2str(ctrl.pockets[0]).toLowerCase() + ']';
}
