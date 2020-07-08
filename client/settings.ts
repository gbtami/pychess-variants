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
import { _, LANGUAGES, translatedLanguage } from './i18n';
import { sound } from './sound';

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

export const volumeSettings = new VolumeSettings();
export const soundThemeSettings = new SoundThemeSettings();

function settingsMenu() {
    return h('div#settings-buttons', [
        h('button#btn-lang', { on: { click: () => showSubsettings('lang') } }, translatedLanguage),
        h('button#btn-sound', { on: { click: () => showSubsettings('sound') } }, _('Sound')),
        h('button#btn-background', { on: { click: () => showSubsettings('background') } }, _('Background')),
        h('button#btn-board', { on: { click: () => showSubsettings('board') } }, _('Board Settings')),
    ]);
}

export function settingsView() {
    const anon = document.getElementById('pychess-variants')!.getAttribute("data-anon");
    const menu = (anon === 'True') ? [ settingsMenu() ] : [ userMenu(), settingsMenu() ];
    return h('div#settings-panel', [
        settingsButton(),
        h('div#settings', [
            h('div#settings-main', menu),
            h('div#settings-sub'),
        ])
    ]);
}

function settingsButton() {
    return h('button#btn-settings', { on: { click: toggleSettings } }, [
        h('div.icon.icon-cog'),
    ]);
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

export function hideSettings() {
    (document.getElementById('settings') as HTMLElement).style.display = 'none';
}

export function showMainSettings() {
    (document.getElementById('settings') as HTMLElement).style.display = 'flex';
    (document.getElementById('settings-main') as HTMLElement).style.display = 'flex';
    (document.getElementById('settings-sub') as HTMLElement).style.display = 'none';
}

export function toggleSettings() {
    if ((document.getElementById('settings') as HTMLElement).style.display === 'flex')
        hideSettings();
    else
        showMainSettings();
}

function showSubsettings(settingsName) {
    const mainSettings = document.getElementById('settings-main') as HTMLElement;
    const subSettings = document.getElementById('settings-sub') as HTMLElement;

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
    const currentLang = document.getElementById('pychess-variants')!.getAttribute("data-lang");
    let langList: VNode[] = [];
    Object.keys(LANGUAGES).forEach(key => {
        langList.push(h('input#lang-' + key, {
            props: { type: "radio", name: "lang", value: key },
            attrs: { checked: currentLang === key },
            on: { change: e => (e.target as HTMLInputElement).form!.submit() },
        }));
        langList.push(h('label', { attrs: { for: "lang-" + key } }, LANGUAGES[key]));
    });
    return h('div#settings-sub', [
        h('button.back', { on: { click: showMainSettings } }, [
            h('back', {class: { icon: true, "icon-left": true } }, _("Language")),
        ]),
        h('div#settings-lang', [
            h('form.radio-list', { props: { method: "post", action: "/translation/select" } }, langList),
        ]),
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

const backgrounds = [ 'Light', 'Dark' ];
function backgroundSettingsView() {
    const currentBackground = localStorage.theme ?? 'light';
    let backgroundList: VNode[] = [];
    backgrounds.forEach(theme => {
        backgroundList.push(h('input#background-' + theme.toLowerCase(), {
            props: { name: "background", type: "radio"},
            attrs: { checked: currentBackground === theme.toLowerCase() },
            on: { change: () => setBackground(theme) }
        }));
        backgroundList.push(h('label', { attrs: { for: "background-" + theme.toLowerCase() } }, theme));
    });
    return h('div#settings-sub', [
        h('button.back', { on: { click: showMainSettings } }, [
            h('back', {class: { icon: true, "icon-left": true } }, _("Background")),
        ]),
        h('div#settings-background', backgroundList),
    ]);
}

function boardSettingsView() {
    const variant = document.getElementById("pychess-variants")!.getAttribute("data-variant");
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
            h('back', {class: { icon: true, "icon-left": true } }, _("Board Settings")),
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

function setBackground(theme) {
    const oldTheme = document.documentElement.getAttribute('data-theme');
    localStorage.theme = theme.toLowerCase();
    updateBackground();
    if (oldTheme !== theme.toLowerCase()) {
        var alliside = document.getElementsByTagName('i-side');
        for (var j = 0; j < alliside.length; j++) {
            // take care of random color seek icons
            if (!alliside[j].classList.contains('icon-adjust')) {
                alliside[j].classList.toggle("icon-white");
                alliside[j].classList.toggle("icon-black");
            }
        }
    }
}

export function updateBackground() {
    const theme = localStorage.theme ?? 'light';
    document.documentElement.setAttribute('data-theme', theme);
}
