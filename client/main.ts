import { h, VNode } from 'snabbdom';

import ffishModule, { FairyStockfish } from 'ffish-es6';

import { _, i18n } from './i18n';
import { aboutView } from './about';
import { settingsView, hideSettings } from './settingsView';
import { notifyView, hideNotify } from './notifyView';
import { lobbyView } from './lobby';
import { roundView } from './round';
import { inviteView } from './invite';
import { renderGames } from './games';
import { editorView } from '@/editor/editor';
import { analysisView, embedView } from './analysis';
import { puzzleView } from './puzzle';
import { profileView } from './profile';
import { tournamentView } from './tournament';
import { calendarView } from './calendar';
import { pasteView } from './paste';
import { statsView } from './stats';
import { volumeSettings, soundThemeSettings } from './sound';
import { patch, getCookie } from './document';
import { renderTimeago } from './datetime';
import { zenButtonView, zenModeSettings } from './zen';
import { PyChessModel } from './types';
import { roundView as bugRoundView } from "./bug/round.bug";
import { analysisView as bugAnalysisView } from "./bug/analysis.bug";
import { variantGroups } from './variants';
import { variantsIni } from './variantsIni';

// redirect to correct URL except Heroku preview apps
if (window.location.href.includes('heroku') && !window.location.href.includes('-pr-')) {
    window.location.assign('https://www.pychess.org/');
}

function initModel(el: HTMLElement) {
    // We have to remove leading and trailing double quotes from anon names
    // because python http.cookies.SimpleCookie() adds it when name contains dash "–"
    const user = getCookie("user").replace(/(^"|"$)/g, '');

    // Remove bughouse from variants on prod site until it stabilizes
    if (el.getAttribute("data-dev") !== "True") {
        const idx = variantGroups.standard.variants.indexOf('bughouse');
        variantGroups.standard.variants.splice(idx, 1);
    }

    let ct = el.getAttribute("data-ct") ?? "";
    if (ct) ct = JSON.parse(ct);
    let board = el.getAttribute("data-board") ?? "";
    if (board) board = JSON.parse(board);
    return {
        ffish : {} as FairyStockfish,
        home : el.getAttribute("data-home") ?? "",
        anon : el.getAttribute("data-anon") ?? "",
        profileid : el.getAttribute("data-profile") ?? "",
        title : el.getAttribute("data-title") ?? "",
        variant : el.getAttribute("data-variant") ?? "",
        chess960 : el.getAttribute("data-chess960") ?? "",
        rated : el.getAttribute("data-rated") ?? "",
        corr: el.getAttribute("data-corr") ?? "",
        level : parseInt(""+el.getAttribute("data-level")),
        username : user !== "" ? user : el.getAttribute("data-user") ?? "",
        gameId : el.getAttribute("data-gameid") ?? "",
        tournamentId : el.getAttribute("data-tournamentid") ?? "",
        tournamentname : el.getAttribute("data-tournamentname") ?? "",
        inviter : el.getAttribute("data-inviter") ?? "",
        ply : parseInt(""+el.getAttribute("data-ply")),
        ct: ct,
        board: board,

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

        wplayerB : el.getAttribute("data-wplayer-b") ?? "",
        wtitleB : el.getAttribute("data-wtitle-b") ?? "",
        wratingB : el.getAttribute("data-wrating-b") ?? "",

        bplayerB : el.getAttribute("data-bplayer-b") ?? "",
        btitleB : el.getAttribute("data-btitle-b") ?? "",
        bratingB : el.getAttribute("data-brating-b") ?? "",

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
        assetURL: el.getAttribute("data-asset-url") ?? "",
        puzzle: el.getAttribute("data-puzzle") ?? "",
        blogs: el.getAttribute("data-blogs") ?? "",
        corrGames: el.getAttribute("data-corrgames") ?? "",
    };
}

