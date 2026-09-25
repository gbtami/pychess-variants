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

    test('hydrates completed chapters and persists new completion or improved move-count attempts', () => {
        const saved: Array<[string, number | undefined]> = [];
        const progress = new StudyPracticeProgress(new MemoryStorage(), ['chapter-1'], (chapterId, bestMoves) =>
            saved.push([chapterId, bestMoves]),
        );

        expect(progress.isComplete('chapter-1')).toBe(true);
        expect(progress.complete('chapter-1')).toBe(false);
        expect(saved).toEqual([]);

        expect(progress.complete('chapter-2')).toBe(true);
        expect(progress.isComplete('chapter-2')).toBe(true);
        expect(saved).toEqual([['chapter-2', undefined]]);

        expect(progress.complete('chapter-2', 7)).toBe(false);
        expect(saved).toEqual([
            ['chapter-2', undefined],
            ['chapter-2', 7],
        ]);
    });

    test('defaults auto-next on and remembers the browser preference', () => {
        const storage = new MemoryStorage();
        const first = new StudyPracticeProgress(storage);

        expect(first.autoNext).toBe(true);
        first.autoNext = false;

        expect(new StudyPracticeProgress(storage).autoNext).toBe(false);
    });
});
