import { h, VNode } from 'snabbdom';

import { Chessground } from 'chessgroundx';
import * as cg from "chessgroundx/types";

import { _, ngettext, pgettext, languageSettings } from './i18n';
import { VARIANTS } from './variants';
import { patch } from './document';
import { renderTimeago } from './datetime';
import { boardSettings } from './boardSettings';
import { PyChessModel } from "./types";

interface Puzzle {
    _id: string; // mongodb document id
    variant: string;
    fen: string;
    win: boolean;
    date: string;
}

interface Player {
    e: string;
    d: number;
}

function renderPuzzles(model: PyChessModel, puzzles: Puzzle[]) {
    console.log(puzzles);
    const rows = puzzles.map(puzzle => {
        const variant = VARIANTS[puzzle.variant];
        const chess960 = false;

        return h('tr', [h('a', { attrs: { href : '/' + puzzle["_id"] } }, [
            h('td.board', { class: { "with-pockets": !!variant.pocket } }, [
                h(`selection.${variant.boardFamily}.${variant.pieceFamily}`, [
                    h(`div.cg-wrap.${variant.board.cg}.mini`, {
                        hook: {
                            insert: vnode => Chessground(vnode.elm as HTMLElement, {
                                coordinates: false,
                                viewOnly: true,
                                fen: puzzle["fen"],
                                dimensions: variant.board.dimensions,
                                pocketRoles: variant.pocket?.roles,
                            })
                        }
                    }),
                ]),
            ]),
            h('td.puzzles-info', [
                h('div.info0.puzzles.icon', { attrs: { "data-icon": variant.icon(chess960) } }),
            ])
        ])
    ])
    });
    return [h('tbody', rows)];
}

function loadPuzzles(model: PyChessModel, page: number) {
    const lang = languageSettings.value;

    const xmlhttp = new XMLHttpRequest();
    let url = "/api/" + model["profileid"]
    url = `${url}/puzzle?l=${lang}&p=`;

    xmlhttp.onreadystatechange = function() {
        if (this.readyState === 4 && this.status === 200) {
            const response = JSON.parse(this.responseText);

            // If empty JSON, exit the function
            if (!response.length) {
                return;
            }
            const oldVNode = document.getElementById('puzzles');
            if (oldVNode instanceof Element)
                patch(oldVNode, h('table#puzzles', renderPuzzles(model, response)));
            renderTimeago();
        }
    };
    xmlhttp.open("GET", `${url}${page}`, true);
    xmlhttp.send();
}

function observeSentinel(vnode: VNode, model: PyChessModel) {
    const sentinel = vnode.elm as HTMLElement;
    let page = 0;
    const options = {root: null, rootMargin: '44px', threshold: 1.0};

    const intersectionObserver = new IntersectionObserver(entries => {
        if (entries.some(entry => entry.intersectionRatio > 0)) {
            loadPuzzles(model, page);
            page += 1;
        }
    }, options);

    intersectionObserver.observe(sentinel);
}

export function puzzleProfileView(model: PyChessModel) {
    boardSettings.assetURL = model.assetURL;
    boardSettings.updateBoardAndPieceStyles();

    return [
        h('table#puzzles'),
        h('div#sentinel', { hook: { insert: (vnode) => observeSentinel(vnode, model) } }),
    ];
}
