import { _ } from './i18n';

export function renderFollowButtonState(button: HTMLAnchorElement, following: boolean): void {
    const action = following ? _('Unfollow') : _('Follow');
    button.textContent = following ? _('Following') : action;
    button.title = action;
    button.setAttribute('aria-label', action);
}
