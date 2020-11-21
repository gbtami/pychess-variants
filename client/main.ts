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
import { settingsView } from './settingsView';
import { lobbyView } from './lobby';
import { roundView } from './round';
import { inviteView } from './invite';
import { renderGames } from './games';
import { editorView } from './editor';
import { analysisView } from './analysis';
import { profileView } from './profile';
import { pasteView } from './paste';
import { statsView } from './stats';
import { sound, volumeSettings, soundThemeSettings } from './sound';
import { debounce, getCookie } from './document';
import { backgroundSettings } from './background';

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
        return h('div#main-wrap', aboutView());
    case 'level8win':
    case 'profile':
        return h('div#profile', profileView(model));
    case 'tv':
    case 'round':
        return h('div#main-wrap', [h('main.round', roundView(model))]);
    case 'analysis':
        return h('div#main-wrap', [h('main.round', analysisView(model))]);
    case 'invite':
        return h('div#main-wrap', inviteView(model));
    case 'editor':
        return h('div#main-wrap', [h('main.round', editorView(model))]);
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

// reconnectFrequencySeconds doubles every retry
let reconnectFrequencySeconds = 1;
let evtSource;

const reconnectFunc = debounce(
    () => {
        setupEventSource();
        // Double every attempt to avoid overwhelming server
        reconnectFrequencySeconds *= 2;
        // Max out at ~1 minute as a compromise between user experience and server load
        if (reconnectFrequencySeconds >= 64) {
            reconnectFrequencySeconds = 64;
        }
    },
    reconnectFrequencySeconds * 1000
);

function setupEventSource() {
    evtSource = new EventSource(model["home"] + "/api/notify");
    console.log("new EventSource" + model["home"] + "/api/notify");
    evtSource.onmessage = e => {
        const message = JSON.parse(e.data);
        console.log(message);
        sound.socialNotify();
    };
    evtSource.onopen = () => {
        // Reset reconnect frequency upon successful connection
        reconnectFrequencySeconds = 1;
    };
    evtSource.onerror = () => {
        console.log("evtSource.onerror() retry", reconnectFrequencySeconds);
        evtSource.close();
        reconnectFunc();
    };
}

function start() {
    const placeholder = document.getElementById('placeholder');
    if (placeholder)
        patch(placeholder, view(el, model));

    (document.querySelector('.hamburger') as HTMLElement).addEventListener('click', () => {
        document.querySelectorAll('.topnav a').forEach(nav => nav.classList.toggle('navbar-show'));
        (document.querySelector('.hamburger') as HTMLElement).classList.toggle('is-active');
        }
    );

    // Clicking outside settings panel closes it
    const settingsPanel = patch(document.getElementById('settings-panel') as HTMLElement, settingsView()).elm as HTMLElement;
    const settings = document.getElementById('settings') as HTMLElement;
    document.addEventListener("click", function(event) {
        if (!settingsPanel.contains(event.target as Node))
            settings.style.display = 'none';
    });

    if (model['anon'] === 'False') setupEventSource();
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
      .then(res => res.json())
      .then(translation => {
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
