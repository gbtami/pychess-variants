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


export function layer2shogi (lobbyCtrl: LobbyController, containerId: string): void {
    const assetUrl = lobbyCtrl.model['asset-url'];
    const variant = VARIANTS['shogi'];
    const layer2cont = h('div#layer2shogicont.layer-2-container.fairy-grid', [
        h('button.layer-2-category generic-variant-info.generic-fairy', [
            h('div.layer-two-category-info', [
                h('h4', 'Shogi Variants'),
                variantBoard(variant, variant.startFen),
                h('p.variant-category-description.shogi-desc', _('The Japanese version of chess, which involves drops and promotions.')),
                h('h5#shogil2back', { on: { click: () => goBackToLayer1(lobbyCtrl, 'layer2shogicont') } }, _('Go Back')),
            ]),
        ]),
        h('button.layer-2-category.capablanca', { on: { click: () => layer3variant('layer2shogicont', lobbyCtrl, 'shogi', false) } }, [
            h('div.variant-title-l2', [
                h('div.icon-container', [ h('img', { attrs: {  src: assetUrl + "/icons/shogi.svg" } } ) ]),
                h('h3', 'Shogi'),
            ]),
            h('p.variant-extra-info', 'Original Shogi'),
        ]),
        h('button.layer-2-category.schess', { on: { click: () => layer3variant('layer2shogicont', lobbyCtrl, 'minishogi', false) } }, [
            h('div.variant-title-l2', [
                h('div.icon-container', [ h('img', { attrs: {  src: assetUrl + "/icons/minishogi.svg" } } ) ]),
                h('h3', 'Minishogi'),
            ]),
            h('p.variant-extra-info', '5x5 Shogi'),
        ]),
        h('button.layer-2-category.shako', { on: { click: () => layer3variant('layer2shogicont', lobbyCtrl, 'kyotoshogi', false) } }, [
            h('div.variant-title-l2', [
                h('div.icon-container', [ h('img', { attrs: {  src: assetUrl + "/icons/KyotoShogi.svg" } } ) ]),
                h('h3', 'Kyoto Shogi'),
            ]),
            h('p.variant-extra-info', '5x5, pieces flip each turn'),
        ]),
        h('button.layer-2-category.grand', { on: { click: () => layer3variant('layer2shogicont', lobbyCtrl, 'dobutsu', false) } }, [
            h('div.variant-title-l2', [
                h('div.icon-container', [ h('img', { attrs: {  src: assetUrl + "/icons/Dobutsu.svg" } } ) ]),
                h('h3', 'Dobutsu'),
            ]),
            h('p.variant-extra-info', '3x4 game to teach Shogi'),
        ]),
        h('button.layer-2-category.shogun', { on: { click: () => layer3variant('layer2shogicont', lobbyCtrl, 'gorogoro', false) } }, [
            h('div.variant-title-l2', [
                h('div.icon-container', [ h('img', { attrs: {  src: assetUrl + "/icons/Gorogoro.svg" } } ) ]),
                h('h3', 'Gorogoro'),
            ]),
            h('p.variant-extra-info', '5x6 with Generals'),
        ]),
        h('button.layer-2-category.hoppelpoppel', { on: { click: () => layer3variant('layer2shogicont', lobbyCtrl, 'torishogi', false) } }, [
            h('div.variant-title-l2', [
                h('div.icon-container', [ h('img', { attrs: {  src: assetUrl + "/icons/ToriShogi.svg" } } ) ]),
                h('h3', 'Tori Shogi'),
            ]),
            h('p.variant-extra-info', '7x7, Bird Shogi'),
        ]),
    ]);

    const container = document.getElementById(containerId) as HTMLElement;
    if (container) patch(container, layer2cont);
}
