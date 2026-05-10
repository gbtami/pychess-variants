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
        document.body.dataset.theme = this.value;
        document.documentElement.style.colorScheme = this.value;
    }

    view(): VNode {
        const themeList = radioList(
            this,
            'theme',
            backgrounds(),
            (evt, key) => {
                this.value = key;

                document.body.dataset.theme = key;
                document.documentElement.style.colorScheme = key;

                fetch('/pref/theme', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                    body: new URLSearchParams({ theme: key }),
                }).catch(err => {
                    console.error('Failed to save theme preference', err);
                });
            }
        );

        return h('div#settings-background', [
            h('form.radio-list', {
                on: {
                    submit: (evt: Event) => evt.preventDefault(),
                },
            }, themeList),
        ]);
}
}

export const backgroundSettings = new BackgroundSettings();
