import { describe, expect, jest, test } from '@jest/globals';

import type { Step } from '../client/messages';
import { gamebookPathIsMainline, StudyGamebookEditor } from '../client/study/studyGamebookEdit';
import { analysisTreeFromStudy, type StudyTreeNodeDto } from '../client/study/studyTree';

function rootStep(turnColor: 'white' | 'black' = 'white'): Step {
    return {
        fen: `start ${turnColor === 'white' ? 'w' : 'b'} - - 0 1`,
        check: false,
        turnColor,
        san: '',
        sanSAN: '',
    };
}

function node(
    id: string,
    parentId: string | null,
    order: number,
    san: string,
    turnColor: 'white' | 'black',
    gamebook?: { hint?: string; deviation?: string },
): StudyTreeNodeDto {
    return {
        id,
        parentId,
        order,
        move: san.toLowerCase(),
        fen: `${id} ${turnColor === 'white' ? 'w' : 'b'} - - 0 1`,
        turnColor,
        check: false,
        san,
        sanSAN: san,
        ...(gamebook ? { gamebook } : {}),
    };
}

function fixture() {
    const tree = analysisTreeFromStudy(rootStep(), {
        rootGamebook: { hint: 'Root hint' },
        nodes: [
            node('StudyNode1', null, 0, 'e4', 'black', { deviation: 'Fallback after e4' }),
            node('StudyNode2', 'StudyNode1', 0, 'e5', 'white', { hint: 'Find Nf3' }),
            node('StudyNode3', 'StudyNode2', 0, 'Nf3', 'black'),
            node('StudyNode4', null, 1, 'd4', 'black'),
        ],
    });
    return tree;
}

function render(path = '', preview = false) {
    const root = document.createElement('div');
    const saveGamebook = jest.fn();
    const editComment = jest.fn();
    const togglePreview = jest.fn();
    const editor = new StudyGamebookEditor(root, { saveGamebook, editComment, togglePreview });
    const tree = fixture();
    editor.update({ tree, path, orientation: 'white', preview });
    return { root, editor, tree, saveGamebook, editComment, togglePreview };
}

describe('Study gamebook author editor', () => {
    test('shows learner guidance, keyboard labels and saves hint for the captured position', () => {
        const { root, editor, saveGamebook } = render();

        expect(root.textContent).toContain('Interactive lesson script');
        expect(root.querySelector('.study-gamebook-edit__keys')?.getAttribute('aria-label')).toContain(
            'left and right arrows',
        );
        const hint = root.querySelector<HTMLTextAreaElement>('textarea[aria-label="Optional hint"]');
        expect(hint?.value).toBe('Root hint');
        expect(root.textContent).toContain('Help the learner find the initial move');

        hint!.value = 'Look at the center';
        hint!.dispatchEvent(new Event('input', { bubbles: true }));
        editor.update({ tree: fixture(), path: 'StudyNode1', orientation: 'white', preview: false });
        expect(saveGamebook).toHaveBeenCalledWith('hint', 'Look at the center', '');
    });

    test('places fallback deviation on the intended child and links comments for correct feedback', () => {
        const { root, editComment } = render('StudyNode1');

        expect(root.textContent).toContain('learner just played the expected move');
        expect(root.querySelector<HTMLTextAreaElement>('textarea[aria-label="Fallback wrong-answer explanation"]')?.value).toBe(
            'Fallback after e4',
        );
        expect(root.textContent).toContain('variations from the previous position');
        root.querySelector<HTMLButtonElement>('.study-gamebook-edit__comment')?.click();
        expect(editComment).toHaveBeenCalledTimes(1);
    });

    test('uses ordinary comments for a specific wrong-answer variation', () => {
        const { root } = render('StudyNode4');

        expect(root.textContent).toContain('wrong-answer variation');
        expect(root.textContent).toContain('Explain why this specific move is wrong');
        expect(root.querySelector('textarea')).toBeNull();
    });

    test('warns for an empty script and for a script ending after an opponent move', () => {
        const emptyRoot = document.createElement('div');
        const emptyEditor = new StudyGamebookEditor(emptyRoot, {
            editComment: () => {},
            saveGamebook: () => {},
            togglePreview: () => {},
        });
        emptyEditor.update({ tree: analysisTreeFromStudy(rootStep(), { nodes: [] }), path: '', orientation: 'white', preview: false });
        expect(emptyRoot.textContent).toContain('This lesson has no moves yet');
        expect(emptyRoot.textContent).toContain('No expected learner continuation');

        const oneMove = analysisTreeFromStudy(rootStep(), {
            nodes: [node('StudyNode1', null, 0, 'e4', 'black')],
        });
        emptyEditor.update({ tree: oneMove, path: 'StudyNode1', orientation: 'black', preview: false });
        expect(emptyRoot.textContent).toContain('This lesson ends after an opponent move');
    });

    test('forced-variation display flags never redefine the authored correct script', () => {
        const { root, tree } = render('StudyNode1');
        const expected = tree.byPath.get('StudyNode1')!;
        expected.forceVariation = true;

        expect(gamebookPathIsMainline(tree, expected.path)).toBe(true);
        const editor = new StudyGamebookEditor(root, {
            editComment: () => {},
            saveGamebook: () => {},
            togglePreview: () => {},
        });
        editor.update({ tree, path: expected.path, orientation: 'white', preview: false });
        expect(root.textContent).not.toContain('wrong-answer variation');
        expect(root.textContent).toContain('learner just played the expected move');
    });

    test('Preview is explicit and preview state promises unsaved local attempts', () => {
        const { root, togglePreview } = render();
        root.querySelector<HTMLButtonElement>('.study-gamebook-edit__preview')?.click();
        expect(togglePreview).toHaveBeenCalledTimes(1);

        const preview = render('', true);
        expect(preview.root.textContent).toContain('Preview moves are not saved');
        expect(preview.root.textContent).toContain('Return to lesson editor');
    });
});
