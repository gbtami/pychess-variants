import { init } from 'snabbdom';
import klass from 'snabbdom/modules/class';
import attributes from 'snabbdom/modules/attributes';
import properties from 'snabbdom/modules/props';
import listeners from 'snabbdom/modules/eventlisteners';
import style from 'snabbdom/modules/style';

const patch = init([klass, attributes, properties, listeners, style]);

import { h } from 'snabbdom/h';

import { _ } from '../i18n';
import { LobbyController } from '../lobby';
import { VARIANTS } from '../chess';
import { goBackToLayer1, variantBoard } from './layer1';
import { layer3variant } from './layer3';


export function layer2xiangqi (lobbyCtrl: LobbyController, containerId: string): void {
    const variant = VARIANTS['xiangqi'];
    const layer2cont = h('div#layer2xiangqicont.layer-2-container.fairy-grid.two-grid', [
        h('button.layer-2-category generic-variant-info.generic-makruk', [
            h('div.layer-two-category-info', [
                h('h4', 'Xiangqi Variants'),
                variantBoard(variant, variant.startFen),
                h('p.variant-category-description.makruk-desc', _('The ancient game of Chinese Chess and its variants.')),
                h('h5#xiangqil2back', { class: {"icon": true, "icon-reply": true}, on: { click: () => goBackToLayer1(lobbyCtrl, 'layer2xiangqicont') } }, _('Go Back')),
            ]),
        ]),
        h('button.layer-2-category.makrukl2', { on: { click: () => layer3variant('layer2xiangqicont', lobbyCtrl, 'xiangqi', false) } }, [
            h('div.variant-title-l2', [
                h('div.icon', { attrs: { 'data-icon': VARIANTS['xiangqi'].icon(false) } }),
                h('h3', 'Xiangqi'),
            ]),
            h('p.variant-extra-info', _('Chinese Chess, one of the most played games in the world')),
        ]),
        h('button.layer-2-category.chatrang', { on: { click: () => layer3variant('layer2xiangqicont', lobbyCtrl, 'janggi', false) } }, [
            h('div.variant-title-l2', [
                h('div.icon', { attrs: { 'data-icon': VARIANTS['janggi'].icon(false) } }),
                h('h3', 'Janggi'),
            ]),
            h('p.variant-extra-info', _('Korean Chess, based on Xiangqi but much different')),
        ]),
        h('button.layer-2-category.makpong', { on: { click: () => layer3variant('layer2xiangqicont', lobbyCtrl, 'minixiangqi', false) } }, [
            h('div.variant-title-l2', [
                h('div.icon', { attrs: { 'data-icon': VARIANTS['minixiangqi'].icon(false) } }),
                h('h3', 'Minixiangqi'),
            ]),
            h('p.variant-extra-info', _('Compact Xiangqi on a 7x7 board')),
        ]),
        h('button.layer-2-category.sittuyin', { on: { click: () => layer3variant('layer2xiangqicont', lobbyCtrl, 'manchu', false) } }, [
            h('div.variant-title-l2', [
                h('div.icon', { attrs: { 'data-icon': VARIANTS['manchu'].icon(false) } }),
                h('h3', 'Manchu'),
            ]),
            h('p.variant-extra-info', _('Asymmetric variant with one side having a super piece')),
        ]),
    ]);

    const container = document.getElementById(containerId) as HTMLElement;
    if (container) patch(container, layer2cont);
}
