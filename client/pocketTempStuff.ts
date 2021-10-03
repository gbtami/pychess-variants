import * as cg from "chessgroundx/types";
import {DropOrig, lc, letter2role, role2san} from "./chess";
import {Pocket, Pockets, pocketView, refreshPockets} from "./pocket";
import {init} from "snabbdom";
import klass from "snabbdom/modules/class";
import attributes from "snabbdom/modules/attributes";
import properties from "snabbdom/modules/props";
import listeners from "snabbdom/modules/eventlisteners";
import AnalysisController from "./analysisCtrl";
import RoundController from "./roundCtrl";
import predrop from "chessgroundx/predrop";
import {VNode} from "snabbdom/vnode";
import {EditorController} from "./editorCtrl";
import {toVNode} from "snabbdom/tovnode";

const patch = init([klass, attributes, properties, listeners]);

export class PocketStateStuff{

    pockets: Pockets;
    vpocket0: VNode;
    vpocket1: VNode;
    ctrl: AnalysisController | RoundController | EditorController;

    constructor(pocket0: HTMLElement, pocket1: HTMLElement, ctrl: AnalysisController | RoundController | EditorController) {
        this.vpocket0 = toVNode(pocket0);
        this.vpocket1 = toVNode(pocket1);
        this.ctrl = ctrl;
    }

    public updatePockets = (): void => {
        // update pockets from FEN
        if (this.ctrl.hasPockets) {
            const parts = this.ctrl.fullfen.split(" ");
            const fen_placement = parts[0];
            let pockets = "";
            const bracketPos = fen_placement.indexOf("[");
            if (bracketPos !== -1) {
                pockets = fen_placement.slice(bracketPos);
            }

            const c = this.ctrl.mycolor;
            const o = this.ctrl.oppcolor;
            const rc = this.ctrl.variant.pocketRoles(c) ?? [];
            const ro = this.ctrl.variant.pocketRoles(o) ?? [];
            const pc: Pocket = {};
            const po: Pocket = {};
            rc.forEach(r => pc[letter2role(r)] = lc(pockets, r, c==='white'));
            ro.forEach(r => po[letter2role(r)] = lc(pockets, r, o==='white'));
            if (this.ctrl.flip) {
                this.pockets = [pc, po];
            } else {
                this.pockets = [po, pc];
            }
            // console.log(o,c,po,pc);
            refreshPockets(this, this.ctrl);
        }
    }
}

export default class PocketTempStuff {
    ctrl: AnalysisController | RoundController /*| EditorController*/;
    state: PocketStateStuff;

    constructor(ctrl: AnalysisController | RoundController /*| EditorController*/) {
        this.ctrl = ctrl;
        this.state = ctrl.pocketStateStuff;
    }

    public dropIsValid = (role: cg.Role, key: cg.Key): boolean => {
        const drops = this.ctrl.dests[role2san(role) + "@"];

        if (drops === undefined || drops === null) return false;

        return drops.includes(key);
    }

    public handleDrop = (role: cg.Role, dest: cg.Key): void => {
        let position = (this.ctrl.turnColor === this.ctrl.mycolor) ? "bottom" : "top";
        if (this.ctrl.flip) position = (position === "top") ? "bottom" : "top";
        if (position === "top") {
            const pr = this.state.pockets[0][role];
            if (pr !== undefined) this.state.pockets[0][role] = pr - 1;
            this.state.vpocket0 = patch(this.state.vpocket0, pocketView(this.ctrl, this.ctrl.turnColor, "top"));
        } else {
            const pr = this.state.pockets[1][role];
            if (pr !== undefined) this.state.pockets[1][role] = pr - 1;
            this.state.vpocket1 = patch(this.state.vpocket1, pocketView(this.ctrl, this.ctrl.turnColor, "bottom"));
        }
        if (this.ctrl.variant.promotion === 'kyoto') {
            if (!this.ctrl.promotion.start(role, 'a0', dest)) this.ctrl.sendMove(role2san(role) + "@" as DropOrig, dest, '');
        } else {
            this.ctrl.sendMove(role2san(role) + "@" as DropOrig, dest, '')
        }
    }

    public handleCapture = (captured: cg.Piece): void => {

        let role = captured.role
        if (captured.promoted)
            role = (this.ctrl.variant.promotion === 'shogi' || this.ctrl.variant.promotion === 'kyoto') ? captured.role.slice(1) as cg.Role : "p-piece";

        let position = (this.ctrl.turnColor === this.ctrl.mycolor) ? "bottom": "top";
        if (this.ctrl.flip) position = (position === "top") ? "bottom" : "top";
        if (position === "top") {
            const pr = this.state.pockets[0][role];
            if ( pr !== undefined ) this.state.pockets[0][role] = pr + 1;
            this.state.vpocket0 = patch(this.state.vpocket0, pocketView(this.ctrl, this.ctrl.turnColor, "top"));
        } else {
            const pr = this.state.pockets[1][role]
            if ( pr !== undefined ) this.state.pockets[1][role] = pr + 1;
            this.state.vpocket1 = patch(this.state.vpocket1, pocketView(this.ctrl, this.ctrl.turnColor, "bottom"));
        }

    }

    public handleTurnChange = (): void => {

        // TODO: this logic ideally belongs in chessground somehow i feel - but where can i put it on turn change and also it depends now on this.dests
        //       as far as i can tell the analogous logic for setting up move/pre-move destinations is in state.ts->configure->call to setSelected
        if (this.ctrl.mycolor === this.ctrl.turnColor) {
            // when turn gets mine, if a piece is being dragged or is selected, then pre-drop dests should be hidden and replaced by dests
            this.ctrl.chessground.state.predroppable.dropDests=undefined; // always clean up predrop dests when my turn starts

            const pdrole : cg.Role | undefined =
                this.ctrl.chessground.state.dropmode.active ? // TODO: Sometimes dropmode.piece is not cleaned-up so best check if active==true. Maybe clean it in drop.cancelDropMode() together with everything else there?
                this.ctrl.chessground.state.dropmode.piece?.role :
                this.ctrl.chessground.state.draggable.current?.piece.role ?
                this.ctrl.chessground.state.draggable.current?.piece.role :
                undefined;

            if (pdrole) { // is there a pocket piece that is being dragged or is selected for dropping
              const dropDests = new Map([ [pdrole, this.ctrl.dests[role2san(pdrole) + "@"] ] ]);
              this.ctrl.chessground.set({
                dropmode: {
                    dropDests: dropDests
                    }
                }); // if yes - show normal dests on turn start after the pre-drop dests were hidden
            }
        } else {
            if (this.ctrl.chessground.state.draggable.current) {
                // we have just received a message from the server confirming it is not our turn (i.e. we must have just moved a piece)
                // at the same time we are dragging a piece - either we are very fast and managed to grab another piece while
                // waiting for server's message that confirm the move we just made, or the move we just made was a pre-move/pre-drop
                // either way we have to init the predrop destinations so they can be highlighted
                const dropDests = predrop(this.ctrl.chessground.state.pieces, this.ctrl.chessground.state.draggable.current.piece, this.ctrl.chessground.state.geometry, this.ctrl.chessground.state.variant);
                this.ctrl.chessground.set({
                    predroppable: {
                        dropDests: dropDests
                    }
                });
            }
        }

    }

}