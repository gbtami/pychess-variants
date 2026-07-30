import { expect, test } from '@jest/globals';
import { VNode } from 'snabbdom';

import { myVariantsView } from '../client/myVariants';
import { PyChessModel } from '../client/types';

function findVNode(vnode: VNode, selector: string): VNode | undefined {
    if (vnode.sel === selector) return vnode;
    for (const child of vnode.children ?? []) {
        if (typeof child === 'object' && child !== null) {
            const found = findVNode(child as VNode, selector);
            if (found) return found;
        }
    }
    return undefined;
}

test('non-admin variant owners see the advanced appearance group', () => {
    const model = {
        admin: false,
        anon: 'False',
        username: 'alice',
        home: '',
        assetURL: '',
    } as PyChessModel;

    const root = myVariantsView(model)[0];
    const appearance = findVNode(root, 'fieldset.catalogued-appearance-fields.catalogued-field-full');

    expect(appearance).toBeDefined();
    expect(findVNode(appearance!, 'legend')?.text).toBe('Advanced appearance');
    expect(findVNode(appearance!, 'select#catalogued-piece-family-override')).toBeDefined();
    expect(findVNode(appearance!, 'select#catalogued-board-family-override')).toBeDefined();
});
