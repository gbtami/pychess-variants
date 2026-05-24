import { h, VNode } from 'snabbdom';

import { patch } from './document';

interface AlertDialogOptions {
    title?: string;
    text: string;
    okText?: string;
}

let dialogVNode: VNode | null = null;
let keydownHandler: ((event: KeyboardEvent) => void) | null = null;
let pendingResolve: (() => void) | null = null;

function ensureDialogElement(): HTMLElement {
    let dialogElement = document.getElementById('alert-dialog');
    if (!dialogElement) {
        dialogElement = document.createElement('div');
        dialogElement.id = 'alert-dialog';
        dialogElement.className = 'alert-dialog-root';
        document.body.appendChild(dialogElement);
    }
    return dialogElement;
}

function closeDialog(): void {
    if (keydownHandler) {
        document.removeEventListener('keydown', keydownHandler);
        keydownHandler = null;
    }

    const dialogElement = document.getElementById('alert-dialog');
    if (dialogElement) {
        dialogElement.style.display = 'none';
    }
    dialogVNode = null;

    if (pendingResolve) {
        const resolve = pendingResolve;
        pendingResolve = null;
        resolve();
    }
}

function renderDialog(options: AlertDialogOptions): void {
    const dialogElement = ensureDialogElement();
    const currentElm = dialogVNode?.elm as Node | undefined;
    if (dialogVNode !== null && (!currentElm || !document.contains(currentElm))) {
        dialogVNode = null;
    }

    const contentChildren: VNode[] = [];
    if (options.title) {
        contentChildren.push(h('h2', options.title));
    }
    contentChildren.push(h('p', options.text));
    contentChildren.push(
        h('div.alert-dialog-actions', [
            h('button.button.alert-dialog-ok', {
                props: { type: 'button' },
                on: {
                    click: () => closeDialog(),
                },
            }, options.okText || 'OK'),
        ]),
    );

    const vnode = h('div.alert-dialog-wrap', [
        h('div.alert-dialog-backdrop', {
            on: {
                click: () => closeDialog(),
            },
        }),
        h('div.alert-dialog-content', {
            attrs: {
                role: 'dialog',
                'aria-modal': 'true',
            },
        }, contentChildren),
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
        const okButton = dialogElement.querySelector('.alert-dialog-ok') as HTMLButtonElement | null;
        if (okButton) okButton.focus();
    });
}

export function alertDialog(options: AlertDialogOptions): Promise<void> {
    if (pendingResolve) {
        const resolve = pendingResolve;
        pendingResolve = null;
        resolve();
    }

    renderDialog(options);

    keydownHandler = (event: KeyboardEvent) => {
        if (event.key === 'Escape' || event.key === 'Enter') {
            event.preventDefault();
            closeDialog();
        }
    };
    document.addEventListener('keydown', keydownHandler);

    return new Promise<void>((resolve) => {
        pendingResolve = resolve;
    });
}
