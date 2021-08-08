import { h } from "snabbdom";
import { VNode } from 'snabbdom/vnode';

import { _ } from './i18n';
import AnalysisController from './analysisCtrl';
import { selectVariant, VARIANTS } from './chess';
import { timeago, renderTimeago } from './datetime';
import { aiLevel, gameType, renderRdiff } from './profile';
import { timeControlStr } from './view'

declare global {
    interface Window {
        onFSFline: (string) => void;
        fsf;
    }
}

function runGround(vnode: VNode, model) {
    const el = vnode.elm as HTMLElement;
    const ctrl = new AnalysisController(el, model);
    window['onFSFline'] = ctrl.onFSFline;
}

function leftSide(model) {
    const variant = VARIANTS[model.variant];
    const chess960 = model.chess960 === 'True';
    const dataIcon = variant.icon(chess960);
    const fc = variant.firstColor;
    const sc = variant.secondColor;

    if (model["gameId"] !== "") {
        const tc = (model["base"] == "0" && model["inc"] == "0") ? "" : timeControlStr(model["base"], model["inc"], model["byo"]) + " • ";
        return [
        h('div.game-info', [
            h('div.info0.icon', { attrs: { "data-icon": dataIcon } }, [
                h('div.info2', [
                    h('div.tc', [
                        tc + gameType(model["rated"]) + " • ",
                        h('a.user-link', {
                            attrs: {
                                target: '_blank',
                                href: '/variants/' + model["variant"] + (chess960 ? '960': ''),
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
                        "icon-pink":  fc === "Pink",
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
                        "icon-pink":  sc === "Pink",
                    }
                }),
                h('player', playerInfo(model.bplayer, model.btitle, model.level, model.brating, model.brdiff)),
            ]),
        ]),
        h('div#roundchat'),
        ];

    } else {

        const setVariant = (isInput) => {
            let e;
            e = document.getElementById('variant') as HTMLSelectElement;
            const variant = e.options[e.selectedIndex].value;
            if (isInput) window.location.assign('/analysis/' + variant);
        }

        const vVariant = model.variant || "chess";

        return h('div.container', [
            h('div', [
                h('label', { attrs: { for: "variant" } }, _("Variant")),
                selectVariant("variant", vVariant, () => setVariant(true), () => setVariant(false)),
            ]),
        ]);
    }
}

export function embedView(model): VNode[] {
    const variant = VARIANTS[model.variant];
    const chess960 = model.chess960 === 'True';

    return [
        h('div.embed-app', [
            h('selection#mainboard.' + variant.board + '.' + variant.piece, [
                h('div.cg-wrap.' + variant.cg, { hook: { insert: (vnode) => runGround(vnode, model) } }),
            ]),

            h('div.pocket-top', [
                h('div.' + variant.piece + '.' + model["variant"], [
                    h('div.cg-wrap.pocket', [
                        h('div#pocket0'),
                    ]),
                ]),
            ]),

            h('div.analysis-tools', [
                h('div.movelist-block', [
                    h('div#movelist'),
                ]),
                h('div#misc-info', [
                    h('div#misc-infow'),
                    h('div#misc-info-center'),
                    h('div#misc-infob'),
                ]),
            ]),

            h('div#move-controls'),

            h('div.pocket-bot', [
                h('div.' + variant.piece + '.' + model["variant"], [
                    h('div.cg-wrap.pocket', [
                        h('div#pocket1'),
                    ]),
                ]),
            ]),
        ]),
        h('div.footer', [
            h('a.gamelink', { attrs: { rel: "noopener", target: "_blank", href: '/' + model["gameId"] } },
                [variant.displayName(chess960), '•', model.wtitle, model.wplayer, 'vs', model.btitle, model.bplayer].join(' ')
            ),
        ]),
    ];
}

export function analysisView(model): VNode[] {
    const variant = VARIANTS[model.variant];

    renderTimeago();

    return [
        h('div.analysis-app', [
            h('aside.sidebar-first', leftSide(model)),
            h('selection#mainboard.' + variant.board + '.' + variant.piece, [
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

            h('div.pocket-top', [
                h('div.' + variant.piece + '.' + model["variant"], [
                    h('div.cg-wrap.pocket', [
                        h('div#pocket0'),
                    ]),
                ]),
            ]),
            h('div.analysis-tools', [
                h('div#ceval', [
                    h('div.engine', [
                        h('score#score', ''),
                        h('div.info', ['Fairy-Stockfish 11+', h('br'), h('info#info', _('in local browser'))]),
                        h('label.switch', [
                            h('input#input', {
                                props: {
                                    name: "engine",
                                    type: "checkbox",
                                },
                            }),
                            h('span#slider.sw-slider'),
                        ]),
                    ]),
                ]),
                h('div#pv'),
                h('div.movelist-block', [
                    h('div#movelist'),
                ]),
                h('div#vari'),
                h('div#misc-info', [
                    h('div#misc-infow'),
                    h('div#misc-info-center'),
                    h('div#misc-infob'),
                ]),
            ]),
            h('div#move-controls'),

            h('div.pocket-bot', [
                h('div.' + variant.piece + '.' + model["variant"], [
                    h('div.cg-wrap.pocket', [
                        h('div#pocket1'),
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
                    h('div#fentext', [
                        h('strong', 'FEN'),
                        h('input#fullfen', {attrs: {readonly: true, spellcheck: false}})
                    ]),
                    h('div#copyfen'),
                    h('div', [h('textarea#pgntext')]),
                ]),
            ]),
        ]),
    ];
}

function playerInfo(username: string, title: string, level: number, rating: number, rdiff: number | null) {
    return h('a.user-link', { attrs: { href: '/@/' + username } }, [
        h('player-title', " " + title + " "),
        username + aiLevel(title, level) + (title !== 'BOT' ? (" (" + rating + ") ") : ''),
        rdiff === null ? h('rdiff') : renderRdiff(rdiff),
    ]);
}
