const PRACTICE_AUTO_NEXT_KEY = 'practice_autoNext';

/**
 * Practice progress visible to the current learner runtime.
 *
 * Authenticated completion is hydrated from Mongo by the Practice route and
 * persisted through the callback. Anonymous learners keep the same in-memory
 * behavior without creating server progress.
 */
export class StudyPracticeProgress {
    private readonly completed: Set<string>;
    private _autoNext: boolean;

    constructor(
        private readonly storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage,
        completedChapterIds: Iterable<string> = [],
        private readonly onComplete?: (chapterId: string, bestMoves?: number) => void,
    ) {
        this.completed = new Set(completedChapterIds);
        const stored = this.storage.getItem(PRACTICE_AUTO_NEXT_KEY);
        this._autoNext = stored === null ? true : stored === 'true';
    }

    isComplete(chapterId: string): boolean {
        return this.completed.has(chapterId);
    }

    complete(chapterId: string, bestMoves?: number): boolean {
        const size = this.completed.size;
        this.completed.add(chapterId);
        const changed = this.completed.size !== size;
        if (changed || bestMoves !== undefined) this.onComplete?.(chapterId, bestMoves);
        return changed;
    }

    get autoNext(): boolean {
        return this._autoNext;
    }

    set autoNext(value: boolean) {
        this._autoNext = value;
        this.storage.setItem(PRACTICE_AUTO_NEXT_KEY, String(value));
    }
}
