import { h, VNode } from "snabbdom";
import { VARIANTS } from "@/variants";
import { Chessground } from "chessgroundx";
import { uci2LastMove } from "@/chess";
import { Game } from "@/profile";
import * as cg from "chessgroundx/types";

export function renderGameBoardsBug(game: Game, username: string): VNode[] {
    const variant = VARIANTS[game.v];
    const [fenA, fenB] = game["f"].split(" | ");
    const orientation = determineOrientation(game, username);
    return [
    h(`selection.${variant.boardFamily}.${variant.pieceFamily}`, { style:{"padding-right":"10px"} },
        h(`div.cg-wrap.${variant.board.cg}.mini`, {
        hook: {
            insert: vnode => Chessground(vnode.elm as HTMLElement, {
                coordinates: false,
                viewOnly: true,
                fen: fenA,
                lastMove: uci2LastMove(game.lm),
                dimensions: variant.board.dimensions,
                pocketRoles: variant.pocket?.roles,
                orientation: orientation[0],
            })
        }
    })),
    h(`selection.${variant.boardFamily}.${variant.pieceFamily}`,
        h(`div.cg-wrap.${variant.board.cg}.mini`, {
        hook: {
            insert: vnode => Chessground(vnode.elm as HTMLElement, {
                coordinates: false,
                viewOnly: true,
                fen: fenB,
                lastMove: uci2LastMove(game.lmB),
                dimensions: variant.board.dimensions,
                pocketRoles: variant.pocket?.roles,
                orientation: orientation[1],
            })
        }
    }))];
}

export function renderBugTeamInfo(game: Game, team: number) {
    const [player1, player2] = team === 0? [game["us"][0],game["us"][3]]: [game["us"][2],game["us"][1]];
    const [title1, title2] = team === 0? [game["wt"], game["btB"]]: [game["wtB"], game["bt"]];
    return [ h('a.user-link', { attrs: { href: '/@/' + player1 } }, [
                h('player-title', " " + title1 + " "),
                player1 /*+ aiLevel(game["wt"], game['x'])*/,
            ]),
            h("div", "+"),
            h('a.user-link', { attrs: { href: '/@/' + player2 } }, [
                h('player-title', " " + title2 + " "),
                player2 /*+ aiLevel(game["wt"], game['x'])*/,
            ])
            /*h('br'),
            (game["wb"] === true) ? h('icon.icon-berserk') : '',
            (game["p0"] === undefined) ? "": game["p0"]["e"] + " ",
            (game["p0"] === undefined) ? "": renderRdiff(game["p0"]["d"]), */
    ];
}

function determineOrientation(game: Game, username: string): [cg.Color, cg.Color] {
    if (game["us"][0] === username || game["us"][3] === username) {
        return ["white", "black"];
    } else {
        return ["black", "white"];
    }
}
