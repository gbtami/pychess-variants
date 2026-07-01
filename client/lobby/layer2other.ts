import { h } from 'snabbdom';

import { _ } from '../i18n';
import { isCataloguedVariant, VARIANTS, variantGroups } from '../variants';
import { patch } from '../document';
import { LobbyController } from '../lobby';
import { goBackToLayer1, variantBoard } from './util';
import { layer3variant } from './layer3';

export function layer2other(lobbyCtrl: LobbyController, containerId: string, showBack: boolean = true): void {
    const ataxx = VARIANTS['ataxx'];
    const preview = ataxx ?? VARIANTS[variantGroups.other.variants.find(name => !!VARIANTS[name]) ?? 'chess'];
    const otherVariants = variantGroups.other.variants.filter(name => !!VARIANTS[name]);

    const infoItems = [
        h('h4', _('Other Variants')),
        preview ? variantBoard(preview, preview.startFen) : h('p.variant-category-description', _('Variants that do not fit into other groups.')),
        h('p.variant-category-description', _('Variants that do not fit into other groups. Uploaded variants are managed from Tools → Manage my variants.')),
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
        h('div.button-grid', otherVariants.map(name => {
            const variant = VARIANTS[name];
            return h('button.layer-2-category', { class: { catalogued: isCataloguedVariant(name) }, on: { click: () => layer3variant('layer2othercont', lobbyCtrl, name) } }, [
                h('div.variant-title-l2', [
                    h('div.icon', { attrs: { 'data-icon': variant.icon() } }),
                    h('h3', variant.displayName()),
                ]),
            ]);
        })),
    ]);

    const container = document.getElementById(containerId) as HTMLElement;
    if (container) patch(container, layer2cont);
}
