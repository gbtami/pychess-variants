import { h } from "snabbdom";
import { VNode } from 'snabbdom/vnode';

import { _ } from './i18n';
import AnalysisController from './analysisCtrl';
import { VARIANTS, variantIcon, variantName, variantTooltip } from './chess';
import { timeago, renderTimeago } from './clock';
import { renderRdiff, result } from './profile';


function runGround(vnode: VNode, model) {
    const el = vnode.elm as HTMLElement;
    const ctrl = new AnalysisController(el, model);
    const cg = ctrl.chessground;
    window['cg'] = cg;
}

export function analysisView(model): VNode[] {
    console.log("analysisView model=", model);
    const dataIcon = variantIcon(model["variant"], model["chess960"]);
    renderTimeago();
    const darkMode = parseInt(getComputedStyle(document.body).getPropertyValue('--dark-mode')) === 1;
    const shogi =  model["variant"].endsWith('shogi');
    const janggi = model["variant"] === 'janggi';
    const redfirst = model["variant"].endsWith('xiangqi') || model["variant"] === 'sittuyin';
    const orda = model["variant"] === 'orda';
    return [h('aside.sidebar-first', [
                h('div.game-info', [
                    h('div.info0', {attrs: {"data-icon": dataIcon}, class: {"icon": true}}, [
                        h('div.info2', [
                            h('div.tc', [
                                model["base"] + "+" + (model["byo"] > 1 ? model["byo"] + "x" : "") + model["inc"] + (model["byo"] > 0 ? "(b)" : "") + " • " + ((model["rated"] === 'True') ? _("Rated") : _("Casual")) + " • ",
                                h('a.user-link', {attrs: {
                                    target: '_blank',
                                    href: '/variant/' + model["variant"] + ((model["chess960"]==='True') ? '960': ''),
                                    title: variantTooltip(model["variant"])
                                    }}, variantName(model["variant"], model["chess960"]) ),
                            ]),
                            Number(model["status"]) >= 0 ? h('info-date', {attrs: {timestamp: model["date"]}}, timeago(model["date"])) : _("Playing right now"),
                        ]),
                    ]),
                    h('div.player-data', [
                        h('i-side', {class: {
                            "icon": true,
                            "icon-red": redfirst,
                            "icon-blue": janggi,
                            "icon-white": (shogi) ? darkMode : !darkMode,
                            "icon-black": (shogi) ? !darkMode : darkMode
                        }}),
                        h('player', [
                            h('a.user-link', {attrs: {href: '/@/' + model.wplayer}}, [
                                h('player-title', " " + model.wtitle + " "),
                                model.wplayer + ((model.wtitle === "BOT" && model.level >= 0) ? _(' level ') + model.level: '') + " (" + model.wrating + ") ",
                                renderRdiff(model.wrdiff),
                            ]),
                        ]),
                    ]),
                    h('div.player-data', [
                        h('i-side', {class: {
                            "icon": true,
                            "icon-red": janggi,
                            "icon-gold": orda,
                            "icon-black": (shogi) ? darkMode : !darkMode,
                            "icon-white": (shogi) ? !darkMode : darkMode
                        }}),
                        h('player', [
                            h('a.user-link', {attrs: {href: '/@/' + model.bplayer}}, [
                                h('player-title', " " + model.btitle + " "),
                                model.bplayer + ((model.btitle === "BOT" && model.level >= 0) ? _(' level ') + model.level: '') + " (" + model.brating + ") ",
                                renderRdiff(model["brdiff"]),
                            ]),
                        ]),
                    ]),
                ]),
                h('div.roundchat#roundchat'),
            ]),
            h('main.analysis', [
                h('selection#board2png.' + model["variant"] + '-board.' + VARIANTS[model["variant"]].pieces, [
                    h('div.cg-wrap.' + VARIANTS[model["variant"]].cg,
                        { hook: { insert: (vnode) => runGround(vnode, model)},
                    }),
                ]),
                h('div', {attrs: {id: "gauge"}}, [
                    h('div.black', {props: {style: "height: 50%;"}}),
                    h('div.tick', {props: {style: "height: 12.5%;"}}),
                    h('div.tick', {props: {style: "height: 25%;"}}),
                    h('div.tick', {props: {style: "height: 37.5%;"}}),
                    h('div.tick zero', {props: {style: "height: 50%;"}}),
                    h('div.tick', {props: {style: "height: 62.5%;"}}),
                    h('div.tick', {props: {style: "height: 75%;"}}),
                    h('div.tick', {props: {style: "height: 87.5%;"}}),
                ]),
            ]),
            h('aside.sidebar-second', [
                h('div#pocket-wrapper0', [
                    h('div.' + VARIANTS[model["variant"]].pieces + '.' + model["variant"], [
                        h('div.cg-wrap.pocket', [
                            h('div#pocket0'),
                        ]),
                    ]),
                ]),
                h('div.round-data', [
                    h('div#board-settings'),
                    h('div#pv'),
                    h('div#movelist-block', [
                        h('div#movelist'),
                    ]),
                    h('div#result', result(model.variant, model.status, model.result)),
                    h('div#counting', [
                        h('div#count-white'),
                        h('div#count-black'),
                    ]),
                    h('div#janggi-points', [
                        h('div#janggi-point-cho'),
                        h('div#janggi-point-dash'),
                        h('div#janggi-point-han'),
                    ]),
                    h('div#move-controls'),
                ]),
                h('div#pocket-wrapper1', [
                    h('div.' + VARIANTS[model["variant"]].pieces + '.' + model["variant"], [
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
