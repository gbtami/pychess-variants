import * as cg from "chessgroundx/types";
import { getPockets, lc, letter2role, role2san} from "./chess";
import {Pocket, Pockets, pocketView, refreshPockets} from "./pocket";
import {init} from "snabbdom";
import klass from "snabbdom/modules/class";
import attributes from "snabbdom/modules/attributes";
import properties from "snabbdom/modules/props";
import listeners from "snabbdom/modules/eventlisteners";
import predrop from "chessgroundx/predrop";
import {VNode} from "snabbdom/vnode";
import {toVNode} from "snabbdom/tovnode";
import {Api} from "chessgroundx/api";
import {opposite} from "chessgroundx/util";

const patch = init([klass, attributes, properties, listeners]);

export class PockStateStuff {

    pockets: Pockets;
    vpocket0: VNode;
    vpocket1: VNode;
    chessground: Api;//AnalysisController | RoundController | EditorController;
    fen: cg.FEN | null;
    pocketRoles: (color: cg.Color) => string[] | undefined;
    mycolor: cg.Color;
    lastMovableDests: {[key: string]: cg.Key[]};

    constructor(pocket0: HTMLElement,
                pocket1: HTMLElement,
                ctrl: Api/*AnalysisController | RoundController | EditorController*/,
                mycolor: cg.Color,
                pocketRoles: (color: cg.Color) => string[] | undefined) {
        this.vpocket0 = toVNode(pocket0);
        this.vpocket1 = toVNode(pocket1);
        this.chessground = ctrl;
        this.fen = null;
        this.pocketRoles = pocketRoles;
        this.mycolor = mycolor;
        //TODO:this.pockets not initialized until first updatePockets is called
    }

    public isFlipped = (): boolean => {
        return this.mycolor !== this.chessground.state.orientation
    }

    //TODO:niki: can we rethink what pockets[] represent and avoid having to swap them like this? maybe represent pockets for given color, not for top/bottom position - not sure though
    public flip = (): void => {
        const tmp_pocket = this.pockets[0];
        this.pockets[0] = this.pockets[1];
        this.pockets[1] = tmp_pocket;

        this.vpocket0 = patch(this.vpocket0, pocketView(this, opposite(this.chessground.state.orientation), "top"));
        this.vpocket1 = patch(this.vpocket1, pocketView(this, this.chessground.state.orientation, "bottom"));
    }

    public updatePocks = (fen: cg.FEN): void => {

        const pocketsChanged = this.fen === null || /*TODO:niki: is this method called for non-pocket variants that would make this check needed? this.ctrl.hasPockets &&*/ (getPockets(this.fen) !== getPockets(fen));
        this.fen = fen;

        // update pockets from FEN
        if (pocketsChanged) {
            const parts = this.fen.split(" ");
            const fen_placement = parts[0];
            let pockets = "";
            const bracketPos = fen_placement.indexOf("[");
            if (bracketPos !== -1) {
                pockets = fen_placement.slice(bracketPos);
            }

            const c = this.mycolor;//this.ctrl.state.orientation;//this.ctrl.mycolor;
            const o = opposite(this.mycolor); //this.mycolor === "white"? "black": "white";//this.ctrl.oppcolor;
            const rc = this.pocketRoles(c) ?? [];
            const ro = this.pocketRoles(o) ?? [];
            const pc: Pocket = {};
            const po: Pocket = {};
            rc.forEach(r => pc[letter2role(r)] = lc(pockets, r, c==='white'));
            ro.forEach(r => po[letter2role(r)] = lc(pockets, r, o==='white'));
            if (this.mycolor !== this.chessground.state.orientation/*this.ctrl.flip*/) {
                this.pockets = [pc, po];
            } else {
                this.pockets = [po, pc];
            }
            // console.log(o,c,po,pc);
            refreshPockets(this);
        }
    }
}


export default class PockTempStuff {
    chessground: Api/*AnalysisController | RoundController*/ /*| EditorController*/;
    state: PockStateStuff;

    constructor(chessground: Api, pocketStateStuff: PockStateStuff/*ctrl: AnalysisController | RoundController*/ /*| EditorController*/) {
        this.chessground = chessground;
        this.state = pocketStateStuff;
    }

    public handleDrop = (role: cg.Role): void => {
        let position = (this.chessground.state.turnColor === this.state.mycolor) ? "bottom" : "top";
        if (this.state.isFlipped()) position = (position === "top") ? "bottom" : "top";
        if (position === "top") {
            const pr = this.state.pockets[0][role];
            if (pr !== undefined) this.state.pockets[0][role] = pr - 1;
            this.state.vpocket0 = patch(this.state.vpocket0, pocketView(this.state, this.chessground.state.turnColor, "top"));
        } else {
            const pr = this.state.pockets[1][role];
            if (pr !== undefined) this.state.pockets[1][role] = pr - 1;
            this.state.vpocket1 = patch(this.state.vpocket1, pocketView(this.state, this.chessground.state.turnColor, "bottom"));
        }
    }

