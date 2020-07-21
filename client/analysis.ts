import { h } from "snabbdom";
import { VNode } from 'snabbdom/vnode';

import { _ } from './i18n';
import AnalysisController from './analysisCtrl';
import { VARIANTS } from './chess';
import { timeago, renderTimeago } from './datetime';
import { renderRdiff, result } from './profile';

function runGround(vnode: VNode, model) {
    const el = vnode.elm as HTMLElement;
    const ctrl = new AnalysisController(el, model);
    const cg = ctrl.chessground;
    window['cg'] = cg;
}

export function analysisView(model): VNode[] {
    console.log("analysisView model=", model);
    const variant = VARIANTS[model.variant];
    const chess960 = model.chess960 === 'True';
    const dataIcon = variant.icon(chess960);
    const fc = variant.firstColor;
    const sc = variant.secondColor;

    renderTimeago();

    return [h('aside.sidebar-first', [
        h('div.game-info', [
            h('div.info0.icon', { attrs: { "data-icon": dataIcon } }, [
                h('div.info2', [
                    h('div.tc', [
                        model["base"] + "+" + (model["byo"] > 1 ? model["byo"] + "x" : "") + model["inc"] + (model["byo"] > 0 ? "(b)" : "") + " • " + ((model["rated"] === 'True') ? _("Rated") : _("Casual")) + " • ",
                        h('a.user-link', {
                            attrs: {
                                target: '_blank',
                                href: '/variant/' + model["variant"] + (chess960 ? '960': ''),
                            }
                        },
                            variant.displayName(chess960),
                        ),
                    ]),
                    Number(model["status"]) >= 0 ? h('info-date', { attrs: { timestamp: model["date"]} }, timeago(model["date"])) : _("Playing right now"),
                ]),
            ]),
            h('div.player-data', [
                h('i-side.icon', {
                    class: {
                        "icon-white": fc === "White",
                        "icon-black": fc === "Black",
                        "icon-red":   fc === "Red",
                        "icon-blue":  fc === "Blue",
                        "icon-gold":  fc === "Gold",
                    }
                }),
                h('player', playerInfo(model.wplayer, model.wtitle, model.level, model.wrating, model.wrdiff)),
            ]),
            h('div.player-data', [
                h('i-side.icon', {
                    class: {
                        "icon-white": sc === "White",
                        "icon-black": sc === "Black",
                        "icon-red":   sc === "Red",
                        "icon-blue":  sc === "Blue",
                        "icon-gold":  sc === "Gold",
                    }
                }),
                h('player', playerInfo(model.bplayer, model.btitle, model.level, model.brating, model.brdiff)),
            ]),
        ]),
        h('div.roundchat#roundchat'),
    ]),
        h('div.analysis', [
            h('selection#board2png.' + variant.board + '.' + variant.piece, [
                h('div.cg-wrap.' + variant.cg, { hook: { insert: (vnode) => runGround(vnode, model) } }),
            ]),
            h('div#gauge', [
                h('div.black',     { props: { style: "height: 50%;" } }),
                h('div.tick',      { props: { style: "height: 12.5%;" } }),
                h('div.tick',      { props: { style: "height: 25%;" } }),
                h('div.tick',      { props: { style: "height: 37.5%;" } }),
                h('div.tick.zero', { props: { style: "height: 50%;" } }),
                h('div.tick',      { props: { style: "height: 62.5%;" } }),
                h('div.tick',      { props: { style: "height: 75%;" } }),
                h('div.tick',      { props: { style: "height: 87.5%;" } }),
            ]),
        ]),
        h('aside.sidebar-second.analysis', [
            h('div#pocket-wrapper0', [
                h('div.' + variant.piece + '.' + model["variant"], [
                    h('div.cg-wrap.pocket', [
                        h('div#pocket0'),
                    ]),
                ]),
            ]),
            h('div.round-data', [
                h('div#pv'),
                h('div#movelist-block', [
                    h('div#movelist'),
                ]),
                h('div#result', result(model.variant, model.status, model.result)),
                h('div#misc-info', [
                    h('div#misc-infow'),
                    h('div#misc-info-center'),
                    h('div#misc-infob'),
                ]),
                h('div#move-controls'),
            ]),
            h('div#pocket-wrapper1', [
                h('div.' + variant.piece + '.' + model["variant"], [
                    h('div.cg-wrap.pocket', [
                        h('div#pocket1'),
                    ]),
                ]),
            ]),
        ]),
        h('under-left#spectators'),
        h('under-board', [
            h('div#pgn', [
                h('div#ctable-container'),
                h('div.chart-container', [
                    h('div#chart'),
                    h('div#loader-wrapper', [h('div#loader')])
                ]),
                h('div#fen'),
                h('div#copyfen'),
                h('div#pgntext'),
            ])
        ])
    ];
}

function playerInfo(username: string, title: string, level: number, rating: number, rdiff: number | null) {
    return h('a.user-link', { attrs: { href: '/@/' + username } }, [
        h('player-title', " " + title + " "),
        username + ((title === "BOT" && level >= 0) ? _(' level ') + level: "") + " (" + rating + ") ",
        rdiff === null ? h('rdiff') : renderRdiff(rdiff),
    ]);
}
