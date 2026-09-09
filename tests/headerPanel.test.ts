import { describe, expect, test } from '@jest/globals';
import { h } from 'snabbdom';

import { hydrateHeaderPanel } from '../client/headerPanel';

describe('hydrateHeaderPanel', () => {
    test('keeps a server-rendered header button while attaching the client view', () => {
        document.body.innerHTML = `
            <div id="settings-panel">
                <button id="btn-settings" aria-label="Settings"><div class="icon icon-cog"></div></button>
                <div id="settings"></div>
            </div>
        `;
        const panel = document.getElementById('settings-panel') as HTMLElement;
        const serverButton = document.getElementById('btn-settings');
        const serverIcon = document.querySelector('#btn-settings .icon');

        const hydrated = hydrateHeaderPanel(
            panel,
            h('div#settings-panel', [
                h('button#btn-settings', { attrs: { 'aria-label': 'Settings' } }, [h('div.icon.icon-cog')]),
                h('div#settings', [h('div#settings-main', 'Loaded')]),
            ]),
        );

        expect(hydrated).toBe(panel);
        expect(document.getElementById('btn-settings')).toBe(serverButton);
        expect(document.querySelector('#btn-settings .icon')).toBe(serverIcon);
        expect(document.querySelectorAll('#btn-settings')).toHaveLength(1);
        expect(document.getElementById('settings-main')?.textContent).toBe('Loaded');
    });
});
