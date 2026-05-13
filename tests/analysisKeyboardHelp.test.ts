import { describe, expect, test } from '@jest/globals';

import { buildKeyboardHelpSections, isKeyboardHelpShortcut } from '../client/analysis/keyboardHelp';

describe('analysis keyboard help', () => {
    test('lists the core analysis shortcuts', () => {
        const sections = buildKeyboardHelpSections({
            variant: { name: 'chess', rules: { gate: false } },
        } as any);

        expect(sections.map((section) => section.title)).toContain('Navigation');
        expect(sections.flatMap((section) => section.items).some((item) => item.keys.includes('?'))).toBe(true);
        expect(sections.flatMap((section) => section.items).some((item) => item.keys.includes('f'))).toBe(true);
    });

    test('adds the input section for gated move entry variants', () => {
        const sections = buildKeyboardHelpSections({
            variant: { name: 'duck', rules: { gate: false } },
        } as any);

        expect(sections.some((section) => section.title === 'Input')).toBe(true);
        expect(sections.flatMap((section) => section.items).some((item) => item.keys.includes('enter'))).toBe(true);
    });

    test('detects the help shortcut from semantic key events', () => {
        expect(isKeyboardHelpShortcut(new KeyboardEvent('keydown', { key: '?', shiftKey: true }))).toBe(true);
        expect(isKeyboardHelpShortcut(new KeyboardEvent('keydown', { key: '/', shiftKey: true }))).toBe(true);
        expect(isKeyboardHelpShortcut(new KeyboardEvent('keydown', { key: '/', shiftKey: false }))).toBe(false);
    });
});