export function view(el: HTMLElement, model: PyChessModel): VNode {

    switch (el.getAttribute("data-view")) {
    case 'about':
        return h('div#main-wrap', aboutView(model));
    case 'level8win':
    case 'profile':
        return h('div#profile', profileView(model));
    case 'tv':
    case 'round':
        switch (model.variant) {
            case 'bughouse': return h('div#main-wrap.bug', [h('main.round.bug', bugRoundView(model))]);
            default: return h('div#main-wrap', [h('main.round', roundView(model))]);
        }
    case 'embed':
        return h('div', embedView(model));
    case 'analysis':
        switch (model.variant) {
            case 'bughouse': return h('div#main-wrap.bug', bugAnalysisView(model));
            default: return h('div#main-wrap', analysisView(model));;
        }
    case 'puzzle':
        return h('div#main-wrap', puzzleView(model));
    case 'invite':
        return h('div#main-wrap', inviteView(model));
    case 'editor':
        return h('div#main-wrap', editorView(model));
    case 'tournament':
        return h('div#main-wrap', [h('main.tour', tournamentView(model))]);
    case 'calendar':
        return h('div#calendar', calendarView());
    case 'games':
        return h('div', renderGames(model));
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

        if (['round', 'analysis', 'puzzle', 'editor', 'tv'].includes(el.getAttribute("data-view") ?? "")) {
            console.time('load ffish');
            ffishModule().then((loadedModule: any) => {
                console.timeEnd('load ffish');
                loadedModule.loadVariantConfig(variantsIni);
                model.ffish = loadedModule;
                patch(placeholder, view(el, model));
            });
        } else  {
            patch(placeholder, view(el, model));
        }

    if (model["embed"]) return;

    (document.querySelector('.hamburger') as HTMLElement).addEventListener('click', () => {
        document.querySelectorAll('.topnav a').forEach(nav => nav.classList.toggle('navbar-show'));
        (document.querySelector('.hamburger') as HTMLElement).classList.toggle('is-active');
        }
    );

    renderTimeago();

    // searchbar
    const searchIcon = document.querySelector('.search-icon') as HTMLElement;
    const searchBar = document.querySelector('.search-bar') as HTMLElement;
    const searchInput = document.querySelector('#search-input') as HTMLInputElement;
    
    searchIcon.onclick = function(){
        searchBar.classList.toggle('active');
        if (searchBar.classList.contains('active'))
            // Add some delay so that the input won't eat the icon during the transition animation
            setTimeout(() => searchInput.focus(), 200);
    }

    function showResults(val: String) {
        const acResult = document.getElementById("ac-result") as HTMLElement;
        if (val.length < 4) {
            acResult.innerHTML = '';
            return;
        }
        fetch('/api/names?p=' + val)
            .then(res => res.json())
            .then(data => {
                console.log(data);
                const list = data.map((el: String) => {
                    const title = (el[1]) ? `<player-title>${el[1]} </player-title>` : '';
                    return `<li><a class="user-link" href="${model["home"]}/@/${el[0]}">${title}${el[0]}</a></li>`;
                });
                console.log(list);
                acResult.innerHTML = '<ul class="box">' + list.join('') + '</ul>';
            })
            .catch((err) => {
            console.warn('Something went wrong.', err);
            }
        );
    }

    searchInput.addEventListener("keyup", function(e) {
        showResults(searchInput.value);
        if (e.keyCode === 13) {
            window.location.href = `${model["home"]}/@/${searchInput.value}`;
        }
    });

    // Clicking outside settings panel closes it
    const settingsPanel = patch(document.getElementById('settings-panel') as HTMLElement, settingsView(model["variant"])).elm as HTMLElement;
    var notifyPanel = document.getElementById('notify-panel') as HTMLElement;
    if (model["anon"] !== 'True') {
        notifyPanel = patch(notifyPanel, notifyView()).elm as HTMLElement;
    }

    document.addEventListener("click", function(event) {
        if (!settingsPanel.contains(event.target as Node))
            hideSettings();
        if (model["anon"] !== 'True') {
            if (!notifyPanel.contains(event.target as Node))
                hideNotify();
        }
    });

    patch(document.getElementById('zen-button') as HTMLElement, zenButtonView()).elm as HTMLElement;
}

window.addEventListener('resize', () => document.body.dispatchEvent(new Event('chessground.resize')));

zenModeSettings.update();

const el = document.getElementById('pychess-variants');
export const model: PyChessModel = el? initModel(el) : initModel(new HTMLElement());

if (el instanceof Element) {

    // Always update sound theme before volume
    // Updating sound theme requires reloading sound files,
    // while updating volume does not
    soundThemeSettings.assetURL = model.assetURL;
    soundThemeSettings.update();
    volumeSettings.update();

    const lang = el.getAttribute("data-lang") ?? 'en';
    fetch(model.assetURL + '/lang/' + lang + '/LC_MESSAGES/client.json')
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
