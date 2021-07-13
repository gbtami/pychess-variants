import { h } from 'snabbdom/h';
import { VNode } from 'snabbdom/vnode';

import { _ } from './i18n';
import { StringSettings } from './settings';
import { radioList } from './view';

const zenModeOptions = {
    off: _("Off"),
    on: _("On"),
};

class ZenModeSettings extends StringSettings {

    constructor() {
        super('zen', 'off');
    }

    update(): void {
        document.documentElement.setAttribute('data-zen', this.value);
    }

    view(): VNode {
        return h('div#zen-selector', radioList(this, 'zen', zenModeOptions, (_, key) => this.value = key));
    }

}

export const zenModeSettings = new ZenModeSettings();

function deactivateZenMode() {
    zenModeSettings.value = 'off';
    zenModeSettings.update();
}

export function zenButtonView() {
    return h('button#zen-button', { on: { click: deactivateZenMode } }, [
        h('div.icon.icon-check'),
        _('ZEN MODE'),
    ]);
}

