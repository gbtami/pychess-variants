import { Chessground as ChessgroundOriginal } from 'chessgroundx';
import { Api /*as ApiOriginal*/} from 'chessgroundx/api';
import {Config as ConfigOriginal} from "chessgroundx/config";
import * as cg from "chessgroundx/types";
import PockTempStuff, {PockStateStuff} from "./pockTempStuff";
import {pockets2str, refreshPockets} from "./pocket";

// import PockTempStuff, {PockStateStuff} from "./pockTempStuff";

// export interface Api extends ApiOriginal{
//
// }

export interface Config extends ConfigOriginal {
    pocketRoles: (color: cg.Color) => string[] | undefined;
    mycolor: cg.Color;//TODO:niki:not sure if really needed - see chessground.state.movable.color
}

function hackCGMethods(chessground: Api, pockStateStuff: PockStateStuff, pockTempStuff: PockTempStuff) {
        //
        const getFenOriginal = chessground.getFen;
        chessground.getFen = (): cg.FEN => {
            console.log("overridden getfen");
            const fen = getFenOriginal();
            const result = fen + (this.pockStateStuff ? pockets2str(pockStateStuff) : "");
            return result;
        }

        //
        const setOriginal = chessground.set;
        chessground.set = (config: Config): void => {
            console.log("overridden set");
            const fullfen = config.fen;
            if (fullfen) {
                pockTempStuff.handleTurnChange();//only when fullfen is set - otherwise recursion, because inside this handle there are other calls to cg.set(config) about drop and predrop dests. todo:this is definitely temp solution
                //this is full fen - lets split it here for old chessground
                const parts = fullfen.split(" ");
                config.fen= parts[0];
            }
            if (config.movable?.dests){
                pockStateStuff.lastMovableDests = config.movable.dests;
            }
            hackEventHandlers(config, chessground, pockTempStuff);
            setOriginal(config);
            if (fullfen) {
                pockStateStuff.updatePocks(fullfen);
                pockTempStuff.handleTurnChange();//todo:niki:not sure if right place
            }
        }

        //
        const toggleOrientationOriginal = chessground.toggleOrientation;
        chessground.toggleOrientation=(): void => {
            toggleOrientationOriginal();
            pockStateStuff.flip();
        }

}

function hackEventHandlers(config: Config, chessground: Api, pockTempStuff: PockTempStuff){
        //
        if (config.movable?.events?.afterNewPiece){
            const movableEventsAfterNewPieceOriginal = config.movable?.events?.afterNewPiece;
            const movableEventsAfterNewPieceNew = (role: cg.Role, dest: cg.Key, metadata: cg.MoveMetadata) : void => {
                console.log(chessground.state.turnColor);
                // if (dropIsValid(this.chessground, role, dest)) {
                    pockTempStuff.handleDrop(role);//todo:niki:this is supposed to decrese count in pocket for given role. from code below follows, there is a case where we can cancel the drop, with that promotion stuff for kyoto. if i understand correctly then somewhere the count decrese should be reverted - where?
                // }
                movableEventsAfterNewPieceOriginal(role, dest, metadata);
            }
            config.movable.events.afterNewPiece = movableEventsAfterNewPieceNew;
            console.log('hacked it1', config.movable.events.afterNewPiece);
        } else {
            console.log('errr1. this is temporary anyway');
        }

        //
        if(config.movable?.events?.after) {
            const movableEventsAfterOriginal = config.movable?.events?.after;
            const movableEventsAfterNew = (orig: cg.Key, dest: cg.Key, metadata: cg.MoveMetadata): void => {
                if (movableEventsAfterOriginal) movableEventsAfterOriginal(orig, dest, metadata);

                // increase pocket count
                if (/*todo:niki: this.variant.drop &&*/ metadata.captured) {
                    let role = metadata.captured.role
                    // if (metadata.captured.promoted)//TODO:niki:variant-specific logic - need to find a way to plug such logic from outside CG, once rest of the code goes there. See also similar in pocket.ts->unpromotedRole
                    //     role = (this.variant.promotion === 'shogi' || this.variant.promotion === 'kyoto') ? metadata.captured.role.slice(1) as cg.Role : "p-piece";

                    pockTempStuff.handleCapture(role);
                }
            }
            config.movable.events.after = movableEventsAfterNew;
            console.log('hacked it2', config.movable?.events?.after);
       } else {
            console.log('errr2. this is temporary anyway');
       }

}

export function Chessground(element: HTMLElement, pocket0?: HTMLElement, pocket1?: HTMLElement, config?: Config): Api {
    // config?.dropmode?.events?.cancel =
    let result: Api = ChessgroundOriginal(element, config);

    if (pocket0 && pocket1 && config) {
        const pockStateStuff = new PockStateStuff(pocket0, pocket1, result, config.mycolor, config.pocketRoles);
        const pockTempStuff = new PockTempStuff(result, pockStateStuff);

        result.set( {dropmode:{events:{cancel:()=>{refreshPockets(pockStateStuff)}}}});//there really isn't at the moment any code that sets other event handler here, because the whole event was created just for this really and should eventually be most probably removed once this logic is moved to chessground. that is why i don't try to combine with potentially existing handler, but just set it regardless ignoring potentially existing values to this property
        hackCGMethods(result, pockStateStuff, pockTempStuff);


        if (config?.fen) pockStateStuff.updatePocks(config.fen); //TODO:niki:default chessground fen currently doesn't have pockets, but also is it really a real usecase to call this without config?

    }
    return result;
}