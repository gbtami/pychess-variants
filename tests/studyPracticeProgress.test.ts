import { describe, expect, test } from '@jest/globals';

import { StudyPracticeProgress } from '../client/study/studyPracticeProgress';

class MemoryStorage {
    private readonly values = new Map<string, string>();

    getItem(key: string): string | null {
        return this.values.get(key) ?? null;
    }

    setItem(key: string, value: string): void {
        this.values.set(key, value);
    }
}

describe('Practice browser-session progress', () => {
    test('tracks chapter completion idempotently for the current browser session', () => {
        const progress = new StudyPracticeProgress(new MemoryStorage());

        expect(progress.isComplete('chapter-1')).toBe(false);
        expect(progress.complete('chapter-1')).toBe(true);
        expect(progress.complete('chapter-1')).toBe(false);
        expect(progress.isComplete('chapter-1')).toBe(true);
        expect(progress.isComplete('chapter-2')).toBe(false);
    });

    test('defaults auto-next on and remembers the browser preference', () => {
        const storage = new MemoryStorage();
        const first = new StudyPracticeProgress(storage);

        expect(first.autoNext).toBe(true);
        first.autoNext = false;

        expect(new StudyPracticeProgress(storage).autoNext).toBe(false);
    });
});
