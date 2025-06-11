import { h, VNode } from 'snabbdom';
import { patch } from './document';
import { _ } from './i18n';

interface UsernameDialogState {
    username: string;
    isChecking: boolean;
    isAvailable: boolean | null;
    error: string | null;
    isSubmitting: boolean;
}

let dialogState: UsernameDialogState = {
    username: '',
    isChecking: false,
    isAvailable: null,
    error: null,
    isSubmitting: false
};

let checkUsernameTimeout: number | null = null;

async function checkUsernameAvailability(username: string): Promise<void> {
    if (!username.trim()) {
        dialogState.isAvailable = null;
        dialogState.error = null;
        return;
    }

    dialogState.isChecking = true;
    dialogState.error = null;

    try {
        const response = await fetch('/api/check-username', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ username: username.trim() })
        });

        const data = await response.json();

        if (data.available) {
            dialogState.isAvailable = true;
            dialogState.error = null;
        } else {
            dialogState.isAvailable = false;
            dialogState.error = data.error || 'Username not available';
            console.log('Username availability check failed:', data);
        }
    } catch (error) {
        dialogState.isAvailable = false;
        dialogState.error = 'Failed to check username availability';
    }

    dialogState.isChecking = false;
}

function onUsernameInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    dialogState.username = target.value;

    // Clear previous timeout
    if (checkUsernameTimeout) {
        clearTimeout(checkUsernameTimeout);
    }

    // Debounce username checking
    checkUsernameTimeout = window.setTimeout(() => {
        checkUsernameAvailability(dialogState.username).then(() => {
            // Re-render dialog with updated state
            renderUsernameDialog();
        });
    }, 500);
}

async function confirmUsername(): Promise<void> {
    if (!dialogState.isAvailable || dialogState.isSubmitting) {
        return;
    }

    dialogState.isSubmitting = true;

    try {
        const response = await fetch('/api/confirm-username', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ username: dialogState.username.trim() })
        });

        const data = await response.json();

        if (data.success) {
            // Reload the page to refresh the session
            window.location.reload();
        } else {
            dialogState.error = data.error || 'Failed to create account';
            dialogState.isSubmitting = false;
            console.error('Username confirmation failed:', data);
        }
    } catch (error) {
        dialogState.error = 'Failed to create account';
        dialogState.isSubmitting = false;
    }

    renderUsernameDialog();
}

function getUsernameStatusIcon(): VNode | null {
    if (dialogState.isChecking) {
        return h('span.username-status.checking', '⏳');
    } else if (dialogState.isAvailable === true) {
        return h('span.username-status.available', '✓');
    } else if (dialogState.isAvailable === false) {
        return h('span.username-status.unavailable', '✗');
    }
    return null;
}

let dialogVNode: VNode | null = null;

function renderUsernameDialog(): void {
    const dialogElement = document.getElementById('username-dialog');
    if (!dialogElement) return;

    const canSubmit = dialogState.isAvailable === true && !dialogState.isSubmitting;
    const statusIcon = getUsernameStatusIcon();

    const vnode = h('div.username-dialog-content', [
        h('h2', _('Choose your username')),
        h('p', _('Please choose a username for your account.')),
        h('div.username-input-container', [
            h('input#username-input', {
                attrs: {
                    type: 'text',
                    placeholder: _('Username'),
                    value: dialogState.username,
                    maxlength: '20',
                    minlength: '3'
                },
                on: {
                    input: onUsernameInput,
                    keypress: (event: KeyboardEvent) => {
                        if (event.key === 'Enter' && canSubmit) {
                            confirmUsername();
                        }
                    }
                }
            }),
            ...(statusIcon ? [statusIcon] : [])
        ]),
        dialogState.error ? h('div.error-message', dialogState.error) : null,
        h('div.username-requirements', [
            h('ul', [
                h('li', _('3-20 characters')),
                h('li', _('Letters, numbers, underscore and dash only')),
                h('li', _('Must be unique'))
            ])
        ]),
        h('div.dialog-buttons', [
            h('button.confirm-btn', {
                attrs: {
                    disabled: !canSubmit
                },
                on: {
                    click: confirmUsername
                }
            }, dialogState.isSubmitting ? _('Creating account...') : _('Confirm'))
        ])
    ].filter((item): item is VNode => item !== null));

    // Use Snabbdom patch to render VNode to DOM
    if (dialogVNode === null) {
        // Initial render - clear content and create new VNode
        dialogElement.innerHTML = '';
        const placeholder = document.createElement('div');
        dialogElement.appendChild(placeholder);
        dialogVNode = patch(placeholder, vnode);
    } else {
        // Update existing VNode
        dialogVNode = patch(dialogVNode, vnode);
    }
}

export function showUsernameDialog(oauthData: {
    oauth_id: string;
    oauth_provider: string;
    oauth_username: string;
}): void {
    // Validate oauth data
    if (!oauthData || !oauthData.oauth_id || !oauthData.oauth_provider) {
        console.error('Invalid OAuth data provided to username dialog');
        return;
    }

    // Reset dialog state and VNode
    dialogVNode = null;
    dialogState = {
        username: oauthData.oauth_username || '',
        isChecking: false,
        isAvailable: null,
        error: null,
        isSubmitting: false
    };

    // Create dialog element if it doesn't exist
    let dialogElement = document.getElementById('username-dialog');
    if (!dialogElement) {
        dialogElement = document.createElement('div');
        dialogElement.id = 'username-dialog';
        dialogElement.className = 'modal-overlay';
        document.body.appendChild(dialogElement);
    }

    dialogElement.style.display = 'block';

    // Initial render
    renderUsernameDialog();

    // Focus on username input
    setTimeout(() => {
        const input = document.getElementById('username-input') as HTMLInputElement;
        if (input) {
            input.focus();
            input.select();
        }
    }, 100);

    // Check initial username if provided
    if (dialogState.username) {
        checkUsernameAvailability(dialogState.username).then(() => {
            renderUsernameDialog();
        });
    }
}

export function hideUsernameDialog(): void {
    const dialogElement = document.getElementById('username-dialog');
    if (dialogElement) {
        dialogElement.style.display = 'none';
        dialogVNode = null; // Reset VNode for next use
    }
}
