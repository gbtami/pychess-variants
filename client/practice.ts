export function practiceVariantUrl(variantKey: string): string {
    return `/practice/${encodeURIComponent(variantKey)}`;
}

function restorePracticeVariantSelect(select: HTMLSelectElement): void {
    const current = select.dataset.practiceCurrentVariant;
    if (current && select.value !== current) select.value = current;
}

export function initPracticeIndex(): void {
    const select = document.querySelector<HTMLSelectElement>('[data-practice-variant-select]');
    if (!select) return;

    restorePracticeVariantSelect(select);
    window.addEventListener('pageshow', () => restorePracticeVariantSelect(select));

    select.addEventListener('change', () => {
        if (select.value) window.location.assign(practiceVariantUrl(select.value));
    });
}
