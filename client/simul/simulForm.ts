import { _ } from '../i18n';

type VariantPickerKind = 'favorite' | 'site' | 'community';

type VariantPickerEntry = {
    option: HTMLOptionElement;
    value: string;
    label: string;
    kind: VariantPickerKind;
    searchText: string;
};

const FAVORITE_LIMIT = 12;
const SEARCH_LIMIT = 80;

function normalize(value: string): string {
    return value.trim().toLocaleLowerCase();
}

export function initSimulForm(): void {
    const picker = document.getElementById('simul-variant-picker');
    const search = document.getElementById('simul-variant-search');
    const results = document.getElementById('simul-variant-results');
    const selected = document.getElementById('simul-selected-variants');
    const source = document.getElementById('simul-variants');
    if (
        !(picker instanceof HTMLElement) ||
        !(search instanceof HTMLInputElement) ||
        !(results instanceof HTMLElement) ||
        !(selected instanceof HTMLElement) ||
        !(source instanceof HTMLSelectElement)
    ) {
        return;
    }

    const parsedMax = Number.parseInt(picker.dataset.maxSelected ?? '', 10);
    const maxSelected = Number.isFinite(parsedMax) && parsedMax > 0 ? parsedMax : 20;
    const entries: VariantPickerEntry[] = Array.from(source.options).map(option => {
        const rawKind = option.dataset.kind ?? option.parentElement?.getAttribute('data-kind') ?? 'site';
        const kind: VariantPickerKind =
            rawKind === 'favorite' || rawKind === 'community' ? rawKind : 'site';
        const label = option.textContent?.trim() || option.value;
        return {
            option,
            value: option.value,
            label,
            kind,
            searchText: normalize(`${label} ${option.value}`),
        };
    });
    if (entries.length === 0) return;

    let visibleEntries: VariantPickerEntry[] = [];
    let activeIndex = -1;

    const selectedEntries = (): VariantPickerEntry[] => entries.filter(entry => entry.option.selected);

    const position = document.getElementById('form3-position');
    const positionHelp = document.getElementById('simul-position-help');
    const positionEditor = document.getElementById('simul-position-editor');

    const updatePositionAvailability = (): void => {
        if (!(position instanceof HTMLInputElement)) return;
        const chosen = selectedEntries();
        const available = chosen.length === 1;
        position.disabled = !available;
        if (positionHelp instanceof HTMLElement) {
            positionHelp.classList.toggle('is-disabled', !available);
        }
        if (positionEditor instanceof HTMLAnchorElement && available) {
            positionEditor.href = `/editor/${encodeURIComponent(chosen[0].value)}`;
        }
    };

    const setExpanded = (expanded: boolean): void => {
        search.setAttribute('aria-expanded', expanded ? 'true' : 'false');
        results.hidden = !expanded;
        if (!expanded) {
            activeIndex = -1;
            search.removeAttribute('aria-activedescendant');
        }
    };

    const setActive = (index: number): void => {
        if (visibleEntries.length === 0) {
            activeIndex = -1;
            search.removeAttribute('aria-activedescendant');
            return;
        }
        activeIndex = Math.max(0, Math.min(index, visibleEntries.length - 1));
        results.querySelectorAll<HTMLElement>('.variant-picker-option').forEach((element, optionIndex) => {
            element.classList.toggle('is-active', optionIndex === activeIndex);
        });
        const active = results.querySelector<HTMLElement>(`#simul-variant-option-${activeIndex}`);
        if (active) {
            search.setAttribute('aria-activedescendant', active.id);
            if (typeof active.scrollIntoView === 'function') active.scrollIntoView({ block: 'nearest' });
        }
    };

    const renderSelected = (): void => {
        selected.replaceChildren();
        const chosen = selectedEntries();
        chosen.forEach(entry => {
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'simul-variant-picker__chip';
            chip.title = chosen.length === 1 ? _('A simul must offer at least one variant') : _('Remove %1', entry.label);
            chip.disabled = chosen.length === 1;

            const label = document.createElement('span');
            label.textContent = entry.label;
            chip.append(label);

            const remove = document.createElement('span');
            remove.className = 'simul-variant-picker__remove';
            remove.setAttribute('aria-hidden', 'true');
            remove.textContent = '×';
            chip.append(remove);

            chip.addEventListener('click', () => {
                if (selectedEntries().length <= 1) return;
                entry.option.selected = false;
                source.dispatchEvent(new Event('change', { bubbles: true }));
                renderSelected();
                renderResults();
            });
            selected.append(chip);
        });
    };

    const appendHint = (text: string): void => {
        const hint = document.createElement('div');
        hint.className = 'variant-picker-hint';
        hint.textContent = text;
        hint.setAttribute('role', 'presentation');
        results.append(hint);
    };

    const chooseEntry = (entry: VariantPickerEntry): void => {
        if (entry.option.selected) {
            search.value = '';
            setExpanded(false);
            return;
        }
        if (selectedEntries().length >= maxSelected) {
            results.replaceChildren();
            visibleEntries = [];
            activeIndex = -1;
            appendHint(_('A simul can offer at most %1 variants.', maxSelected));
            setExpanded(true);
            return;
        }
        entry.option.selected = true;
        source.dispatchEvent(new Event('change', { bubbles: true }));
        search.value = '';
        renderSelected();
        setExpanded(false);
    };

    const appendGroup = (label: string, groupEntries: VariantPickerEntry[]): void => {
        if (groupEntries.length === 0) return;
        const heading = document.createElement('div');
        heading.className = 'variant-picker-group';
        heading.textContent = label;
        heading.setAttribute('role', 'presentation');
        results.append(heading);

        groupEntries.forEach(entry => {
            const index = visibleEntries.length;
            visibleEntries.push(entry);
            const row = document.createElement('button');
            row.type = 'button';
            row.id = `simul-variant-option-${index}`;
            row.className = 'variant-picker-option';
            row.setAttribute('role', 'option');
            row.setAttribute('aria-selected', entry.option.selected ? 'true' : 'false');
            row.tabIndex = -1;

            const name = document.createElement('span');
            name.className = 'variant-picker-option-name';
            name.textContent = entry.label;
            row.append(name);

            if (entry.kind !== 'site' && normalize(entry.value) !== normalize(entry.label)) {
                const key = document.createElement('small');
                key.className = 'variant-picker-option-key';
                key.textContent = entry.value;
                row.append(key);
            }

            row.addEventListener('pointermove', () => setActive(index));
            row.addEventListener('click', () => chooseEntry(entry));
            results.append(row);
        });
    };

    const renderResults = (): void => {
        results.replaceChildren();
        visibleEntries = [];
        activeIndex = -1;
        search.removeAttribute('aria-activedescendant');

        const query = normalize(search.value);
        if (!query) {
            appendGroup(_('Favorites'), entries.filter(entry => entry.kind === 'favorite').slice(0, FAVORITE_LIMIT));
            appendGroup(_('Site variants'), entries.filter(entry => entry.kind === 'site'));
            if (entries.some(entry => entry.kind === 'community')) {
                appendHint(_('Type to search all public community variants.'));
            }
        } else {
            const tokens = query.split(/\s+/).filter(Boolean);
            const matches = entries.filter(entry => tokens.every(token => entry.searchText.includes(token)));
            const limited = matches.slice(0, SEARCH_LIMIT);
            appendGroup(_('Favorites'), limited.filter(entry => entry.kind === 'favorite'));
            appendGroup(_('Site variants'), limited.filter(entry => entry.kind === 'site'));
            appendGroup(_('Community variants'), limited.filter(entry => entry.kind === 'community'));
            if (matches.length === 0) appendHint(_('No matching variants.'));
            else if (matches.length > limited.length) {
                appendHint(_('Showing the first %1 matches. Refine your search.', SEARCH_LIMIT));
            }
        }

        setExpanded(true);
        if (visibleEntries.length > 0) setActive(0);
    };

    search.addEventListener('focus', renderResults);
    search.addEventListener('input', renderResults);
    search.addEventListener('keydown', event => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            if (results.hidden) renderResults();
            const delta = event.key === 'ArrowDown' ? 1 : -1;
            const startIndex = activeIndex < 0 ? (delta > 0 ? -1 : visibleEntries.length) : activeIndex;
            setActive(startIndex + delta);
        } else if (event.key === 'Enter' && !results.hidden && activeIndex >= 0) {
            event.preventDefault();
            chooseEntry(visibleEntries[activeIndex]);
        } else if (event.key === 'Escape') {
            event.preventDefault();
            search.value = '';
            setExpanded(false);
        }
    });

    document.addEventListener('pointerdown', event => {
        if (!(event.target instanceof Node) || picker.contains(event.target)) return;
        search.value = '';
        setExpanded(false);
    });

    source.addEventListener('change', updatePositionAvailability);
    renderSelected();
    updatePositionAvailability();
}
