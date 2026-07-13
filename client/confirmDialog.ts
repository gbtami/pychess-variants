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
let keydownHandler: ((event: KeyboardEvent) => void) | null = null;
let pendingResolve: ((value: boolean) => void) | null = null;

function ensureDialogElement(): HTMLElement {
    let dialogElement = document.getElementById('confirm-dialog');
    if (!dialogElement) {
        dialogElement = document.createElement('div');
        dialogElement.id = 'confirm-dialog';
        dialogElement.className = 'confirm-dialog-root';
        document.body.appendChild(dialogElement);
    }
    return dialogElement;
}

function closeDialog(result: boolean): void {
    if (keydownHandler) {
        document.removeEventListener('keydown', keydownHandler);
        keydownHandler = null;
    }

    const dialogElement = document.getElementById('confirm-dialog');
    if (dialogElement) {
        dialogElement.style.display = 'none';
    }
    dialogVNode = null;

    if (pendingResolve) {
        const resolve = pendingResolve;
        pendingResolve = null;
        resolve(result);
    }
}

function renderDialog(options: ConfirmDialogOptions): void {
    const dialogElement = ensureDialogElement();

    const contentChildren: VNode[] = [];
    if (options.title) {
        contentChildren.push(h('h2', options.title));
    }
    contentChildren.push(h('p', options.text));
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

    const vnode = h('div.confirm-dialog-wrap', [
        h('div.confirm-dialog-backdrop', {
            on: {
                click: () => closeDialog(false),
            },
        }),
        h(
            'div.confirm-dialog-content',
            {
                attrs: {
                    role: 'dialog',
                    'aria-modal': 'true',
                },
            },
            contentChildren,
        ),
    ]);

    if (dialogVNode === null) {
        dialogElement.innerHTML = '';
        const placeholder = document.createElement('div');
        dialogElement.appendChild(placeholder);
        dialogVNode = patch(placeholder, vnode);
    } else {
        dialogVNode = patch(dialogVNode, vnode);
    }

    dialogElement.style.display = 'flex';
    window.requestAnimationFrame(() => {
        const confirmButton = dialogElement.querySelector('.confirm-dialog-confirm') as HTMLButtonElement | null;
        if (confirmButton) confirmButton.focus();
    });
}

export function confirmDialog(options: ConfirmDialogOptions): Promise<boolean> {
    if (pendingResolve) {
        const resolve = pendingResolve;
        pendingResolve = null;
        resolve(false);
    }

    renderDialog(options);

    keydownHandler = (event: KeyboardEvent) => {
        if (event.key === 'Escape') {
            event.preventDefault();
            closeDialog(false);
        }
    };
    document.addEventListener('keydown', keydownHandler);

    return new Promise<boolean>(resolve => {
        pendingResolve = resolve;
    });
}
