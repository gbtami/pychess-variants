import { h } from "snabbdom";

import { backgroundSettings } from './background';
import { gameCategorySettings } from './gameCategory';
import { boardSettings } from './boardSettings';
import { selectVariant } from './variants';
import { patch, getDocumentData } from './document';
import { _, translatedGameCategory, translatedLanguage, languageSettings } from './i18n';
import { volumeSettings, soundThemeSettings } from './sound';
import { zenModeSettings } from './zen';
import { confirmDialog } from './confirmDialog';

export function settingsView(modelVariant: string) {
    const anon = getDocumentData('anon') === 'True';
    return h('div#settings-panel', [
        settingsButton(),
        h('div#settings', [
            h('div#settings-main', [mainMenu(anon)]),
            h('div#settings-sub', [
                langSettingsView(),
                soundSettingsView(),
                backgroundSettingsView(),
                gameCategorySettingsView(),
                boardSettingsView(modelVariant),
                zenModeSettingsView(),
                privacySettingsView(),
            ]),
        ]),
    ]);
}

function settingsButton() {
    return h('button#btn-settings', { on: { click: toggleSettings }, attrs: { 'aria-label': "Settings" } }, [
        h('div.icon.icon-cog'),
    ]);
}

function toggleSettings() {
    if ((document.getElementById('settings') as HTMLElement).style.display === 'flex') {
        hideSettings();
    } else {
        showMainSettings();
    }
}

export function hideSettings() {
    (document.getElementById('btn-settings') as HTMLElement).classList.remove('shown');
    (document.getElementById('settings') as HTMLElement).style.display = 'none';
}

function showMainSettings() {
    (document.getElementById('btn-settings') as HTMLElement).classList.add('shown');
    (document.getElementById('settings') as HTMLElement).style.display = 'flex';
    (document.getElementById('settings-main') as HTMLElement).style.display = 'flex';
    (document.getElementById('settings-sub') as HTMLElement).style.display = 'none';
}

function mainMenu(anon: boolean) {
    const buttons = [
        h('button#btn-lang', { on: { click: showSubsettings } }, translatedLanguage),
        h('button#btn-sound', { on: { click: showSubsettings } }, _('Sound')),
        h('button#btn-background', { on: { click: showSubsettings } }, _('Background')),
        h('button#btn-game-category', { on: { click: showSubsettings } }, translatedGameCategory),
        h('button#btn-board', { on: { click: showSubsettings } }, _('Board Settings')),
        h('button#btn-zen', { on: { click: showSubsettings } }, _('Zen Mode')),
    ];

    if (!anon) {
        buttons.push(
            h('div.settings-menu-separator', { attrs: { role: "separator" } }),
            h('button#btn-inbox-menu', { on: { click: gotoInbox } }, _("Inbox")),
            h('button#btn-privacy', { on: { click: showSubsettings } }, _("Privacy")),
            h('button#btn-account-privacy', { on: { click: gotoAccountPrivacy } }, _("Account & Privacy")),
            h('button#btn-logout', { on: { click: logoutDialog } }, _("Log out")),
        );
    }

    return h(anon ? 'div#settings-buttons.anon' : 'div#settings-buttons.logged-in', buttons);
}

function gotoInbox() {
    window.location.href = "/inbox";
}

function gotoAccountPrivacy() {
    window.location.href = "/contact";
}

async function logoutDialog() {
    const confirmed = await confirmDialog({
        text: _("Are you sure you want to log out?"),
        confirmText: _("Log out"),
        cancelText: _("Cancel"),
    });
    if (!confirmed) return;
    window.location.href = "/logout";
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

function gameCategorySettingsView() {
    return h('div#settings-game-category', [
        backButton(translatedGameCategory),
        gameCategorySettings.view(),
    ]);
}

function zenModeSettingsView() {
    return h('div#settings-zen', [
        backButton(_("Zen Mode")),
        zenModeSettings.view(),
    ]);
}

function privacySettingsView() {
    const pmFriendsOnly = getDocumentData('pm-friends-only') === 'True';
    const corrPushEnabled = getDocumentData('corr-push-enabled') !== 'False';
    return h('div#settings-privacy', [
        backButton(_("Privacy")),
        h('div', [
            h('label.switch', [
                h('input#pm-friends-only', {
                    attrs: { type: 'checkbox', checked: pmFriendsOnly },
                    on: {
                        change: (evt: Event) => {
                            const next = (evt.target as HTMLInputElement).checked;
                            setPmFriendsOnly(next);
                        },
                    },
                }),
                h('span', _('Only friends can message me')),
            ]),
            h('label.switch', [
                h('input#corr-push-enabled', {
                    attrs: { type: 'checkbox', checked: corrPushEnabled },
                    on: {
                        change: (evt: Event) => {
                            const next = (evt.target as HTMLInputElement).checked;
                            setCorrPushEnabled(next);
                        },
                    },
                }),
                h('span', _('Correspondence move push notifications')),
            ]),
        ]),
    ]);
}

function setPmFriendsOnly(value: boolean) {
    const payload = new URLSearchParams({ pm_friends_only: value ? 'true' : 'false' });
    fetch('/pref/pm-friends-only', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body: payload.toString(),
    }).catch((error) => {
        console.warn('Failed to update PM privacy setting.', error);
    });
}

function setCorrPushEnabled(value: boolean) {
    const payload = new URLSearchParams({ corr_push: value ? 'true' : 'false' });
    fetch('/pref/corr-push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body: payload.toString(),
    }).catch((error) => {
        console.warn('Failed to update correspondence push setting.', error);
    });
}

function boardSettingsView(modelVariant: string) {
    const variant = getDocumentData('variant') || "chess";
    return h('div#settings-board', [
        backButton(_("Board Settings")),
        h('div', [
            h('div.labelled', [
                h('label', { props: { for: "settings-variant" } }, _("Variant")),
                selectVariant(
                    "settings-variant",
                    variant,
                    () => showVariantBoardSettings(modelVariant),
                    () => showVariantBoardSettings(modelVariant),
                    [],
                    getDocumentData('game-category') || undefined,
                ),
            ]),
            h('div#board-settings'),
        ]),
    ]);
}

function showVariantBoardSettings(modelVariant: string) {
    const e = document.getElementById('settings-variant') as HTMLSelectElement;
    const selectedVariant = e.options[e.selectedIndex].value;
    const settings = document.getElementById('board-settings') as HTMLElement;
    settings.innerHTML = "";
    patch(settings, boardSettings.view(selectedVariant, modelVariant));
}
