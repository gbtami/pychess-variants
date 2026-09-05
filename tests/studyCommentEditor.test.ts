import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import { StudyCommentEditor } from '../client/study/commentEditor';

beforeEach(() => {
    jest.useFakeTimers();
    document.body.innerHTML = '<div id="editor"></div>';
});
afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    document.body.innerHTML = '';
});

function setup() {
    const save = jest.fn();
    const root = document.getElementById('editor')!;
    const editor = new StudyCommentEditor(root, save);
    const type = (text: string, index = 0) => {
        const input = root.querySelectorAll('textarea')[index];
        input.focus();
        input.value = text;
        input.dispatchEvent(new InputEvent('input', { bubbles: true }));
        return input;
    };
    return { editor, root, save, type };
}

test('debounces typing while keeping the same comment identity', () => {
    const { editor, save, type } = setup();
    editor.update('e4', []);
    const input = type('A');
    type('An idea');
    jest.advanceTimersByTime(499);
    expect(save).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(save).toHaveBeenCalledWith('e4', input.dataset.commentId, 'An idea');
    editor.update('e4', [{ id: input.dataset.commentId!, author: 'owner', text: 'An idea' }]);
    expect(document.activeElement).toBe(input);
    type('');
    input.blur();
    // Saving on blur could replace a clicked move before its click event fires.
    expect(save).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(500);
    expect(save).toHaveBeenLastCalledWith('e4', input.dataset.commentId, '');
});

test('navigation flushes the original position and cancels its delayed save', () => {
    const { editor, save, type, root } = setup();
    editor.update('e4', []);
    const input = type('Before navigating');
    editor.update('d4', [{ id: 'existing', author: 'import', text: 'Different position' }]);
    expect(save).toHaveBeenCalledWith('e4', input.dataset.commentId, 'Before navigating');
    expect(root.querySelector('textarea')!.value).toBe('Different position');
    jest.advanceTimersByTime(1000);
    expect(save).toHaveBeenCalledTimes(1);
});

test('keeps multiple imported comments separate and does not reset a draft on an acknowledgement', () => {
    const { editor, save, type, root } = setup();
    const comments = [
        { id: 'first', author: 'import', text: 'First note' },
        { id: 'second', author: 'import', text: 'Second note' },
    ];
    editor.update('', comments);
    expect(root.querySelectorAll('textarea')).toHaveLength(2);
    const input = type('Revised first');
    editor.update('', comments);
    expect(input.value).toBe('Revised first');
    expect(root.querySelectorAll('textarea')[1].value).toBe('Second note');
    editor.flush();
    expect(save).toHaveBeenCalledWith('', 'first', 'Revised first');
});
