import { init } from 'snabbdom';
import klass from 'snabbdom/modules/class';
import attributes from 'snabbdom/modules/attributes';
import properties from 'snabbdom/modules/props';
import listeners from 'snabbdom/modules/eventlisteners';
import h from 'snabbdom/h';
import { VNode } from 'snabbdom/vnode';

const patch = init([klass, attributes, properties, listeners]);

import { aboutView } from './about';
import { lobbyView } from './lobby';
import { roundView } from './round';
import { gamesView } from './games';
import { analysisView } from './analysis';
import { playersView } from './players';
import { profileView } from './profile';

const model = {home: "", username: "", anon: "", variant: "", gameId: 0, wplayer: "", bplayer: "", fen: "", base: "", inc: "", seeks: [], tv: "", profileid: "", status: ""};

var getCookie = function(name) {
    var cookies = document.cookie.split(';');
    for(var i=0 ; i < cookies.length ; ++i) {
        var pair = cookies[i].trim().split('=');
        if(pair[0] == name)
            return pair[1];
    }
    return "";
}

export function view(el, model): VNode {
    const user = getCookie("user");
    if (user !== "") model["username"] = user;

    model["home"] = el.getAttribute("data-home");
    model["anon"] = el.getAttribute("data-anon");
    model["profileid"] = el.getAttribute("data-profile");
    model["variant"] = el.getAttribute("data-variant");
    model["chess960"] = el.getAttribute("data-chess960");
    model["rated"] = el.getAttribute("data-rated");
    model["level"] = el.getAttribute("data-level");
    model["username"] = user !== "" ? user : el.getAttribute("data-user");
    model["gameId"] = el.getAttribute("data-gameid");
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
    model["result"] = el.getAttribute("data-result");
    model["status"] = parseInt(el.getAttribute("data-status"));
    model["date"] = el.getAttribute("data-date");
    model["tv"] = el.getAttribute("data-view") === 'tv';

    switch (el.getAttribute("data-view")) {
    case 'about':
        return h('div#placeholder.main-wrapper', aboutView(model));
    case 'howtoplay':
        return h('iframe', {props: {src: model["home"] + "/static/docs/variants.html", height: "100%", width:"100%", seamless: ""}});
    case 'players':
        return h('main.players', playersView(model));
    case 'level8win':
    case 'profile':
        return h('main.profile', profileView(model));
    case 'tv':
    case 'round':
        return h('div#placeholder.main-wrapper', roundView(model));
    case 'analysis':
        return h('div#placeholder.main-wrapper', analysisView(model));
    case 'games':
        return h('div#placeholder', gamesView(model));
    case 'thanks':
        return h('div#placeholder.main-wrapper', h('h2', 'Thank you for your support!'));
    default:
        return h('div#placeholder.main-wrapper', lobbyView(model));
    }
}

const el = document.getElementById('pychess-variants');
if (el instanceof Element) {
    patch(document.getElementById('placeholder') as HTMLElement, view(el, model));
}
