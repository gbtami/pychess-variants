import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';

import { initSearchBarDismissal } from '../client/searchBar';

jest.useFakeTimers();

let cleanup: (() => void) | undefined;

function setupSearchBar() {
    document.body.innerHTML = `
        <form class="search-bar active">
            <button class="search-icon" type="button">Search</button>
            <input id="search-input" type="text">
            <div id="ac-result"><a href="/@/tester">tester</a></div>
        </form>
        <button id="outside" type="button">Outside</button>
    `;

    const searchBar = document.querySelector('.search-bar') as HTMLElement;
    const searchInput = document.querySelector('#search-input') as HTMLInputElement;
    const resultLink = document.querySelector('#ac-result a') as HTMLAnchorElement;
    const outside = document.querySelector('#outside') as HTMLButtonElement;
    cleanup = initSearchBarDismissal(searchBar);

    return { searchBar, searchInput, resultLink, outside };
}

beforeEach(() => {
    document.body.innerHTML = '';
});

afterEach(() => {
    cleanup?.();
    cleanup = undefined;
    jest.clearAllTimers();
    document.body.innerHTML = '';
});

describe('header user search dismissal', () => {
    test('stays open for clicks inside the search bar and closes for outside clicks', () => {
        const { searchBar, resultLink, outside } = setupSearchBar();

        resultLink.addEventListener('click', event => event.preventDefault(), { once: true });
        resultLink.click();
        expect(searchBar.classList.contains('active')).toBe(true);

        outside.click();
        expect(searchBar.classList.contains('active')).toBe(false);
    });

    test('stays open when focus moves to an autocomplete result', () => {
        const { searchBar, searchInput, resultLink } = setupSearchBar();

        searchInput.focus();
        resultLink.focus();
        jest.runOnlyPendingTimers();

        expect(searchBar.classList.contains('active')).toBe(true);
    });

    test('closes when the search input loses focus outside the search bar', () => {
        const { searchBar, searchInput, outside } = setupSearchBar();

        searchInput.focus();
        outside.focus();
        jest.runOnlyPendingTimers();

        expect(searchBar.classList.contains('active')).toBe(false);
    });
});
