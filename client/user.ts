import { init } from 'snabbdom';
import klass from 'snabbdom/modules/class';
import attributes from 'snabbdom/modules/attributes';
import properties from 'snabbdom/modules/props';
import listeners from 'snabbdom/modules/eventlisteners';

const patch = init([klass, attributes, properties, listeners]);

import h from 'snabbdom/h';

export function renderUsername(username) {
    var oldVNode = document.getElementById('username');
    if (oldVNode instanceof Element) {
        oldVNode.innerHTML = '';
        patch(oldVNode as HTMLElement, h('div#username', h('a.nav-link', {attrs: {href: '/@/' + username}}, username)));
    };
}
