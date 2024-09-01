import { h } from 'snabbdom';

import { _ } from '../i18n';
import { LobbyController } from '../lobby';
import { patch } from '../document';
import { VARIANTS } from '../variants';
import { goBackToLayer1, variantBoard } from './util';
import { layer3variant } from './layer3';


export function layer2xiangqi (lobbyCtrl: LobbyController, containerId: string): void {
    const variant = VARIANTS['xiangqi'];
    const layer2cont = h('div#layer2xiangqicont.layer-2-container.fairy-grid', [
        h('button.layer-2-category generic-variant-info.generic-fairy', [
            h('div.layer-two-category-info', [
                h('h4', _('Xiangqi Variants')),
                variantBoard(variant, variant.startFen),
                h('p.variant-category-description.makruk-desc', _('The ancient game of Chinese Chess and its variants.')),
                h('h5#xiangqil2back', { class: {"icon": true, "icon-reply": true}, on: { click: () => goBackToLayer1(lobbyCtrl, 'layer2xiangqicont') } }, _('Go Back')),
            ]),
        ]),
        h('div.button-grid', [
            h('button.layer-2-category', { on: { click: () => layer3variant('layer2xiangqicont', lobbyCtrl, 'xiangqi') } }, [
                h('div.variant-title-l2', [
                    h('div.icon', { attrs: { 'data-icon': VARIANTS['xiangqi'].icon(false) } }),
                    h('h3', VARIANTS['xiangqi'].displayName()),
                ]),
                h('p.variant-extra-info', _('Chinese Chess, one of the most played games in the world')),
            ]),
            h('button.layer-2-category', { on: { click: () => layer3variant('layer2xiangqicont', lobbyCtrl, 'janggi') } }, [
                h('div.variant-title-l2', [
                    h('div.icon', { attrs: { 'data-icon': VARIANTS['janggi'].icon(false) } }),
                    h('h3', VARIANTS['janggi'].displayName()),
                ]),
                h('p.variant-extra-info', _('Korean Chess, based on Xiangqi but very different')),
            ]),
            h('button.layer-2-category', { on: { click: () => layer3variant('layer2xiangqicont', lobbyCtrl, 'minixiangqi') } }, [
                h('div.variant-title-l2', [
                    h('div.icon', { attrs: { 'data-icon': VARIANTS['minixiangqi'].icon(false) } }),
                    h('h3', VARIANTS['minixiangqi'].displayName()),
                ]),
                h('p.variant-extra-info', _('Compact Xiangqi on a 7x7 board')),
            ]),
            h('button.layer-2-category', { on: { click: () => layer3variant('layer2xiangqicont', lobbyCtrl, 'manchu') } }, [
                h('div.variant-title-l2', [
                    h('div.icon', { attrs: { 'data-icon': VARIANTS['manchu'].icon(false) } }),
                    h('h3', VARIANTS['manchu'].displayName()),
                ]),
                h('p.variant-extra-info', _('Asymmetric variant with one side having a super piece')),
            ]),
        ]),
    ]);

    const container = document.getElementById(containerId) as HTMLElement;
    if (container) patch(container, layer2cont);
}
