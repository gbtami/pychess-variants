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
import { analysisView, embedView } from './analysis';
import { profileView } from './profile';
import { tournamentView } from './tournament';
import { pasteView } from './paste';
import { statsView } from './stats';
import { volumeSettings, soundThemeSettings } from './sound';
import { getCookie } from './document';
import { backgroundSettings } from './background';

// redirect to correct URL except Heroku preview apps
if (window.location.href.includes('heroku') && !window.location.href.includes('-pr-')) {
    window.location.assign('https://www.pychess.org/');
}

export const model = {};

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
    model["inviter"] = el.getAttribute("data-inviter");
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
    model["embed"] = el.getAttribute("data-view") === 'embed';

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
        return h('div#main-wrap', tournamentView(model));
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
    if (placeholder)
        patch(placeholder, view(el, model));

    if (model["embed"]) return;

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
}

window.addEventListener('resize', () => document.body.dispatchEvent(new Event('chessground.resize')));

backgroundSettings.update();

const el = document.getElementById('pychess-variants');
if (el instanceof Element) {
    model["asset-url"] = el.getAttribute("data-asset-url");

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
        i18n.setLocale(lang);
        // console.log('Loaded translations for lang', lang);
        start();
      })
      .catch(() => {
        console.error('Could not load translations for lang', lang);
        i18n.setLocale('');
        start();
      });
}
