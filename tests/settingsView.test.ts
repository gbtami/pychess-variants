import { patch } from '@/document';
import { settingsView } from '@/settingsView';

test('logged-in settings menu links to the current users following page', () => {
    document.body.innerHTML =
        '<div id="pychess-variants" data-anon="False" data-username="Alice Smith"></div><div id="root"></div>';

    patch(document.getElementById('root')!, settingsView('chess'));

    const button = document.querySelector<HTMLButtonElement>('#btn-following');
    expect(button).not.toBeNull();
    expect(button?.textContent).toBe('Following');
});

test('anonymous settings menu does not show the following shortcut', () => {
    document.body.innerHTML =
        '<div id="pychess-variants" data-anon="True" data-username=""></div><div id="root"></div>';

    patch(document.getElementById('root')!, settingsView('chess'));

    expect(document.querySelector('#btn-following')).toBeNull();
});
