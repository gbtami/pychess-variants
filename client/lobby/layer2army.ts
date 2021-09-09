import { init } from 'snabbdom';
import klass from 'snabbdom/modules/class';
import attributes from 'snabbdom/modules/attributes';
import properties from 'snabbdom/modules/props';
import listeners from 'snabbdom/modules/eventlisteners';
import style from 'snabbdom/modules/style';

const patch = init([klass, attributes, properties, listeners, style]);

import { h } from 'snabbdom/h';

import { _ } from '../i18n';
import { VARIANTS } from '../chess';
import { LobbyController } from '../lobby';
import { goBackToLayer1 } from './layer1';
import { layer3variant } from './layer3';


export function layer2army (lobbyCtrl: LobbyController, containerId: string): void {
    const assetUrl = lobbyCtrl.model['asset-url'];
    const layer2cont = h('div#layer2armycont.layer-2-container.fairy-grid', [
        h('button.layer-2-category generic-variant-info.generic-fairy', [
            h('div.layer-two-category-info', [
                h('h4', _('New Army Variants')),
                h('div.generic-image-container.fourarmykings', [ h('img', { attrs: { src: assetUrl + "/images/4ArmyKings.svg" } }) ]),
                h('p.variant-category-description', _('These variants have new armies with completely new pieces! Most of these variants pit these armies against the standard Chess army.')),
                h('h5#armyl2back', { class: {"icon": true, "icon-reply": true}, on: { click: () => goBackToLayer1(lobbyCtrl, 'layer2armycont') } }, _('Go Back')),
            ]),
        ]),
        h('button.layer-2-category.capablanca', { on: { click: () => layer3variant('layer2armycont', lobbyCtrl, 'orda', false) } }, [
            h('div.variant-title-l2', [
                h('div.icon', { attrs: { 'data-icon': VARIANTS['orda'].icon(false) } }),
                h('h3', 'Orda'),
            ]),
            h('p.variant-extra-info', _('Horde: Horse-based army')),
        ]),
        h('button.layer-2-category.schess', { on: { click: () => layer3variant('layer2armycont', lobbyCtrl, 'empire', false) } }, [
            h('div.variant-title-l2', [
                h('div.icon', { attrs: { 'data-icon': VARIANTS['empire'].icon(false) } }),
                h('h3', 'Empire'),
            ]),
            h('p.variant-extra-info', _('Empire: Queen-based army')),
        ]),
        h('button.layer-2-category.shako', { on: { click: () => layer3variant('layer2armycont', lobbyCtrl, 'ordamirror', false) } }, [
            h('div.variant-title-l2', [
                h('div.icon', { attrs: { 'data-icon': VARIANTS['ordamirror'].icon(false) } }),
                h('h3', 'Orda Mirror'),
            ]),
            h('p.variant-extra-info', _('Horde vs Horde')),
        ]),
        h('button.layer-2-category.grand', { on: { click: () => layer3variant('layer2armycont', lobbyCtrl, 'shinobi', false) } }, [
            h('div.variant-title-l2', [
                h('div.icon', { attrs: { 'data-icon': VARIANTS['shinobi'].icon(false) } }),
                h('h3', 'Shinobi'),
            ]),
            h('p.variant-extra-info', _('Clan: Drop-based army')),
        ]),
        h('button.layer-2-category.shogun', { on: { click: () => layer3variant('layer2armycont', lobbyCtrl, 'synochess', false) } }, [
            h('div.variant-title-l2', [
                h('div.icon', { attrs: { 'data-icon': VARIANTS['synochess'].icon(false) } }),
                h('h3', 'Synochess'),
            ]),
            h('p.variant-extra-info', _('Dynasty: Xiangqi-based army')),
        ]),
    ]);

    const container = document.getElementById(containerId) as HTMLElement;
    if (container) patch(container, layer2cont);
}