    /**
     * it doesn't just refreshes visual stuff - changes state also
     * */
    public handleCapture = (role: cg.Role): void => {
        let position = (this.chessground.state.turnColor === this.state.mycolor) ? "bottom": "top";
        if (this.state.isFlipped()) position = (position === "top") ? "bottom" : "top";
        if (position === "top") {
            const pr = this.state.pockets[0][role];
            if ( pr !== undefined ) this.state.pockets[0][role] = pr + 1;
            this.state.vpocket0 = patch(this.state.vpocket0, pocketView(this.state, this.chessground.state.turnColor, "top"));
        } else {
            const pr = this.state.pockets[1][role]
            if ( pr !== undefined ) this.state.pockets[1][role] = pr + 1;
            this.state.vpocket1 = patch(this.state.vpocket1, pocketView(this.state, this.chessground.state.turnColor, "bottom"));
        }
    }

    public handleTurnChange = (): void => {

        // TODO: this logic ideally belongs in chessground somehow i feel - but where can i put it on turn change and also it depends now on this.dests
        //       as far as i can tell the analogous logic for setting up move/pre-move destinations is in state.ts->configure->call to setSelected
        if (this.state.mycolor === this.chessground.state.turnColor) {
            // when turn gets mine, if a piece is being dragged or is selected, then pre-drop dests should be hidden and replaced by dests
            this.chessground.state.predroppable.dropDests=undefined; // always clean up predrop dests when my turn starts

            const pdrole : cg.Role | undefined =
                this.chessground.state.dropmode.active ? // TODO: Sometimes dropmode.piece is not cleaned-up so best check if active==true. Maybe clean it in drop.cancelDropMode() together with everything else there?
                this.chessground.state.dropmode.piece?.role :
                this.chessground.state.draggable.current?.piece.role ?
                this.chessground.state.draggable.current?.piece.role :
                undefined;

            if (pdrole && this.chessground.state.movable.dests/*TODO:worth testing how equivallent this is to ctrl.dests and when is it undefined*/) { // is there a pocket piece that is being dragged or is selected for dropping
              const dropDests = new Map([ [pdrole, this.chessground.state.movable.dests[role2san(pdrole) + "@"] ] ]);
              this.chessground.set({
                dropmode: {
                    dropDests: dropDests
                    }
                }); // if yes - show normal dests on turn start after the pre-drop dests were hidden
            }
        } else {
            if (this.chessground.state.draggable.current) {
                // we have just received a message from the server confirming it is not our turn (i.e. we must have just moved a piece)
                // at the same time we are dragging a piece - either we are very fast and managed to grab another piece while
                // waiting for server's message that confirm the move we just made, or the move we just made was a pre-move/pre-drop
                // either way we have to init the predrop destinations so they can be highlighted
                const dropDests = predrop(this.chessground.state.pieces, this.chessground.state.draggable.current.piece, this.chessground.state.geometry, this.chessground.state.variant);
                this.chessground.set({
                    predroppable: {
                        dropDests: dropDests
                    }
                });
            }
        }

    }

}


export function dropIsValid(dests: undefined | {[key: string]: cg.Key[]}/*chessground: Api*/, role: cg.Role, key: cg.Key): boolean{
    //TODO:ideally it should use state.movable.dests, but at the moment not possible, because it is always being reset in board.ts->baseNewPiece (and maybe baseUserMove) when drop finishes, just before this is called
    //     Even more ideally we need some callback where to plug variant specific logic that checks for valid drops, or even directly code that checks for movable.dests in baseNewPiece
    //     plugging variant specifric logic would make sense if we plan to make special logic that is not just checking the movable.dests, but if we commit on only this way of validating drops
    //     then just should go to chessgroundx and not do post-factum validation like we do now in roundCtrl->onUserDrop, where the invalid drop has already been performed, but only then
    //     we check if it is valid and in that else there we reset to current fen effectivelt discarding the successful drop on an invalid square which should not have had happened in the first
    //     place if validation was happening in the right place in chessgroundx->board.ts and not as a even handler.

    /*if (chessground.state.movable.dests === undefined) return false; // TODO:niki:when is movable.dest undefined? That was not possible with ctrl.dests

    const drops = chessground.state.movable.dests[role2san(role) + "@"];
    if (drops === undefined || drops === null) return false;

    return drops.includes(key);*/

    if (dests === undefined) return false;

    const drops = dests[role2san(role) + "@"];
    if (drops === undefined || drops === null) return false;

    return drops.includes(key);
}
