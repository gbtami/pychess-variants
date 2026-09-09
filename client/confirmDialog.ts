import { h, VNode } from 'snabbdom';

import { patch } from './document';

interface ConfirmDialogOptions {
    title?: string;
    text: string;
    confirmText?: string;
    cancelText?: string;
    danger?: boolean;
}

let dialogVNode: VNode | null = null;
let pendingResolve: ((value: boolean) => void) | null = null;

function ensureDialogElement(): HTMLDialogElement {
    const existing = document.getElementById('confirm-dialog');
    if (existing instanceof HTMLDialogElement) return existing;
    existing?.remove();

    const dialogElement = document.createElement('dialog');
    dialogElement.id = 'confirm-dialog';
    dialogElement.className = 'confirm-dialog-root confirm-dialog-native';
    dialogElement.addEventListener('cancel', event => {
        event.preventDefault();
        closeDialog(false);
    });
    dialogElement.addEventListener('click', event => {
        if (event.target === dialogElement) closeDialog(false);
    });
    document.body.appendChild(dialogElement);
    return dialogElement;
}

function closeDialog(result: boolean): void {
    const dialogElement = document.getElementById('confirm-dialog');
    if (dialogElement instanceof HTMLDialogElement && dialogElement.open) dialogElement.close();
    dialogVNode = null;

    if (pendingResolve) {
        const resolve = pendingResolve;
        pendingResolve = null;
        resolve(result);
    }
}

function renderDialog(options: ConfirmDialogOptions): void {
    const dialogElement = ensureDialogElement();
    const currentElm = dialogVNode?.elm as Node | undefined;
    if (dialogVNode !== null && (!currentElm || !document.contains(currentElm))) {
        dialogVNode = null;
    }

    const contentChildren: VNode[] = [];
    if (options.title) {
        contentChildren.push(h('h2#confirm-dialog-title', options.title));
        dialogElement.setAttribute('aria-labelledby', 'confirm-dialog-title');
    } else {
        dialogElement.removeAttribute('aria-labelledby');
    }
    contentChildren.push(h('p#confirm-dialog-text', options.text));
    dialogElement.setAttribute('aria-describedby', 'confirm-dialog-text');
    contentChildren.push(
        h('div.confirm-dialog-actions', [
            h(
                'button.button.button-empty.confirm-dialog-cancel',
                {
                    props: { type: 'button' },
                    on: {
                        click: () => closeDialog(false),
                    },
                },
                options.cancelText || 'Cancel',
            ),
            h(
                `button.button.confirm-dialog-confirm${options.danger ? '.button-red' : ''}`,
                {
                    props: { type: 'button' },
                    on: {
                        click: () => closeDialog(true),
                    },
                },
                options.confirmText || 'OK',
            ),
        ]),
    );

    const vnode = h('div.confirm-dialog-content', contentChildren);

    if (dialogVNode === null) {
        dialogElement.innerHTML = '';
        const placeholder = document.createElement('div');
        dialogElement.appendChild(placeholder);
        dialogVNode = patch(placeholder, vnode);
    } else {
        dialogVNode = patch(dialogVNode, vnode);
    }

    // showModal() promotes the confirmation to the browser top layer. This is
    // important when a confirmation is opened from another native <dialog>:
    // the parent can stay open while the confirmation appears above it.
    if (!dialogElement.open) dialogElement.showModal();
    window.requestAnimationFrame(() => {
        const confirmButton = dialogElement.querySelector('.confirm-dialog-confirm') as HTMLButtonElement | null;
        if (confirmButton) confirmButton.focus();
    });
}

export function confirmDialog(options: ConfirmDialogOptions): Promise<boolean> {
    if (pendingResolve) closeDialog(false);

    renderDialog(options);

    return new Promise<boolean>(resolve => {
        pendingResolve = resolve;
    });
}
