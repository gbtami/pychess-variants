import { _ } from './i18n';
import { BOARD_FAMILIES, VARIANTS } from './variants';

function applyCataloguedBoardPreviews(): void {
    document.querySelectorAll<SVGSVGElement>('.catalogued-start-board-svg').forEach(svg => {
        if (svg.querySelector('.catalogued-start-board-theme')) return;

        const variantName = svg.closest<HTMLElement>('[data-variant]')?.dataset.variant;
        const variant = variantName ? VARIANTS[variantName] : undefined;
        if (!variant || variant.hasBoard || variant.boardFamily.startsWith('catalogued')) return;

        const boardImage = BOARD_FAMILIES[variant.boardFamily]?.boardCSS[0];
        if (!boardImage) return;

        const image = document.createElementNS('http://www.w3.org/2000/svg', 'image');
        image.classList.add('catalogued-start-board-theme');
        image.setAttribute('x', '0');
        image.setAttribute('y', '0');
        image.setAttribute('width', svg.getAttribute('width') ?? '100%');
        image.setAttribute('height', svg.getAttribute('height') ?? '100%');
        image.setAttribute('preserveAspectRatio', 'none');
        image.setAttribute('href', `/static/images/board/${boardImage}`);

        const squares = svg.querySelectorAll('.catalogued-start-board-square');
        image.addEventListener(
            'error',
            () => {
                image.remove();
                squares.forEach(square => square.removeAttribute('visibility'));
            },
            { once: true },
        );
        const title = svg.querySelector(':scope > title');
        if (title?.nextSibling) svg.insertBefore(image, title.nextSibling);
        else svg.prepend(image);
        squares.forEach(square => square.setAttribute('visibility', 'hidden'));
    });
}

function setFavoriteButton(button: HTMLButtonElement, favorite: boolean): void {
    button.classList.toggle('is-favorite', favorite);
    button.setAttribute('aria-pressed', favorite ? 'true' : 'false');
    const label = favorite ? _('Remove from favorites') : _('Add to favorites');
    button.setAttribute('aria-label', label);
    button.setAttribute('title', label);
    button.textContent = favorite ? '♥' : '♡';

    const card = button.closest('.community-variant-card');
    if (card) card.classList.toggle('community-variant-card--favorite', favorite);
}

async function favoriteVariant(button: HTMLButtonElement): Promise<void> {
    const name = button.dataset.variant;
    if (!name || button.classList.contains('is-busy')) return;

    const favorite = button.getAttribute('aria-pressed') !== 'true';
    button.classList.add('is-busy');
    button.disabled = true;

    try {
        const response = await fetch(`/api/catalogued-variants/${encodeURIComponent(name)}/favorite`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ favorite }),
        });
        if (!response.ok) {
            const text = await response.text();
            throw new Error(text || _('Failed to update favorite'));
        }
        const payload = (await response.json()) as { favorite?: boolean };
        const savedFavorite = !!payload.favorite;
        setFavoriteButton(button, savedFavorite);

        const page = document.querySelector<HTMLElement>('.community-variants-page');
        if (page?.dataset.favoritesOnly === '1' && !savedFavorite) {
            button.closest('.community-variant-card')?.remove();
        }
    } catch (err) {
        const message = err instanceof Error ? err.message : _('Failed to update favorite');
        button.setAttribute('title', message);
        console.warn(message);
    } finally {
        button.classList.remove('is-busy');
        button.disabled = false;
    }
}

export function initCommunityVariantFavorites(): void {
    applyCataloguedBoardPreviews();
    const page = document.querySelector('.community-variants-page');
    if (!page) return;

    page.addEventListener('click', event => {
        const target = event.target as HTMLElement | null;
        const button = target?.closest<HTMLButtonElement>('button.community-variant-favorite');
        if (!button) return;
        event.preventDefault();
        void favoriteVariant(button);
    });
}
