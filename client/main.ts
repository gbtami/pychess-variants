import { init } from 'snabbdom';
import klass from 'snabbdom/modules/class';
import attributes from 'snabbdom/modules/attributes';
import properties from 'snabbdom/modules/props';
import listeners from 'snabbdom/modules/eventlisteners';
import h from 'snabbdom/h';
import { VNode } from 'snabbdom/vnode';

const patch = init([klass, attributes, properties, listeners]);

import { _, i18n } from './i18n';
import { aboutView } from './about';
import { settingsView, volumeSettings, soundThemeSettings, backgroundSettings } from './settings';
import { lobbyView } from './lobby';
import { roundView } from './round';
import { gamesView } from './games';
import { editorView } from './editor';
import { analysisView } from './analysis';
import { profileView } from './profile';
import { statsView } from './stats';
import { sound } from './sound';
import { getCookie } from './document';

const model = {};


export function view(el, model): VNode {
    const user = getCookie("user");
    if (user !== "") model["username"] = user;

    model["home"] = el.getAttribute("data-home");
    model["anon"] = el.getAttribute("data-anon");
    model["profileid"] = el.getAttribute("data-profile");
    model["title"] = el.getAttribute("data-title");
    model["variant"] = el.getAttribute("data-variant");
    model["chess960"] = el.getAttribute("data-chess960");
    model["rated"] = el.getAttribute("data-rated");
    model["level"] = el.getAttribute("data-level");
    model["username"] = user !== "" ? user : el.getAttribute("data-user");
    model["gameId"] = el.getAttribute("data-gameid");
    model["ply"] = el.getAttribute("data-ply");
    model["wplayer"] = el.getAttribute("data-wplayer");
    model["wtitle"] = el.getAttribute("data-wtitle");
    model["wrating"] = el.getAttribute("data-wrating");
    model["wrdiff"] = el.getAttribute("data-wrdiff");
    model["bplayer"] = el.getAttribute("data-bplayer");
    model["btitle"] = el.getAttribute("data-btitle");
    model["brating"] = el.getAttribute("data-brating");
    model["brdiff"] = el.getAttribute("data-brdiff");
    model["fen"] = el.getAttribute("data-fen");
    model["base"] = el.getAttribute("data-base");
    model["inc"] = el.getAttribute("data-inc");
    model["byo"] = el.getAttribute("data-byo");
    model["result"] = el.getAttribute("data-result");
    model["status"] = parseInt(el.getAttribute("data-status"));
    model["date"] = el.getAttribute("data-date");
    model["tv"] = el.getAttribute("data-view") === 'tv';

    switch (el.getAttribute("data-view")) {
    case 'about':
        return h('div#placeholder.main-wrapper', aboutView());
    case 'level8win':
    case 'profile':
        return h('main.profile', profileView(model));
    case 'tv':
    case 'round':
        return h('div#placeholder.main-wrapper', roundView(model));
    case 'analysis':
        return h('div#placeholder.main-wrapper', analysisView(model));
    case 'editor':
        return h('div#placeholder.main-wrapper', editorView(model));
    case 'games':
        return h('div#placeholder', gamesView(model));
    case 'thanks':
        return h('div#placeholder.main-wrapper', h('h2', _('Thank you for your support!')));
    case 'stats':
        return h('div#stats', statsView(model));
    default:
        return h('div#placeholder.main-wrapper', lobbyView(model));
    }
}

function isFunction(functionToCheck) {
  return functionToCheck && {}.toString.call(functionToCheck) === '[object Function]';
}

function debounce(func, wait) {
    var timeout;
    var waitFunc;

    return function() {
        if (isFunction(wait)) {
            waitFunc = wait;
        }
        else {
            waitFunc = function() { return wait };
        }

        var context = this, args = arguments;
        var later = function() {
            timeout = null;
            func.apply(context, args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, waitFunc());
    };
}

// reconnectFrequencySeconds doubles every retry
var reconnectFrequencySeconds = 1;
var evtSource;

var reconnectFunc = debounce(function() {
    setupEventSource();
    // Double every attempt to avoid overwhelming server
    reconnectFrequencySeconds *= 2;
    // Max out at ~1 minute as a compromise between user experience and server load
    if (reconnectFrequencySeconds >= 64) {
        reconnectFrequencySeconds = 64;
    }
}, function() { return reconnectFrequencySeconds * 1000 });

function setupEventSource() {
    evtSource = new EventSource(model["home"] + "/api/notify");
    console.log("new EventSource" + model["home"] + "/api/notify");
    evtSource.onmessage = function(e) {
        const message = JSON.parse(e.data);
        console.log(message);
        sound.socialNotify();
    };
    evtSource.onopen = function() {
      // Reset reconnect frequency upon successful connection
      reconnectFrequencySeconds = 1;
    };
    evtSource.onerror = function() {
      console.log("evtSource.onerror() retry", reconnectFrequencySeconds);
      evtSource.close();
      reconnectFunc();
    };
}

function start() {
    const placeholder = document.getElementById('placeholder');
    if (placeholder)
        patch(placeholder, view(el, model));

    (document.querySelector('.navbar-toggle') as HTMLElement).addEventListener('click', () => document.querySelectorAll('.topnav a').forEach(nav => nav.classList.toggle('navbar-show')));

    // Clicking outside settings panel closes it
    var settingsPanel : any = document.getElementById('settings-panel') as HTMLElement;
    settingsPanel = patch(settingsPanel, settingsView()).elm;
    const settings = document.getElementById('settings') as HTMLElement;
    document.addEventListener("click", ev => {
        if (!settingsPanel.contains(ev.target as HTMLElement))
            settings.style.display = 'none';
    });

    if (model['anon'] === 'False') window.onload = () => { setupEventSource();};
}

backgroundSettings.update();

// Always update sound theme before volume
// Updating sound theme requires reloading sound files,
// while updating volume does not
soundThemeSettings.update();
volumeSettings.update();

const el = document.getElementById('pychess-variants');
if (el instanceof Element) {
    const lang = el.getAttribute("data-lang");
    fetch('/static/lang/' + lang + '/LC_MESSAGES/client.json')
      .then((res) => res.json())
      .then((translation) => {
        i18n.loadJSON(translation, 'messages');
        i18n.setLocale(lang);
        console.log('Loaded translations for lang', lang);
        start();
      })
      .catch(() => {
        console.error('Could not load translations for lang', lang);
        i18n.setLocale('');
        start();
      });
}
