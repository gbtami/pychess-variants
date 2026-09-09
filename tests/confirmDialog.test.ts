import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { confirmDialog } from '../client/confirmDialog';

describe('confirmDialog', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
            configurable: true,
            value: jest.fn(function (this: HTMLDialogElement) {
                this.setAttribute('open', '');
            }),
        });
        Object.defineProperty(HTMLDialogElement.prototype, 'close', {
            configurable: true,
            value: jest.fn(function (this: HTMLDialogElement) {
                this.removeAttribute('open');
                this.dispatchEvent(new Event('close'));
            }),
        });
    });

    test('uses a native modal and leaves an existing parent dialog open', async () => {
        document.body.innerHTML = '<dialog id="parent" open><button id="delete">Delete</button></dialog>';
        const parent = document.querySelector<HTMLDialogElement>('#parent')!;

        const result = confirmDialog({
            text: 'Delete this item?',
            confirmText: 'Delete',
            danger: true,
        });
        const confirm = document.querySelector<HTMLDialogElement>('#confirm-dialog')!;

        expect(confirm).toBeInstanceOf(HTMLDialogElement);
        expect(confirm.open).toBe(true);
        expect(parent.open).toBe(true);
        expect(confirm.querySelector('.confirm-dialog-confirm')?.classList.contains('button-red')).toBe(true);

        confirm.querySelector<HTMLButtonElement>('.confirm-dialog-cancel')!.click();

        await expect(result).resolves.toBe(false);
        expect(confirm.open).toBe(false);
        expect(parent.open).toBe(true);
    });

    test('resolves true from the confirmation action', async () => {
        const result = confirmDialog({ text: 'Continue?' });
        const confirm = document.querySelector<HTMLDialogElement>('#confirm-dialog')!;

        confirm.querySelector<HTMLButtonElement>('.confirm-dialog-confirm')!.click();

        await expect(result).resolves.toBe(true);
        expect(confirm.open).toBe(false);
    });

    test('only backdrop clicks dismiss the dialog', async () => {
        const result = confirmDialog({ text: 'Continue?' });
        const confirm = document.querySelector<HTMLDialogElement>('#confirm-dialog')!;
        const content = confirm.querySelector<HTMLElement>('.confirm-dialog-content')!;

        content.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        expect(confirm.open).toBe(true);

        confirm.dispatchEvent(new MouseEvent('click', { bubbles: true }));

        await expect(result).resolves.toBe(false);
        expect(confirm.open).toBe(false);
    });

    test('treats the native cancel event as cancellation', async () => {
        const result = confirmDialog({ text: 'Continue?' });
        const confirm = document.querySelector<HTMLDialogElement>('#confirm-dialog')!;
        const cancel = new Event('cancel', { cancelable: true });

        confirm.dispatchEvent(cancel);

        expect(cancel.defaultPrevented).toBe(true);
        await expect(result).resolves.toBe(false);
        expect(confirm.open).toBe(false);
    });
});
