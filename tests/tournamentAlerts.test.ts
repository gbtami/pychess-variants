import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';

import { notifyTournamentStarting, redirectFirst } from '../client/tournamentAlerts';

jest.useFakeTimers();

const originalNotification = window.Notification;

class MockNotification {
    static permission: NotificationPermission = 'granted';
    static instances: MockNotification[] = [];

    onclick: (() => void) | null = null;

    constructor(
        readonly title: string,
        readonly options?: NotificationOptions,
    ) {
        MockNotification.instances.push(this);
    }
}

describe('tournament game redirect coordination', () => {
    beforeEach(() => {
        localStorage.clear();
        jest.spyOn(Math, 'random').mockReturnValue(0);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('lets a focused tournament tab redirect before a hidden duplicate', () => {
        const redirect = jest.fn();
        const hasFocus = jest.spyOn(document, 'hasFocus');

        hasFocus.mockReturnValueOnce(false);
        redirectFirst('game123', () => redirect('hidden'));

        hasFocus.mockReturnValueOnce(true);
        redirectFirst('game123', () => redirect('focused'));

        jest.advanceTimersByTime(10);
        expect(redirect).toHaveBeenCalledTimes(1);
        expect(redirect).toHaveBeenCalledWith('focused');

        jest.advanceTimersByTime(1500);
        expect(redirect).toHaveBeenCalledTimes(1);
    });

    test('redirects only one of several hidden tabs for the same game', () => {
        jest.spyOn(document, 'hasFocus').mockReturnValue(false);
        const redirect = jest.fn();

        redirectFirst('game123', () => redirect('first'));
        redirectFirst('game123', () => redirect('second'));

        jest.advanceTimersByTime(1000);

        expect(redirect).toHaveBeenCalledTimes(1);
        expect(redirect).toHaveBeenCalledWith('first');
    });

    test('does not let storage failures block the redirect', () => {
        jest.spyOn(document, 'hasFocus').mockReturnValue(true);
        jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
            throw new Error('storage unavailable');
        });
        jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new Error('storage unavailable');
        });
        const redirect = jest.fn();

        redirectFirst('game123', redirect);
        jest.advanceTimersByTime(10);

        expect(redirect).toHaveBeenCalledTimes(1);
    });
});

describe('tournament start browser notification coordination', () => {
    beforeEach(() => {
        localStorage.clear();
        MockNotification.instances = [];
        Object.defineProperty(window, 'Notification', { configurable: true, value: MockNotification });
        jest.spyOn(Math, 'random').mockReturnValue(0);
    });

    afterEach(() => {
        jest.restoreAllMocks();
        Object.defineProperty(window, 'Notification', { configurable: true, value: originalNotification });
    });

    test('shows only one notification across duplicate tournament tabs', () => {
        jest.spyOn(document, 'hasFocus').mockReturnValue(false);

        notifyTournamentStarting('The tournament is starting!');
        notifyTournamentStarting('The tournament is starting!');

        jest.advanceTimersByTime(10);

        expect(MockNotification.instances).toHaveLength(1);
        expect(MockNotification.instances[0].title).toBe('pychess.org');
        expect(MockNotification.instances[0].options?.body).toBe('The tournament is starting!');
    });

    test('does not notify while the tournament tab is focused', () => {
        jest.spyOn(document, 'hasFocus').mockReturnValue(true);

        notifyTournamentStarting('The tournament is starting!');
        jest.advanceTimersByTime(1000);

        expect(MockNotification.instances).toHaveLength(0);
    });
});
