const PRACTICE_AUTO_NEXT_KEY = 'practice_autoNext';

/**
 * Browser-session Practice state.
 *
 * P5 deliberately keeps chapter completion in memory only. P6 will hydrate and
 * persist this state for authenticated users, while the auto-next preference is a
 * local browser setting just like lichess' Practice toggle.
 */
export class StudyPracticeProgress {
    private readonly completed = new Set<string>();
    private _autoNext: boolean;

    constructor(private readonly storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage) {
        const stored = this.storage.getItem(PRACTICE_AUTO_NEXT_KEY);
        this._autoNext = stored === null ? true : stored === 'true';
    }

    isComplete(chapterId: string): boolean {
        return this.completed.has(chapterId);
    }

    complete(chapterId: string): boolean {
        const size = this.completed.size;
        this.completed.add(chapterId);
        return this.completed.size !== size;
    }

    get autoNext(): boolean {
        return this._autoNext;
    }

    set autoNext(value: boolean) {
        this._autoNext = value;
        this.storage.setItem(PRACTICE_AUTO_NEXT_KEY, String(value));
    }
}
