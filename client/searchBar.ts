export function initSearchBarDismissal(searchBar: HTMLElement): () => void {
    let focusOutTimer: number | undefined;

    const collapse = () => searchBar.classList.remove('active');

    const onDocumentClick = (event: MouseEvent) => {
        const target = event.target;
        if (target instanceof Node && !searchBar.contains(target)) collapse();
    };

    const onFocusOut = () => {
        if (focusOutTimer !== undefined) window.clearTimeout(focusOutTimer);
        focusOutTimer = window.setTimeout(() => {
            focusOutTimer = undefined;
            if (!searchBar.contains(document.activeElement)) collapse();
        });
    };

    document.addEventListener('click', onDocumentClick);
    searchBar.addEventListener('focusout', onFocusOut);

    return () => {
        document.removeEventListener('click', onDocumentClick);
        searchBar.removeEventListener('focusout', onFocusOut);
        if (focusOutTimer !== undefined) window.clearTimeout(focusOutTimer);
    };
}
