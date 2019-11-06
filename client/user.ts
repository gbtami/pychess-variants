import { init } from 'snabbdom';
import klass from 'snabbdom/modules/class';
import attributes from 'snabbdom/modules/attributes';
import properties from 'snabbdom/modules/props';
import listeners from 'snabbdom/modules/eventlisteners';

const patch = init([klass, attributes, properties, listeners]);

import h from 'snabbdom/h';

// TODO: create logout button when logged in
/*
function login(home) {
    console.log("LOGIN WITH LICHESS");
    window.location.assign(home + '/login');
};
*/
export function renderUsername(home, username) {
    console.log("renderUsername()", username, home);
    var oldVNode = document.getElementById('username');
    if (oldVNode instanceof Element) {
        oldVNode.innerHTML = '';
        patch(oldVNode as HTMLElement, h('div#username', h('a.nav-link', {attrs: {href: '/@/' + username}}, username)));
    };
/*
    // if username is not a logged in name login else logout button
    var oldVNode = document.getElementById('login');
    if (oldVNode instanceof Element) {
        oldVNode.innerHTML = '';
        patch(oldVNode as HTMLElement, h('button', { on: { click: () => login(home) }, props: {title: 'Login with Lichess'} }, [h('i', {class: {"icon": true, "icon-sign-in": true} } ), ]));
    };
*/
}
