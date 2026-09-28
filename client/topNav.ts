/* THE HEADER'S SECTION MENUS, AS DISCLOSURES.
   ------------------------------------------------------------------------------------
   Each `.topnav section` holds a `.nav-section` button and the `.drp` it names through
   `aria-controls`. The button's `aria-expanded` is the ONLY state: `site.css` reveals a menu with
   `.nav-section[aria-expanded='true'] + .drp`, so there is no class to keep in step and no way for
   what a screen reader is told to differ from what is on screen.

   WHY A BUTTON RATHER THAN THE LINK THAT USED TO BE HERE. A pointer has two gestures -- hover opens
   the menu, click follows the link -- so the menu never needed a control of its own. A screen reader
   has ONE: activation. So activation has to either navigate or toggle, and `aria-expanded` on
   something that navigates is a lie. The destination is not lost: every section's URL is also its
   submenu's first item. And a tap-only device has no hover at all, so these menus were previously
   unreachable there by anybody, sighted or not.

   `:hover` still opens the menu for pointers and does NOT touch `aria-expanded` -- see the comment
   on the rule in `site.css`. `mouseleave` closes a latched menu so a click followed by a mouse-out
   behaves the way hovering always did. */

const SECTION = '.topnav section';
const BUTTON = '.nav-section';

function buttons(root: ParentNode): HTMLElement[] {
    return Array.from(root.querySelectorAll<HTMLElement>(`${SECTION} > ${BUTTON}`));
}

function setOpen(button: HTMLElement, open: boolean): void {
    button.setAttribute('aria-expanded', String(open));
}

/** Wires the six section menus. Returns a teardown, as `searchBar.ts` does. */
export function initTopNavDisclosures(root: ParentNode = document): () => void {
    const all = buttons(root);
    if (all.length === 0) return () => {};

    const closeAll = (except?: HTMLElement) =>
        all.forEach(b => {
            if (b !== except) setOpen(b, false);
        });

    // ONE DELEGATED LISTENER, not one per section: the same shape as `initLoginDropdown`, and it
    // gives the outside-click close for free — anything that is not a section button closes
    // everything, including a click on a link inside a menu on its way to navigating.
    const onClick = (e: Event) => {
        const target = e.target as HTMLElement | null;
        const button = target?.closest<HTMLElement>(`${SECTION} > ${BUTTON}`) ?? null;
        if (button === null) {
            closeAll();
            return;
        }
        const wasOpen = button.getAttribute('aria-expanded') === 'true';
        closeAll(button);
        setOpen(button, !wasOpen);
    };

    // Escape closes and hands focus back to the button that owned the menu, so a reader does not
    // lose its place — the same courtesy `initLoginDropdown` pays at main.ts:471-472.
    const onKeydown = (e: KeyboardEvent) => {
        if (e.key !== 'Escape') return;
        const open = all.find(b => b.getAttribute('aria-expanded') === 'true');
        if (open === undefined) return;
        setOpen(open, false);
        open.focus();
    };

    const leaveHandlers = all.map(button => {
        const section = button.parentElement;
        const onLeave = () => setOpen(button, false);
        section?.addEventListener('mouseleave', onLeave);
        return () => section?.removeEventListener('mouseleave', onLeave);
    });

    document.addEventListener('click', onClick);
    document.addEventListener('keydown', onKeydown);

    return () => {
        document.removeEventListener('click', onClick);
        document.removeEventListener('keydown', onKeydown);
        leaveHandlers.forEach(off => off());
    };
}
