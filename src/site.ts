import h from 'snabbdom/h';
import { VNode } from 'snabbdom/vnode';

import { lobbyView } from './lobby';
import { roundView } from './round';

export const ACCEPT = Symbol("Accept");
export const BACK = Symbol('Back');

// model : {home: "", username: "", variant: "", gameId: 0, wplayer: "", bplayer: "", base: "", inc: "", seeks: [seek], tv: ""}

var getCookie = function(name) {
    var cookies = document.cookie.split(';');
    for(var i=0 ; i < cookies.length ; ++i) {
        var pair = cookies[i].trim().split('=');
        if(pair[0] == name)
            return pair[1];
    }
    return "";
}

export function view(model, handler): VNode {
    // console.log("site.view() model=", model)
    // http://stackoverflow.com/questions/1397329/how-to-remove-the-hash-from-window-location-with-javascript-without-page-refresh/5298684#5298684
    console.log("site.ts document.title=", document.title);
    console.log("site.ts window.location=", window.location);
    window.history.pushState({}, document.title, "/");
    const user = getCookie("user");
    if (user !== "") model["username"] = user;

    var el = document.getElementById('pychess-variants');
    if (el instanceof Element && el.hasAttribute("data-home")) {
        model["home"] = el.getAttribute("data-home");
    }
    if (el instanceof Element && el.hasAttribute("data-variant")) {
        const variant = el.getAttribute("data-variant");
        console.log("site.view() data-variant=", variant);
        if (variant) {
            model["variant"] = variant;
            model["username"] = user !== "" ? user : el.getAttribute("data-username");
            model["gameId"] = el.getAttribute("data-gameid");
            model["wplayer"] = el.getAttribute("data-wplayer");
            model["bplayer"] = el.getAttribute("data-bplayer");
            model["fen"] = el.getAttribute("data-fen");
            model["base"] = el.getAttribute("data-base");
            model["inc"] = el.getAttribute("data-inc");
            model["tv"] = el.getAttribute("data-tv");
        };
    }

    return h('div#placeholder.main-wrapper', model.variant ? roundView(model, handler) : lobbyView(model, handler));
}

function init() {
    return {home: "", username: "", variant: "", gameId: 0, wplayer: "", bplayer: "", fen: "", base: "", inc: "", seeks: [], tv: ""};
}

function update(model, action) {
    return action.type === ACCEPT ?
        {home: model["home"], username: model["username"], variant: model["variant"], gameId: model["gameId"], wplayer: model["wplayer"], bplayer: model["bplayer"], fen: model["fen"], base: model["base"], inc: model["inc"], seeks: [], tv: model["tv"]}
            : action.type === BACK ?
                {home: model["home"], username: model["username"], variant: "", gameId: 0, wplayer: "", bplayer: "", fen: "", base: "", inc: "", seeks: [], tv: ""}
                : model;
}

export default { view, init, update, actions: { ACCEPT, BACK } }
