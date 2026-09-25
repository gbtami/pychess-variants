import { describe, expect, jest, test } from '@jest/globals';

import type { Step } from '../client/messages';
import { StudyGamebookEditor } from '../client/study/studyGamebookEdit';
import { gamebookPathIsMainline } from '../client/study/studyGamebook';
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
    return analysisTreeFromStudy(rootStep(), {
        rootGamebook: { hint: 'Root hint' },
        nodes: [
            node('StudyNode1', null, 0, 'e4', 'black', { deviation: 'Fallback after e4' }),
            node('StudyNode2', 'StudyNode1', 0, 'e5', 'white', { hint: 'Find Nf3' }),
            node('StudyNode3', 'StudyNode2', 0, 'Nf3', 'black'),
            node('StudyNode4', null, 1, 'd4', 'black'),
        ],
    });
}

function render(path = '', orientation: 'white' | 'black' = 'white') {
    const root = document.createElement('div');
    const saveGamebook = jest.fn();
    const editComment = jest.fn();
    const navigateToParent = jest.fn();
    const editor = new StudyGamebookEditor(root, { saveGamebook, editComment, navigateToParent });
    const tree = fixture();
    editor.update({ tree, path, orientation });
    return { root, editor, tree, saveGamebook, editComment, navigateToParent };
}

describe('Study gamebook author editor', () => {
    test('matches the lila-style initial learner guidance and saves the root hint', () => {
        const { root, editor, saveGamebook } = render();

        expect(root.textContent).toContain('Help the player find the initial move, with a comment.');
        expect(root.textContent).toContain('Optional, on-demand hint for the player:');
        expect(root.querySelector('.study-gamebook-edit__header')).toBeNull();
        const hint = root.querySelector<HTMLTextAreaElement>(
            'textarea[aria-label="Optional, on-demand hint for the player:"]',
        );
        expect(hint?.value).toBe('Root hint');

        hint!.value = 'Look at the center';
        hint!.dispatchEvent(new Event('input', { bubbles: true }));
        editor.update({ tree: fixture(), path: 'StudyNode1', orientation: 'white' });
        expect(saveGamebook).toHaveBeenCalledWith('hint', 'Look at the center', '');
    });

    test('preserves an active gamebook textarea draft, focus, and caret across same-position redraws', () => {
        const { root, editor, tree, saveGamebook } = render('StudyNode1');
        document.body.append(root);
        const deviation = root.querySelector<HTMLTextAreaElement>(
            'textarea[aria-label="When any other wrong move is played:"]',
        )!;
        deviation.focus();
        deviation.value = 'This is not gating';
        deviation.setSelectionRange(8, 11, 'forward');
        deviation.scrollTop = 7;
        deviation.dispatchEvent(new Event('input', { bubbles: true }));

        editor.update({ tree, path: 'StudyNode1', orientation: 'white' });

        const redrawn = root.querySelector<HTMLTextAreaElement>(
            'textarea[aria-label="When any other wrong move is played:"]',
        )!;
        expect(redrawn).not.toBe(deviation);
        expect(redrawn.value).toBe('This is not gating');
        expect(document.activeElement).toBe(redrawn);
        expect(redrawn.selectionStart).toBe(8);
        expect(redrawn.selectionEnd).toBe(11);
        expect(redrawn.selectionDirection).toBe('forward');
        expect(redrawn.scrollTop).toBe(7);
        expect(saveGamebook).not.toHaveBeenCalled();

        editor.flush();
        expect(saveGamebook).toHaveBeenCalledWith('deviation', 'This is not gating', 'StudyNode1');

        tree.byPath.get('StudyNode1')!.gamebook = { deviation: 'This is not gating' };
        editor.update({ tree, path: 'StudyNode1', orientation: 'white' });
        const acknowledged = root.querySelector<HTMLTextAreaElement>(
            'textarea[aria-label="When any other wrong move is played:"]',
        )!;
        expect(acknowledged.value).toBe('This is not gating');
        expect(document.activeElement).toBe(acknowledged);
        expect(acknowledged.selectionStart).toBe(8);
        expect(acknowledged.selectionEnd).toBe(11);
    });

    test('shows correct-move reflection and fallback wrong-answer guidance', () => {
        const { root, editComment } = render('StudyNode1');

        expect(root.textContent).toContain("You may reflect on the player's correct move");
        expect(root.querySelector<HTMLTextAreaElement>('textarea[aria-label="When any other wrong move is played:"]')?.value).toBe(
            'Fallback after e4',
        );
        expect(root.textContent).not.toContain('Add variation moves');
        root.querySelector<HTMLButtonElement>('.study-gamebook-edit__legend.clickable')?.click();
        expect(editComment).toHaveBeenCalledTimes(1);
    });

    test('offers the lila-style add-variation shortcut when no wrong-answer variation exists', () => {
        const { root, navigateToParent } = render('StudyNode1.StudyNode2.StudyNode3');

        const addVariation = [...root.querySelectorAll<HTMLButtonElement>('.study-gamebook-edit__legend.clickable')].find(
            button => button.textContent?.includes('Add variation moves'),
        );
        expect(addVariation).toBeDefined();
        addVariation!.click();
        expect(navigateToParent).toHaveBeenCalledWith('StudyNode1.StudyNode2.StudyNode3');
    });

    test('uses ordinary comments for a specific wrong-answer variation', () => {
        const { root } = render('StudyNode4');

        expect(root.textContent).toContain('Explain why this move is wrong in a comment.');
        expect(root.textContent).toContain('Or promote it as the main line if it is the right move.');
        expect(root.querySelector('textarea')).toBeNull();
    });

    test('shows opponent-first guidance when the lesson starts with the opponent to move', () => {
        const { root } = render('', 'black');

        expect(root.textContent).toContain('Introduce the interactive lesson with a comment.');
        expect(root.textContent).toContain("Put the opponent's first move on the board.");
    });

    test('forced-variation display flags never redefine the authored correct script', () => {
        const { root, tree } = render('StudyNode1');
        const expected = tree.byPath.get('StudyNode1')!;
        expected.forceVariation = true;

        expect(gamebookPathIsMainline(tree, expected.path)).toBe(true);
        const editor = new StudyGamebookEditor(root, {
            editComment: () => {},
            navigateToParent: () => {},
            saveGamebook: () => {},
        });
        editor.update({ tree, path: expected.path, orientation: 'white' });
        expect(root.textContent).not.toContain('Explain why this move is wrong');
        expect(root.textContent).toContain("You may reflect on the player's correct move");
    });
});
