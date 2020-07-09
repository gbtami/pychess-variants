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

// TODO Ideally all settings should be bound to account and fetched from server like the LanguageSettings

export abstract class Settings<T> {
    readonly name: string;
    protected _value: T;

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

class LanguageSettings extends Settings<string> {

    constructor() {
        super('lang', 'en');
        this._value = getDocumentData('lang') ?? 'en';
    }

    set value(value: string) {
        this._value = value;
        this.update();
    }

    update(): void {
    }

    view(): VNode {
        const langList = radioList(
            this,
            'lang',
            LANGUAGES,
            (evt, key) => {
                this.value = key;
                (evt.target as HTMLInputElement).form!.submit();
            }
        );
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
        return slider(this, 'sound-volume', 0, 1, 0.01);
    }
}

const soundThemes = {
    silent: "Silent",
    standard: "Standard",
    robot: "Robot",
};

class SoundThemeSettings extends Settings<string> {
    
    constructor() {
        super('soundTheme', 'standard');
    }

    update(): void {
        sound.updateSoundTheme();
    }

    view(): VNode {
        return h('div#sound-theme.radio-list', radioList(this, 'sound-theme', soundThemes, (_, key) => this.value = key));
    }
}

const backgrounds = {
    light: _("Light"),
    dark: _("Dark"),
};

class BackgroundSettings extends Settings<string> {

    constructor() {
        super('theme', 'light');
    }

    update(): void {
        document.documentElement.setAttribute('data-theme', this.value);
    }

    view(): VNode {
        return h('div#settings-background', radioList(this, 'background', backgrounds, (_, key) => this.value = key));
    }

}

/*********************** End class declarations ***********************/

/******************* General View-related functions *******************/

function radioList(settings: Settings<string>, name: string, options: { [key: string]: string }, onchange: (evt, key: string) => void): VNode[] {
    let result: VNode[] = [];
    Object.keys(options).forEach(key => {
        const optionID = name + "-" + key;
        result.push(h('input#' + optionID, {
            props: { name: name, type: "radio", value: key },
            attrs: { checked: settings.value === key },
            on: { change: evt => onchange(evt, key) },
        }));
        result.push(h('label', { attrs: { for: optionID } }, options[key]));
    });
    return result;
}

function slider(settings: Settings<number>, name: string, min: number = 0, max: number = 100, step: number = 1) {
    return h('input#' + name + '.slider', {
        props: { name: name, type: "range", min: min, max: max, step: step, value: settings.value },
        on: { change: e => settings.value = parseFloat((e.target as HTMLInputElement).value) },
    });
}

function backButton(text: string) {
    return h('button.back', { on: { click: showMainSettings } }, [
        h('back.icon.icon-left', text),
    ]);
}

/***************** End General View-related functions *****************/

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
        backButton(translatedLanguage),
        languageSettings.view(),
    ]);
}

function soundSettingsView() {
    return h('div#settings-sub', [
        backButton(_("Sound")),
        h('div#settings-sound', [
            volumeSettings.view(),
            soundThemeSettings.view(),
        ]),
    ]);
}

function backgroundSettingsView() {
    return h('div#settings-sub', [
        backButton(_("Background")),
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
        backButton(_("Board Settings")),
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
