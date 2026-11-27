/** Floating popups of the table editor (date picker, value lists, hints), placed under a cell. */

/** Puts `popup` under `anchor` (above it when there is no room below), inside the window. */
export function place(popup: HTMLElement, anchor: HTMLElement): void {
  document.body.append(popup);
  const cell = anchor.getBoundingClientRect();
  const box = popup.getBoundingClientRect();
  const below = cell.bottom + 2;
  const top = below + box.height > window.innerHeight - 4 && cell.top - box.height - 2 > 4 ? cell.top - box.height - 2 : below;
  const left = Math.max(4, Math.min(cell.left, window.innerWidth - box.width - 4));
  popup.style.top = `${top}px`;
  popup.style.left = `${left}px`;
}

/** Keeps the focus where it is when a popup is clicked (the editor stays active). */
export function keepFocus(popup: HTMLElement): void {
  popup.addEventListener('mousedown', (e) => {
    if (!(e.target instanceof HTMLInputElement)) {
      e.preventDefault();
    }
  });
}

/**
 * Keys typed in an editor stay there (Enter must not reopen the cell). Shortcuts with Ctrl / ⌘ go
 * on: Ctrl/⌘+Enter submits, the others reach VS Code.
 */
export function isolate(e: KeyboardEvent): void {
  if (!e.metaKey && !e.ctrlKey) {
    e.stopPropagation();
  }
}
