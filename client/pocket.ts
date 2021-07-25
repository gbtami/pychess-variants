//TODO:maybe move this to chessgroundx - in one version of shogiground it is moved there, but also logically the pocket belongs to the board - this way more  board logic like calls to updatePockets can be moved entireliy to chessgroundx and away of pychess

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

//There are 2 kind of mechanics for moving a piece from pocket to the board - 1.dragging it and 2.click to select and click to drop on target square
const eventNames1 = ['mousedown', 'touchmove'];
const eventNames2 = ['click'];
//TODO: it is possible instead of above events, to make it a bit more complex by detecting mousemove before/after mousedown and this way
//      do select/unselect only on click and not also on dragging which triggers click event even if mouse moved as long as mouseup happens on same element
//      but that would not be consistent with board pieces behaviour where select/unselect happens in same way (i.e. drag is a click if within the area of same piece/square)
//TODO: Another maybe more important point is it would be nice somehow (maybe plug behaviour in drag.end()) to unselect if currently selected pieces is dragged into nothing -
//      feels more natural to unselect when obiously user is dragging a piece away of the board instead of using it and it has been selected before that

/**
 *
 */
export function pocketView(ctrl: RoundController | AnalysisController | EditorController, color: Color, position: Position) {
    const pocket = ctrl.pockets[position === 'top' ? 0 : 1];
    const roles = Object.keys(pocket);//contains the list of possible pieces/roles (i.e. for crazyhouse p-piece, n-piece, b-piece, r-piece, q-piece) in the order they will be displayed in the pocket

    let insertHook;
    if (ctrl instanceof EditorController) {
        insertHook = {};
    } else {
        insertHook = {
            insert: vnode => {
                eventNames1.forEach(name =>
                    (vnode.elm as HTMLElement).addEventListener(name, (e: cg.MouchEvent) => {
                        if (position === (ctrl.flip ? 'top' : 'bottom') /*&& crazyKeys.length == 0 TODO:what is this?*/) drag((ctrl as RoundController | AnalysisController), e);
                    })
                );
                eventNames2.forEach(name =>
                    (vnode.elm as HTMLElement).addEventListener(name, (e: cg.MouchEvent) => {
                        if (position === (ctrl.flip ? 'top' : 'bottom') /*&& crazyKeys.length == 0 TODO:what is this?*/) click((ctrl as RoundController | AnalysisController), e);
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
    let onEventHandler;
    if (ctrl instanceof EditorController) {
        onEventHandler = {
            click: (event) => {
                let newValue: number;
                const oldValue = parseInt((event.target as HTMLElement).getAttribute("data-nb")!);
                newValue = oldValue + ((event.ctrlKey) ? -1 : 1);
                newValue = Math.min(Math.max(newValue, 0), ctrl.variant.boardWidth);
                if (oldValue !== newValue) {
                    // patch(event.target as HTMLElement, h('piece.' + role + '.' + color, {attrs: {'data-nb': newValue}}));
                    if (event.ctrlKey) {
                        pocket[role]--;
                    } else {
                        pocket[role]++;
                    }

                    if (position === "top") {
                        ctrl.vpocket0 = patch(ctrl.vpocket0, pocketView(ctrl, color, "top"));
                    } else {
                        ctrl.vpocket1 = patch(ctrl.vpocket1, pocketView(ctrl, color, "bottom"));
                    }

                    ctrl.pocketsPart = pockets2str(ctrl);
                    ctrl.onChange();
                }
            }
        }
    } else {
        onEventHandler = {};
    }

    if (ctrl instanceof RoundController) {
        const dropMode = ctrl.chessground?.state.dropmode;
        const dropPiece = ctrl.chessground?.state.dropmode.piece;
        const selectedSquare = dropMode?.active && dropPiece?.role == role && dropPiece?.color == color;
        const preDropRole = ctrl.predrop?.role;
        const activeColor = color === ctrl.turnColor;//TODO:not sure if mycolor or current color of player whose turn it is?

        return h('piece.' + role + '.' + color, {
          class: {
            premove: activeColor && preDropRole === role,
            'selected-square': selectedSquare,
          },
          attrs: {
            'data-role': role,
            'data-color': color,
            'data-nb': nb,
          },
          on: onEventHandler
        });
        
    } else {
        //TODO:do not duplicate the return expression, but instead figure out how to condition the class thing
        return h('piece.' + role + '.' + color, {
          attrs: {
            'data-role': role,
            'data-color': color,
            'data-nb': nb,
          },
          on: onEventHandler
        });
    }

  }));
}

/**
 * 
 */
export function click(ctrl: RoundController | AnalysisController, e: cg.MouchEvent): void {
    console.log('clickkkkkkkk. ctrl=' + ctrl + ". e = " + e);
    //click event is triggered even if user holds mouse button down and drags the piece for however long and far just as long as when dropping it, the mouse is back
    //somewhere on the original piece. That is not a click in my book, so have to detect there was dragging between the mouse down/up events and not treat it as such.
    //TODO:is it same on mobile/touch events?

    if (e.button !== undefined && e.button !== 0) return; // only touch or left click
    //if (ctrl.replaying() || !ctrl.isPlaying()) return; TODO: are there such analogues in pychess - maybe controller types
    
    const el = e.target as HTMLElement,
    role = el.getAttribute('data-role') as cg.Role,
    color = el.getAttribute('data-color') as cg.Color,
    number = el.getAttribute('data-nb');
    if (!role || !color || number === '0') return;
    const dropMode = ctrl.chessground?.state.dropmode;
    const dropPiece = ctrl.chessground?.state.dropmode.piece;
    if (!dropMode.active || dropPiece?.role !== role) {
        setDropMode(ctrl.chessground.state, { color, role });

        if ( ctrl.turnColor === ctrl.mycolor) {

            const dropDests = new Map([ [role, ctrl.dests[role2san(role) + "@"] ] ]);//TODO:ideally pocket.ts should move to chessgroundx - this (ctrl.dests) then might not be accessible - is it?
            
            //ctrl.chessground.newPiece({"role": role, "color": color}, 'a0')
            ctrl.chessground.set({
                turnColor: color,
                dropmode: {
                    active: true,
                    dropDests: dropDests,
                    showDropDests: ctrl.showDests,
                },
            });
        } else {
        }

    } else {
        cancelDropMode(ctrl.chessground.state);
        ctrl.chessground.selectSquare(null);

    }
    e.stopPropagation();
    e.preventDefault();
    updatePockets(ctrl,ctrl.vpocket0,ctrl.vpocket1);
}

/**
 *
 */
export function drag(ctrl: RoundController | AnalysisController, e: cg.MouchEvent): void {

    console.log('dragggggggg. ctrl=' + ctrl + ". e = " + e);

    if (e.button !== undefined && e.button !== 0) return; // only touch or left click
    if (ctrl.spectator && ctrl instanceof RoundController) return;
    const el = e.target as HTMLElement,
    role = el.getAttribute('data-role') as cg.Role,
    color = el.getAttribute('data-color') as cg.Color,
    number = el.getAttribute('data-nb');
    if (!role || !color || number === '0') return;

    //if the piece we are dragging is different than the currently selected for click-drop, then cancel the click-drop
    //if it is the same, we will not cancel it yet - if this drag event turns out to just be a click - then the cancelling will happen in the click method
    //if it is an actual drag then no point in canelling ???
    if (ctrl.chessground.state.dropmode.piece && ctrl.chessground.state.dropmode.piece.role != role) {
        ctrl.chessground.selectSquare(null);
        cancelDropMode(ctrl.chessground.state);
        el.setAttribute("just-unselected","true");//right after this, the click event might also fire if not an actual drag. use this attr to detect if current piece has just been unselected to do nothing instead of selecting in right back in thus reverting the effect of this if body
        updatePockets(ctrl,ctrl.vpocket0,ctrl.vpocket1);
        //return;
    } 

    e.stopPropagation();
    e.preventDefault();
    dragNewPiece(ctrl.chessground.state, { color, role }, e);
}

export function dropIsValid(dests: cg.Dests, role: cg.Role, key: cg.Key): boolean {
    const drops = dests[role2san(role) + "@"];
    // console.log("drops:", drops)

    if (drops === undefined || drops === null) return false;

    return drops.indexOf(key) !== -1;
}

// TODO: after 1 move made only 1 pocket update needed at once, no need to update both
export function updatePockets(ctrl: RoundController | AnalysisController | EditorController, vpocket0: VNode | HTMLElement, vpocket1: VNode | HTMLElement): void {
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
        ctrl.vpocket0 = patch(vpocket0, pocketView(ctrl, (ctrl.flip) ? ctrl.mycolor : ctrl.oppcolor, "top"));
        ctrl.vpocket1 = patch(vpocket1, pocketView(ctrl, (ctrl.flip) ? ctrl.oppcolor : ctrl.mycolor, "bottom"));
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
