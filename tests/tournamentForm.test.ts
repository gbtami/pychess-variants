import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';

import { initTournamentForm } from '../client/tournamentForm';

jest.useFakeTimers();

function setupTournamentForm(): void {
    document.body.innerHTML = `
        <form id="tournament-form" method="post" action="/tournaments/new">
            <select id="form3-system"><option value="0">Arena</option><option value="1">Round-Robin</option></select>
            <input id="form3-rated" type="checkbox" checked>
            <select id="form3-variant"><option value="chess">Chess</option></select>
            <span id="form3-system-help"></span>
            <div id="form3-rounds-wrap"></div>
            <span id="form3-rounds-label"></span>
            <select id="form3-rounds"><option value="0">0</option><option value="5">5</option></select>
            <span id="form3-rounds-help"></span>
            <div id="form3-rrMaxPlayers-wrap"></div>
            <select id="form3-rrMaxPlayers"><option value="0">0</option><option value="10">10</option></select>
            <span id="form3-rrMaxPlayers-help"></span>
            <div id="form3-rrApproval-wrap"></div>
            <div id="form3-roundInterval-wrap"></div>
            <select id="form3-roundInterval"><option value="auto">Automatic</option></select>
            <span id="form3-roundInterval-help"></span>
            <span id="form3-minutes-label"></span>
            <span id="form3-minutes-help"></span>
            <select id="form3-minutes"><option value="45">45</option><option value="90">90</option></select>
            <select id="form3-waitMinutes"><option value="5">5</option></select>
            <input id="startDate">
            <div id="form3-endDate-wrap"><input id="endDate"></div>
            <div id="form3-entry-wrap-a"></div>
            <div id="form3-entry-wrap-b"></div>
            <div id="form3-entry-wrap-c"></div>
            <div id="form3-swiss-pairings-wrap-a"></div>
            <select id="form3-entryMinRatedGames"><option value="0">0</option></select>
            <select id="form3-entryMinRating"><option value="0">0</option></select>
            <select id="form3-entryMaxRating"><option value="0">0</option></select>
            <select id="form3-entryMinAccountAgeDays"><option value="0">0</option></select>
            <textarea id="form3-forbiddenPairings"></textarea>
            <textarea id="form3-manualPairings"></textarea>
            <div id="tour-faq-arena"></div>
            <div id="tour-faq-rr"></div>
            <div id="tour-faq-swiss"></div>
        </form>
    `;
}

function changeValue(element: HTMLInputElement | HTMLSelectElement, value: string): void {
    element.value = value;
    element.dispatchEvent(new Event('change'));
}

beforeEach(() => {
    jest.setSystemTime(new Date('2026-08-06T10:00:00.000Z'));
    setupTournamentForm();
});

afterEach(() => {
    document.body.innerHTML = '';
});

describe('tournament schedule form', () => {
    test('keeps an Arena duration when the start date is chosen afterward', () => {
        initTournamentForm();

        const minutes = document.querySelector('#form3-minutes') as HTMLSelectElement;
        changeValue(minutes, '90');

        const startDate = document.querySelector('#startDate') as HTMLInputElement;
        changeValue(startDate, '2026-08-06T12:00:00.000Z');

        expect(minutes.value).toBe('90');
        expect((document.querySelector('#endDate') as HTMLInputElement).value).toBe('');
    });
});
