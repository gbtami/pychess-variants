export function practiceVariantUrl(variantKey: string): string {
    return `/practice/${encodeURIComponent(variantKey)}`;
}

export function initPracticeIndex(): void {
    const select = document.querySelector<HTMLSelectElement>('[data-practice-variant-select]');
    if (!select) return;

    select.addEventListener('change', () => {
        if (select.value) window.location.assign(practiceVariantUrl(select.value));
    });
}
