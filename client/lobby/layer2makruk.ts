import { h } from 'snabbdom';

import { _ } from '../i18n';
import { LobbyController } from '../lobby';
import { patch } from '../document';
import { VARIANTS } from '../chess';
import { goBackToLayer1, variantBoard } from './layer1';
import { layer3variant } from './layer3';


export function layer2makruk (lobbyCtrl: LobbyController, containerId: string): void {
    const variant = VARIANTS['makruk'];
    const layer2cont = h('div#layer2makrukcont.layer-2-container.fairy-grid', [
        h('button.layer-2-category generic-variant-info.generic-makruk', [
            h('div.layer-two-category-info', [
                h('h4', _('Makruk Variants')),
                variantBoard(variant, variant.startFen),
                h('p.variant-category-description.makruk-desc', _('Southeast Asian variants, closely related to Western Chess.')),
                h('h5#makrukl2back', { class: {"icon": true, "icon-reply": true}, on: { click: () => goBackToLayer1(lobbyCtrl, 'layer2makrukcont') } }, _('Go Back')),
            ]),
        ]),
        h('button.layer-2-category.makrukl2', { on: { click: () => layer3variant('layer2makrukcont', lobbyCtrl, 'makruk', false) } }, [
            h('div.variant-title-l2', [
                h('div.icon', { attrs: { 'data-icon': VARIANTS['makruk'].icon(false) } }),
                h('h3', 'Makruk'),
            ]),
            h('p.variant-extra-info', _('Thai Chess. Similar to Chess but with a different queen and bishop.')),
        ]),
        h('button.layer-2-category.makpong', { on: { click: () => layer3variant('layer2makrukcont', lobbyCtrl, 'makpong', false) } }, [
            h('div.variant-title-l2', [
                h('div.icon', { attrs: { 'data-icon': VARIANTS['makpong'].icon(false) } }),
                h('h3', 'Makpong'),
            ]),
            h('p.variant-extra-info', _('Makruk variant. Kings cannot move when checked.')),
        ]),
        h('button.layer-2-category.chatrang', { on: { click: () => layer3variant('layer2makrukcont', lobbyCtrl, 'cambodian', false) } }, [
            h('div.variant-title-l2', [
                h('div.icon', { attrs: { 'data-icon': VARIANTS['cambodian'].icon(false) } }),
                h('h3', 'Ouk Chatrang'),
            ]),
            h('p.variant-extra-info', _('Cambodian Chess. Makruk with extra starting moves.')),
        ]),
        h('button.layer-2-category.sittuyin', { on: { click: () => layer3variant('layer2makrukcont', lobbyCtrl, 'sittuyin', false) } }, [
            h('div.variant-title-l2', [
                h('div.icon', { attrs: { 'data-icon': VARIANTS['sittuyin'].icon(false) } }),
                h('h3', 'Sittuyin'),
            ]),
            h('p.variant-extra-info', _('Burmese Chess. You may place your starting pieces.')),
        ]),
        h('button.layer-2-category.asean', { on: { click: () => layer3variant('layer2makrukcont', lobbyCtrl, 'asean', false) } }, [
            h('div.variant-title-l2', [
                h('div.icon', { attrs: { 'data-icon': VARIANTS['asean'].icon(false) } }),
                h('h3', 'ASEAN'),
            ]),
            h('p.variant-extra-info', _('Makruk with International Chess influence.')),
        ]),
    ]);

    const container = document.getElementById(containerId) as HTMLElement;
    if (container) patch(container, layer2cont);
}
