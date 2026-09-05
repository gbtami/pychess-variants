import type { MsgBoard } from '../messages';
import type { StudyPageModel } from '../types';

export interface StudyChapterSnapshot {
    study: StudyPageModel;
    board: MsgBoard;
    cataloguedVariants: unknown[];
}

// Keep navigation independent of the board runtime, including failed saves and
// competing clicks. Like lila, load chapter data while the page shell stays put.
export class StudyChapterNavigation {
    private request = 0;
    private abort?: AbortController;

    constructor(
        private readonly options: {
            studyId: string;
            currentChapter: () => string;
            flush: () => Promise<void>;
            apply: (snapshot: StudyChapterSnapshot, isCurrent: () => boolean) => Promise<void>;
            busy: (busy: boolean) => void;
            error: (error: unknown) => void;
        },
    ) {}

    async go(chapterId: string, history: 'push' | 'pop' = 'push'): Promise<void> {
        const request = ++this.request;
        this.abort?.abort();
        this.abort = new AbortController();
        const signal = this.abort.signal;
        if (chapterId === this.options.currentChapter()) {
            this.options.busy(false);
            return;
        }
        this.options.busy(true);
        try {
            await this.options.flush();
            if (request !== this.request) return;
            const response = await fetch(`/study/${this.options.studyId}/${chapterId}`, {
                headers: { Accept: 'application/json' },
                signal,
            });
            if (!response.ok) throw new Error(`Chapter could not be loaded (${response.status}).`);
            const data = (await response.json()) as StudyChapterSnapshot;
            if (
                data.study?.id !== this.options.studyId ||
                data.study.chapter?.id !== chapterId ||
                !Array.isArray(data.board?.steps) ||
                !Array.isArray(data.cataloguedVariants)
            )
                throw new Error('Invalid chapter data.');
            if (request !== this.request) return;
            await this.options.apply(data, () => request === this.request);
            if (request !== this.request) return;
            if (history === 'push') window.history.pushState(null, '', `/study/${this.options.studyId}/${chapterId}`);
        } catch (error) {
            if (request !== this.request) return;
            if (history === 'pop')
                window.history.replaceState(
                    null,
                    '',
                    `/study/${this.options.studyId}/${this.options.currentChapter()}`,
                );
            this.options.error(error);
        } finally {
            if (request === this.request) this.options.busy(false);
        }
    }
}
