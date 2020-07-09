import { init } from "snabbdom";
import { VNode } from "snabbdom/vnode";
import klass from 'snabbdom/modules/class';
import attributes from 'snabbdom/modules/attributes';
import properties from 'snabbdom/modules/props';
import listeners from 'snabbdom/modules/eventlisteners';

const patch = init([klass, attributes, properties, listeners]);

import { h } from 'snabbdom/h';
import { toVNode } from 'snabbdom/tovnode';

import { boardSettings } from './board';
import { variants } from './chess';
import { getDocumentData } from './document';
import { _, LANGUAGES, translatedLanguage } from './i18n';
import { sound } from './sound';

/************************* Class declarations *************************/

export abstract class Settings<T> {
    readonly name: string;
    private _value: T;

    constructor(name: string, defaultValue: T) {
        this.name = name;
        this._value = localStorage[name] ?? defaultValue;
    }

    get value(): T {
        return this._value;
    }
    set value(value: T) {
        localStorage[this.name] = value;
        this._value = value;
        this.update();
    }

    abstract update(): void;
    abstract view(): VNode;
}

class LanguageSettings { // extends Settings<string> {
    readonly name: string;
    private _value: string;

    constructor() {
        this.name = 'lang';
        this._value = getDocumentData('lang') ?? 'en';
    }

    get value(): string {
        return this._value;
    }
    set value(value: string) {
        this._value = value;
        this.update();
    }

    update(): void {
    }

    view(): VNode {
        let langList: VNode[] = [];
        Object.keys(LANGUAGES).forEach(key => {
            langList.push(h('input#lang-' + key, {
                props: { type: "radio", name: "lang", value: key },
                attrs: { checked: this.value === key },
                on: { change: e => {
                    this.value = key;
                    (e.target as HTMLInputElement).form!.submit();
                }},
            }));
            langList.push(h('label', { attrs: { for: "lang-" + key } }, LANGUAGES[key]));
        });
        return h('div#settings-lang', [
            h('form.radio-list', { props: { method: "post", action: "/translation/select" } }, langList),
        ]);
    }
}

class VolumeSettings extends Settings<number> {

    constructor() {
        super('volume', 1);
    }

    update(): void {
        sound.updateVolume();
    }

    view(): VNode {
        return h('input#sound-volume.slider', {
            props: { name: "volume", type: "range", min: 0, max: 1, step: 0.01, value: this.value },
            on: { change: e => this.value = parseFloat((e.target as HTMLInputElement).value) },
        });
    }
}

const soundThemes = [ 'silent', 'standard', 'robot' ];

class SoundThemeSettings extends Settings<string> {
    
    constructor() {
        super('soundTheme', 'standard');
    }

    update(): void {
        sound.updateSoundTheme();
    }

    view(): VNode {
        let soundThemeList: VNode[] = [];
        soundThemes.forEach(theme => {
            soundThemeList.push(h('input#sound-' + theme, {
                props: { name: "sound-theme", type: "radio"},
                attrs: { checked: this.value === theme },
                on: { change: () => this.value = theme }
            }));
            soundThemeList.push(h('label', { attrs: { for: "sound-" + theme } }, theme));
        });
        return h('div#sound-theme.radio-list', soundThemeList);
    }
}

const backgrounds = [ 'light', 'dark' ];

class BackgroundSettings extends Settings<string> {

    constructor() {
        super('theme', 'light');
    }

    update(): void {
        document.documentElement.setAttribute('data-theme', this.value);
    }

    view(): VNode {
        let backgroundList: VNode[] = [];
        backgrounds.forEach(theme => {
            backgroundList.push(h('input#background-' + theme, {
                props: { name: "background", type: "radio"},
                attrs: { checked: this.value === theme },
                on: { change: () => this.value = theme }
            }));
            backgroundList.push(h('label', { attrs: { for: "background-" + theme.toLowerCase() } }, theme));
        });
        return h('div#settings-background', backgroundList);
    }

}

/*********************** End class declarations ***********************/

export const languageSettings = new LanguageSettings();
export const volumeSettings = new VolumeSettings();
export const soundThemeSettings = new SoundThemeSettings();
export const backgroundSettings = new BackgroundSettings();

