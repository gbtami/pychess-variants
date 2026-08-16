import { renderFollowButtonState } from '@/followButton';

test('following mini-card button exposes unfollow as its action', () => {
    const button = document.createElement('a');

    renderFollowButtonState(button, true);

    expect(button.textContent).toBe('Following');
    expect(button.title).toBe('Unfollow');
    expect(button.getAttribute('aria-label')).toBe('Unfollow');
});

test('non-following mini-card button exposes follow as its action', () => {
    const button = document.createElement('a');

    renderFollowButtonState(button, false);

    expect(button.textContent).toBe('Follow');
    expect(button.title).toBe('Follow');
    expect(button.getAttribute('aria-label')).toBe('Follow');
});
