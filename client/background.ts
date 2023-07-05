import { h, VNode } from 'snabbdom';

import { _ } from './i18n';
import { StringSettings } from './settings';
import { radioList } from './view';

function backgrounds() {
    return {
        light: _("Light"),
        dark: _("Dark"),
    }
}

class BackgroundSettings extends StringSettings {

    constructor() {
        super('theme', 'dark');
    }

    update(): void {
    }

    view(): VNode {
        const themeList = radioList(
            this,
            'theme',
            backgrounds(),
            (evt, key) => {
                this.value = key;
                (evt.target as HTMLInputElement).form!.submit();
            }
        )
        return h('div#settings-background', [
            h('form.radio-list', { props: { method: "post", action: "/pref/theme" } }, themeList),
        ]);
    }

}

export const backgroundSettings = new BackgroundSettings();
