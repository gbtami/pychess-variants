// Adapted from lila's ui/bits/src/bits.dropdownOverflow.ts.
export function initProfileActionOverflow(root: ParentNode = document): void {
    const container = root.querySelector<HTMLElement>('.profile-actions');
    const rack = container?.querySelector<HTMLElement>('.profile-actions__rack');
    const dropdown = container?.querySelector<HTMLElement>('.profile-actions__dropdown');
    const menu = container?.querySelector<HTMLElement>('.profile-actions__menu');
    const moreButton = container?.querySelector<HTMLButtonElement>('.profile-actions__more');

    if (!container || !rack || !dropdown || !menu || !moreButton || container.dataset.overflowReady === 'true') {
        return;
    }
    container.dataset.overflowReady = 'true';

    const setOpen = (open: boolean): void => {
        dropdown.classList.toggle('is-open', open);
        moreButton.setAttribute('aria-expanded', String(open));
    };

    const availableWidth = (): number => {
        const style = getComputedStyle(container);
        return (
            container.clientWidth -
            Number.parseFloat(style.paddingLeft || '0') -
            Number.parseFloat(style.paddingRight || '0')
        );
    };

    const allActions = (): HTMLAnchorElement[] => [
        ...Array.from(rack.children).filter(
            (child): child is HTMLAnchorElement => child !== dropdown && child instanceof HTMLAnchorElement,
        ),
        ...Array.from(menu.children).filter((child): child is HTMLAnchorElement => child instanceof HTMLAnchorElement),
    ];

    const render = (): void => {
        setOpen(false);

        const actions = allActions();
        for (const action of actions) {
            action.removeAttribute('role');
            rack.insertBefore(action, dropdown);
        }

        dropdown.hidden = true;
        if (rack.getBoundingClientRect().width <= availableWidth()) return;

        dropdown.hidden = false;
        for (
            let index = actions.length - 1;
            index >= 0 && rack.getBoundingClientRect().width > availableWidth();
            index--
        ) {
            const action = actions[index];
            action.setAttribute('role', 'menuitem');
            menu.prepend(action);
        }
    };

    moreButton.addEventListener('click', event => {
        event.stopPropagation();
        setOpen(!dropdown.classList.contains('is-open'));
    });
    document.addEventListener('click', event => {
        if (!dropdown.contains(event.target as Node)) setOpen(false);
    });
    dropdown.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
            setOpen(false);
            moreButton.focus();
        }
    });

    window.addEventListener('resize', render);

    void document.fonts?.ready.then(render);
    render();
}
