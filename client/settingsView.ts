import { init, h } from "snabbdom";
import klass from 'snabbdom/modules/class';
import attributes from 'snabbdom/modules/attributes';
import properties from 'snabbdom/modules/props';
import listeners from 'snabbdom/modules/eventlisteners';
import style from 'snabbdom/modules/style';

const patch = init([klass, attributes, properties, listeners, style]);

import { backgroundSettings } from './background';
import { boardSettings } from './boardSettings';
import { selectVariant } from './chess';
import { getDocumentData } from './document';
import { _, translatedLanguage, languageSettings } from './i18n';
import { volumeSettings, soundThemeSettings } from './sound';
import { zenModeSettings } from './zen';

export function settingsView() {
    const anon = getDocumentData('anon');
    const menu = (anon === 'True') ? [ settingsMenu() ] : [ userMenu(), settingsMenu() ];
    return h('div#settings-panel', [
        settingsButton(),
        h('div#settings', [
            h('div#settings-main', menu),
            h('div#settings-sub', [
                langSettingsView(),
                soundSettingsView(),
                backgroundSettingsView(),
                boardSettingsView(),
                zenModeSettingsView(),
            ]),
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
        h('button#btn-zen', { on: { click: showSubsettings } }, _('Zen Mode')),
    ]);
}

function showSubsettings(evt: MouseEvent) {
    const mainSettings = document.getElementById('settings-main') as HTMLElement;
    const subSettings = document.getElementById('settings-sub') as HTMLElement;

    Array.from(subSettings.children).forEach((sub: HTMLElement) => sub.style.display = 'none');

    const settingsName = (<HTMLButtonElement>evt.target).id.slice(4);
    const targetSettings = document.getElementById('settings-' + settingsName) as HTMLElement;
    targetSettings.style.display = 'flex';

    mainSettings.style.display = 'none';
    subSettings.style.display = 'flex';
}

function backButton(text: string) {
    return h('button.back', { on: { click: showMainSettings } }, [
        h('back.icon.icon-left', text),
    ]);
}

function langSettingsView() {
    return h('div#settings-lang', [
        backButton(translatedLanguage),
        languageSettings.view(),
    ]);
}

function soundSettingsView() {
    return h('div#settings-sound', [
        backButton(_("Sound")),
        h('div', [
            volumeSettings.view(),
            soundThemeSettings.view(),
        ]),
    ]);
}

function backgroundSettingsView() {
    return h('div#settings-background', [
        backButton(_("Background")),
        backgroundSettings.view(),
    ]);
}

function zenModeSettingsView() {
    return h('div#settings-zen', [
        backButton(_("Zen Mode")),
        zenModeSettings.view(),
    ]);
}

function boardSettingsView() {
    const variant = getDocumentData('variant') || "chess";
    return h('div#settings-board', [
        backButton(_("Board Settings")),
        h('div', [
            h('div', [
                h('label', { props: { for: "settings-variant" } }, _("Variant")),
                selectVariant(
                    "settings-variant",
                    variant,
                    () => showVariantBoardSettings(),
                    () => showVariantBoardSettings(),
                ),
            ]),
            h('div#board-settings'),
        ]),
    ]);
}

function showVariantBoardSettings() {
    const e = document.getElementById('settings-variant') as HTMLSelectElement;
    const variant = e.options[e.selectedIndex].value;
    const settings = document.getElementById('board-settings') as HTMLElement;
    settings.innerHTML = "";
    patch(settings, boardSettings.view(variant));
}
