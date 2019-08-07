import { init } from 'snabbdom';
import klass from 'snabbdom/modules/class';
import attributes from 'snabbdom/modules/attributes';
import properties from 'snabbdom/modules/props';
import listeners from 'snabbdom/modules/eventlisteners';
import h from 'snabbdom/h';
import { VNode } from 'snabbdom/vnode';

const patch = init([klass, attributes, properties, listeners]);

import { lobbyView } from './lobby';
import { roundView } from './round';
import { playersView } from './players';
import { profileView } from './profile';
import { aboutView } from './about';

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
    model["username"] = user !== "" ? user : el.getAttribute("data-user");
    model["gameId"] = el.getAttribute("data-gameid");
    model["wplayer"] = el.getAttribute("data-wplayer");
    model["wtitle"] = el.getAttribute("data-wtitle");
    model["bplayer"] = el.getAttribute("data-bplayer");
    model["btitle"] = el.getAttribute("data-btitle");
    model["fen"] = el.getAttribute("data-fen");
    model["base"] = el.getAttribute("data-base");
    model["inc"] = el.getAttribute("data-inc");
    model["result"] = el.getAttribute("data-result");
    model["status"] = el.getAttribute("data-status");
    model["date"] = el.getAttribute("data-date");
    model["tv"] = el.getAttribute("data-view") === 'tv';

    switch (el.getAttribute("data-view")) {
    case 'about':
        return h('div#placeholder.about-wrapper', aboutView(model));
    case 'players':
        return h('div#placeholder.players-wrapper', playersView(model));
    case 'profile':
        return h('div#placeholder.profile-wrapper', profileView(model));
    case 'tv':
    case 'round':
        return h('div#placeholder.main-wrapper', roundView(model));
    default:
        return h('div#placeholder.main-wrapper', lobbyView(model));
    }
}

const el = document.getElementById('pychess-variants');
if (el instanceof Element) {
    patch(document.getElementById('placeholder') as HTMLElement, view(el, model));
}
