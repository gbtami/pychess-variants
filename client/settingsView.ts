import { init } from "snabbdom";
import klass from 'snabbdom/modules/class';
import attributes from 'snabbdom/modules/attributes';
import properties from 'snabbdom/modules/props';
import listeners from 'snabbdom/modules/eventlisteners';

const patch = init([klass, attributes, properties, listeners]);

import { VNode } from "snabbdom/vnode";
import { h } from 'snabbdom/h';
import { toVNode } from 'snabbdom/tovnode';

import { backgroundSettings } from './background';
import { boardSettings } from './boardSettings';
import { variants } from './chess';
import { getDocumentData } from './document';
import { _, translatedLanguage, languageSettings } from './i18n';
import { volumeSettings, soundThemeSettings } from './sound';

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

function backButton(text: string) {
    return h('button.back', { on: { click: showMainSettings } }, [
        h('back.icon.icon-left', text),
    ]);
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
