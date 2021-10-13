import { h } from 'snabbdom';
import { VNode } from 'snabbdom/vnode';

import { _ } from './i18n';
import { StringSettings } from './settings';
import { radioList } from './view';

import { init } from "snabbdom";
import klass from 'snabbdom/modules/class';
import attributes from 'snabbdom/modules/attributes';
import properties from 'snabbdom/modules/props';
import listeners from 'snabbdom/modules/eventlisteners';

const patch = init([klass, attributes, properties, listeners]);

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

    const zenSettings = document.getElementById('zen-selector') as HTMLElement;
    zenSettings.innerHTML = "";
    patch(zenSettings, zenModeSettings.view());
}

export function zenButtonView() {
    return h('a#zen-button', { on: { click: deactivateZenMode } }, [
        h('div.icon.icon-check', _('ZEN MODE'))
    ]);
}

