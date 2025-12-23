import { h } from 'snabbdom';

import { _ } from '../i18n';
import { VARIANTS } from '../variants';
import { patch } from '../document';
import { LobbyController } from '../lobby';
import { goBackToLayer1, variantBoard } from './util';
import { layer3variant } from './layer3';

export function layer2other(lobbyCtrl: LobbyController, containerId: string, showBack: boolean = true): void {
    const ataxx = VARIANTS['ataxx'];
    const borderlands = VARIANTS['borderlands'];

    const infoItems = [
        h('h4', _('Other Variants')),
        variantBoard(ataxx, ataxx.startFen),
        h('p.variant-category-description', _('Variants that do not fit into other groups.')),
    ];

    if (showBack) {
        infoItems.push(
            h('h5#otherl2back', { class: { "icon": true, "icon-reply": true }, on: { click: () => goBackToLayer1(lobbyCtrl, 'layer2othercont') } }, _('Go Back')),
        );
    }

    const layer2cont = h('div#layer2othercont.layer-2-container.fairy-grid', [
        h('button.layer-2-category generic-variant-info.generic-fairy', [
            h('div.layer-two-category-info', infoItems),
        ]),
        h('div.button-grid', [
            h('button.layer-2-category', { on: { click: () => layer3variant('layer2othercont', lobbyCtrl, 'ataxx') } }, [
                h('div.variant-title-l2', [
                    h('div.icon', { attrs: { 'data-icon': ataxx.icon() } }),
                    h('h3', ataxx.displayName()),
                ]),
            ]),
            h('button.layer-2-category', { on: { click: () => layer3variant('layer2othercont', lobbyCtrl, 'borderlands') } }, [
                h('div.variant-title-l2', [
                    h('div.icon', { attrs: { 'data-icon': borderlands.icon() } }),
                    h('h3', borderlands.displayName()),
                ]),
            ]),
        ]),
    ]);

    const container = document.getElementById(containerId) as HTMLElement;
    if (container) patch(container, layer2cont);
}
