import { h, VNode } from 'snabbdom';

import { _, i18n } from './i18n';
import { aboutView } from './about';
import { settingsView } from './settingsView';
import { lobbyView } from './lobby';
import { roundView } from './round';
import { inviteView } from './invite';
import { renderGames } from './games';
import { editorView } from './editor';
import { analysisView, embedView } from './analysis';
import { profileView } from './profile';
import { tournamentView } from './tournament';
import { pasteView } from './paste';
import { statsView } from './stats';
import { volumeSettings, soundThemeSettings } from './sound';
import { patch, getCookie } from './document';
import { backgroundSettings } from './background';
import { renderTimeago } from './datetime';
import { zenButtonView, zenModeSettings } from './zen';

// redirect to correct URL except Heroku preview apps
if (window.location.href.includes('heroku') && !window.location.href.includes('-pr-')) {
    //window.location.assign('https://www.pychess.org/');
}

export type PyChessModel = {
    username: string;
    home: string;
    anon: string;
    profileid: string;
    title: string;
    variant: string;
    chess960: string;
    rated: string;
    level: number;
    gameId: string;
    tournamentId: string;
    tournamentname: string;
    inviter: string;
    ply: number;
    wplayer: string;
    wtitle: string;
    wrating: string; // string, because can contain "?" suffix for provisional rating
    wrdiff: number;
    wberserk: string;
    bplayer: string;
    btitle: string;
    brating: string; // string, because can contain "?" suffix for provisional rating
    brdiff: number;
    bberserk: string;
    fen: string;
    base: number;
    inc: number;
    byo: number;
    result: string;
    status: number;
    date: string;
    tv: boolean;
    embed: boolean;
    seekEmpty: boolean;
    tournamentDirector: boolean;

    "asset-url": string;
};

function initModel(el: HTMLElement) {
    const user = getCookie("user");
    return {
        home : el.getAttribute("data-home") ?? "",
        anon : el.getAttribute("data-anon") ?? "",
        profileid : el.getAttribute("data-profile") ?? "",
        title : el.getAttribute("data-title") ?? "",
        variant : el.getAttribute("data-variant") ?? "",
        chess960 : el.getAttribute("data-chess960") ?? "",
        rated : el.getAttribute("data-rated") ?? "",
        level : parseInt(""+el.getAttribute("data-level")),
        username : user !== "" ? user : el.getAttribute("data-user") ?? "",
        gameId : el.getAttribute("data-gameid") ?? "",
        tournamentId : el.getAttribute("data-tournamentid") ?? "",
        tournamentname : el.getAttribute("data-tournamentname") ?? "",
        inviter : el.getAttribute("data-inviter") ?? "",
        ply : parseInt(""+el.getAttribute("data-ply")),
        wplayer : el.getAttribute("data-wplayer") ?? "",
        wtitle : el.getAttribute("data-wtitle") ?? "",
        wrating : el.getAttribute("data-wrating") ?? "",
        wrdiff : parseInt(""+el.getAttribute("data-wrdiff")),
        wberserk : el.getAttribute("data-wberserk") ?? "",
        bplayer : el.getAttribute("data-bplayer") ?? "",
        btitle : el.getAttribute("data-btitle") ?? "",
        brating : el.getAttribute("data-brating") ?? "",
        brdiff : parseInt(""+el.getAttribute("data-brdiff")),
        bberserk : el.getAttribute("data-bberserk") ?? "",
        fen : el.getAttribute("data-fen") ?? "",
        base : parseFloat(""+el.getAttribute("data-base")),
        inc : parseInt(""+el.getAttribute("data-inc")),
        byo : parseInt(""+el.getAttribute("data-byo")),
        result : el.getAttribute("data-result") ?? "",
        status : parseInt(""+el.getAttribute("data-status")),
        date : el.getAttribute("data-date") ?? "",
        tv : el.getAttribute("data-view") === 'tv',
        embed : el.getAttribute("data-view") === 'embed',
        seekEmpty : el.getAttribute("data-seekempty") === "True",
        tournamentDirector: el.getAttribute("data-tournamentdirector") === "True",

        "asset-url": el.getAttribute("data-asset-url") ?? "",
    };
}

export function view(el: HTMLElement, model: PyChessModel): VNode {

    switch (el.getAttribute("data-view")) {
    case 'about':
        return h('div#main-wrap', aboutView());
    case 'level8win':
    case 'profile':
        return h('div#profile', profileView(model));
    case 'tv':
    case 'round':
        return h('div#main-wrap', [h('main.round', roundView(model))]);
    case 'embed':
        return h('div', embedView(model));
    case 'analysis':
        return h('div#main-wrap', analysisView(model));
    case 'invite':
        return h('div#main-wrap', inviteView(model));
    case 'editor':
        return h('div#main-wrap', editorView(model));
    case 'tournament':
        return h('div#main-wrap', [h('main.tour', tournamentView(model))]);
    case 'games':
        return h('div', renderGames());
    case 'paste':
        return h('div#main-wrap', pasteView(model));
    case 'stats':
        return h('div#stats', statsView());
    case 'thanks':
        return h('div#main-wrap', h('h2', _('Thank you for your support!')));
    default:
        return h('div#main-wrap', [h('main.lobby', lobbyView(model))]);
    }
}

function start() {
    const placeholder = document.getElementById('placeholder');
    if (placeholder && el)
        patch(placeholder, view(el, model));

    if (model["embed"]) return;

    (document.querySelector('.hamburger') as HTMLElement).addEventListener('click', () => {
        document.querySelectorAll('.topnav a').forEach(nav => nav.classList.toggle('navbar-show'));
        (document.querySelector('.hamburger') as HTMLElement).classList.toggle('is-active');
        }
    );

    renderTimeago();

    // Clicking outside settings panel closes it
    const settingsPanel = patch(document.getElementById('settings-panel') as HTMLElement, settingsView()).elm as HTMLElement;
    const settings = document.getElementById('settings') as HTMLElement;
    document.addEventListener("click", function(event) {
        if (!settingsPanel.contains(event.target as Node))
            settings.style.display = 'none';
    });

    patch(document.getElementById('zen-button') as HTMLElement, zenButtonView()).elm as HTMLElement;
}

window.addEventListener('resize', () => document.body.dispatchEvent(new Event('chessground.resize')));

backgroundSettings.update();
zenModeSettings.update();

const el = document.getElementById('pychess-variants');
export const model: PyChessModel = el? initModel(el) : initModel(new HTMLElement());

if (el instanceof Element) {

    // Always update sound theme before volume
    // Updating sound theme requires reloading sound files,
    // while updating volume does not
    soundThemeSettings.update();
    volumeSettings.update();

    const lang = el.getAttribute("data-lang");
    fetch(model["asset-url"] + '/lang/' + lang + '/LC_MESSAGES/client.json')
      .then(res => res.json())
      .then(translation => {
        i18n.loadJSON(translation, 'messages');
        i18n.setLocale(lang ?? "en");
        // console.log('Loaded translations for lang', lang);
        start();
      })
      .catch((error) => {
        console.error('Could not load translations for lang', lang);
        console.error(error);
        i18n.setLocale('');
        start();
      });
}
