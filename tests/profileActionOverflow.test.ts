import { initProfileActionOverflow } from '@/profileActionOverflow';

function setUpActions(availableWidth: number) {
    document.body.innerHTML = `
        <div class="profile-actions">
            <div class="profile-actions__rack">
                <a href="/watch">Watch</a>
                <a href="/follow">Follow</a>
                <a href="/blogs">Blogs</a>
                <a href="/variants">Variants</a>
                <div class="profile-actions__dropdown" hidden>
                    <button class="profile-actions__more" aria-expanded="false">More</button>
                    <div class="profile-actions__menu"></div>
                </div>
            </div>
        </div>`;

    const container = document.querySelector<HTMLElement>('.profile-actions')!;
    const rack = document.querySelector<HTMLElement>('.profile-actions__rack')!;
    const dropdown = document.querySelector<HTMLElement>('.profile-actions__dropdown')!;

    Object.defineProperty(container, 'clientWidth', { get: () => availableWidth });
    rack.getBoundingClientRect = () =>
        ({
            width: rack.querySelectorAll(':scope > a').length * 70 + (dropdown.hidden ? 0 : 50),
        }) as DOMRect;

    return { dropdown };
}

test('moves trailing profile actions into the overflow menu', () => {
    const { dropdown } = setUpActions(250);

    initProfileActionOverflow();

    expect(dropdown.hidden).toBe(false);
    expect([...document.querySelectorAll('.profile-actions__rack > a')].map(action => action.textContent)).toEqual([
        'Watch',
        'Follow',
    ]);
    expect([...document.querySelectorAll('.profile-actions__menu > a')].map(action => action.textContent)).toEqual([
        'Blogs',
        'Variants',
    ]);
});

test('opens the overflow menu by click and closes it with Escape', () => {
    const { dropdown } = setUpActions(250);
    initProfileActionOverflow();

    const moreButton = document.querySelector<HTMLButtonElement>('.profile-actions__more')!;
    moreButton.click();
    expect(dropdown.classList.contains('is-open')).toBe(true);
    expect(moreButton.getAttribute('aria-expanded')).toBe('true');

    dropdown.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(dropdown.classList.contains('is-open')).toBe(false);
    expect(moreButton.getAttribute('aria-expanded')).toBe('false');
});