export function settingsView() {
    const anon = getDocumentData('anon');
    const menu = (anon === 'True') ? [ settingsMenu() ] : [ userMenu(), settingsMenu() ];
    return h('div#settings-panel', [
        settingsButton(),
        h('div#settings', [
            h('div#settings-main', menu),
            h('div#settings-sub'),
        ]),
    ]);
}

function settingsButton() {
    return h('button#btn-settings', { on: { click: toggleSettings } }, [
        h('div.icon.icon-cog'),
    ]);
}

function toggleSettings() {
    if ((document.getElementById('settings') as HTMLElement).style.display === 'flex')
        hideSettings();
    else
        showMainSettings();
}

function hideSettings() {
    (document.getElementById('settings') as HTMLElement).style.display = 'none';
}

function showMainSettings() {
    (document.getElementById('settings') as HTMLElement).style.display = 'flex';
    (document.getElementById('settings-main') as HTMLElement).style.display = 'flex';
    (document.getElementById('settings-sub') as HTMLElement).style.display = 'none';
}

function userMenu() {
    return h('div#settings-buttons', [
        h('button#btn-logout', { on: { click: logoutDialog } }, _("Log out")),
    ]);
}

function logoutDialog() {
    if (confirm(_("Are you sure you want to log out?")))
        window.location.href = "/logout";
}

function settingsMenu() {
    return h('div#settings-buttons', [
        h('button#btn-lang', { on: { click: showSubsettings } }, translatedLanguage),
        h('button#btn-sound', { on: { click: showSubsettings } }, _('Sound')),
        h('button#btn-background', { on: { click: showSubsettings } }, _('Background')),
        h('button#btn-board', { on: { click: showSubsettings } }, _('Board Settings')),
    ]);
}

function showSubsettings(evt) {
    const mainSettings = document.getElementById('settings-main') as HTMLElement;
    const subSettings = document.getElementById('settings-sub') as HTMLElement;
    const settingsName = evt.target.id.slice(4);
    switch (settingsName) {
        case "lang":
            patch(toVNode(subSettings), langSettingsView());
            break;
        case "sound":
            patch(toVNode(subSettings), soundSettingsView());
            break;
        case "background":
            patch(toVNode(subSettings), backgroundSettingsView());
            break;
        case "board":
            patch(toVNode(subSettings), boardSettingsView());
            showVariantBoardSettings((document.getElementById('board-variant') as HTMLInputElement).value);
            break;
    }
    mainSettings.style.display = 'none';
    subSettings.style.display = 'flex';
}

function langSettingsView() {
    return h('div#settings-sub', [
        h('button.back', { on: { click: showMainSettings } }, [
            h('back.icon.icon-left', translatedLanguage),
        ]),
        languageSettings.view(),
    ]);
}

function soundSettingsView() {
    return h('div#settings-sub', [
        h('button.back', { on: { click: showMainSettings } }, [
            h('back.icon.icon-left', _("Sound")),
        ]),
        h('div#settings-sound', [
            volumeSettings.view(),
            soundThemeSettings.view(),
        ]),
    ]);
}

function backgroundSettingsView() {
    return h('div#settings-sub', [
        h('button.back', { on: { click: showMainSettings } }, [
            h('back.icon.icon-left', _("Background")),
        ]),
        backgroundSettings.view(),
    ]);
}

function boardSettingsView() {
    const variant = getDocumentData('variant');
    let variantList: VNode[] = [];
    variantList.push(h('option', { props: { value: "" } }, ""));
    variants.forEach(v => {
        variantList.push(h('option', {
            props: { value: v },
            attrs: { selected: variant === v }
        }, v.toUpperCase()));
    });
    return h('div#settings-sub', [
        h('button.back', { on: { click: showMainSettings } }, [
            h('back.icon.icon-left', _("Board Settings")),
        ]),
        h('div#settings-board', [
            h('div', [
                h('label', { props: { for: "board-variant" } }, _("Variant")),
                h('select#board-variant', { on: { change: e => showVariantBoardSettings((e.target as HTMLInputElement).value) } }, variantList),
            ]),
            h('div#board-settings'),
        ]),
    ]);
}

function showVariantBoardSettings(variant) {
    const settings = document.getElementById('board-settings') as HTMLElement;
    patch(toVNode(settings), boardSettings.view(variant));
}
