import { describe, expect, jest, test } from '@jest/globals';

import { Clock } from '../client/clock';

describe('Clock byoyomi synchronization', () => {
    test('restores main-time state when takeback restores all periods', () => {
        const clock = new Clock(1, 5, 3, document.createElement('div'), 'clock0', false);
        clock.overtime = true;
        clock.byoyomiPeriod = 2;
        clock.ticks.fill(true);

        clock.syncByoyomiPeriod(3);

        expect(clock.byoyomiPeriod).toBe(3);
        expect(clock.overtime).toBe(false);
        expect(clock.ticks).toEqual(Array(10).fill(false));

        clock.duration = 2000;
        clock.running = true;
        clock.startTime = 1000;
        const now = jest.spyOn(Date, 'now').mockReturnValue(1500);
        clock.pause(true);
        now.mockRestore();

        expect(clock.duration).toBe(1500);
    });

    test('recognizes an authoritative reduced period count as overtime', () => {
        const clock = new Clock(1, 5, 3, document.createElement('div'), 'clock0', false);

        clock.syncByoyomiPeriod(2);

        expect(clock.byoyomiPeriod).toBe(2);
        expect(clock.overtime).toBe(true);
    });
});
