import { useEffect } from "react";

// Keyboard and screen-reader behaviour for every pop-up in the app, in one
// place rather than repeated in each of them.
//
// Pop-ups (".modal-card") are treated as modal dialogs: they are announced
// as dialogs named by their heading, focus moves to the first field when one
// opens, Tab stays inside it, Escape closes it, and focus goes back to the
// button that opened it. Header drop-downs (search, quick actions,
// notifications, the QR panel) are lighter: Escape closes them and focus
// returns to their button.
//
// Closing always goes through the pop-up's own Close/Cancel button, so any
// "are you sure?" logic attached to that button still runs.

const MODAL_SELECTOR = ".modal-card";
const POPOVER_SELECTOR = ".command-panel, .notification-panel, .device-share-panel";
const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type=hidden])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])"
].join(", ");

let headingIdCounter = 0;

function isVisible(element) {
  return Boolean(element.offsetWidth || element.offsetHeight || element.getClientRects().length);
}

function focusableIn(container) {
  return Array.from(container.querySelectorAll(FOCUSABLE)).filter(isVisible);
}

function topmost(selector) {
  const all = document.querySelectorAll(selector);
  return all.length ? all[all.length - 1] : null;
}

function findCloseControl(dialog) {
  const labelled = dialog.querySelector("[aria-label='Close'], [aria-label='Dismiss']");
  if (labelled) return labelled;
  return Array.from(dialog.querySelectorAll("button")).find(button => /^(close|cancel)$/i.test(button.textContent.trim())) || null;
}

function labelDialog(dialog, modal) {
  if (!dialog.getAttribute("role")) dialog.setAttribute("role", "dialog");
  if (modal) dialog.setAttribute("aria-modal", "true");
  if (!dialog.getAttribute("aria-label") && !dialog.getAttribute("aria-labelledby")) {
    const heading = dialog.querySelector("h1, h2, h3, h4, strong");
    if (heading) {
      if (!heading.id) {
        headingIdCounter += 1;
        heading.id = `dialog-heading-${headingIdCounter}`;
      }
      dialog.setAttribute("aria-labelledby", heading.id);
    }
  }
}

function focusFirstField(dialog) {
  const fields = focusableIn(dialog);
  const preferred = fields.find(element => element.matches("input, select, textarea")) || fields[0];
  if (preferred) {
    preferred.focus({ preventScroll: false });
  } else {
    dialog.setAttribute("tabindex", "-1");
    dialog.focus();
  }
}

export default function useDialogManager() {
  useEffect(() => {
    const open = new Map(); // dialog element -> element focused before it opened
    let lastFocused = document.activeElement;

    function rememberFocus(event) {
      if (!event.target.closest?.(`${MODAL_SELECTOR}, ${POPOVER_SELECTOR}`)) lastFocused = event.target;
    }

    function sync() {
      const current = new Set([...document.querySelectorAll(`${MODAL_SELECTOR}, ${POPOVER_SELECTOR}`)]);
      current.forEach(dialog => {
        if (open.has(dialog)) return;
        const modal = dialog.matches(MODAL_SELECTOR);
        open.set(dialog, lastFocused);
        // Some pop-ups are a <form>, which can't carry the dialog role, so
        // the role goes on the backdrop wrapped round it.
        const labelTarget = modal ? dialog.closest(".modal-backdrop") || dialog : dialog;
        labelDialog(labelTarget, modal);
        // Search already focuses its own box; other drop-downs leave focus on
        // their button so arrowing through the header still works.
        if (modal && !dialog.contains(document.activeElement)) focusFirstField(dialog);
      });
      open.forEach((opener, dialog) => {
        if (current.has(dialog)) return;
        open.delete(dialog);
        const stillOpen = topmost(MODAL_SELECTOR);
        if (opener && document.contains(opener) && !stillOpen) opener.focus({ preventScroll: true });
      });
    }

    function onKeyDown(event) {
      const modal = topmost(MODAL_SELECTOR);
      const popover = modal ? null : topmost(POPOVER_SELECTOR);
      const dialog = modal || popover;
      if (!dialog) return;

      if (event.key === "Escape") {
        const close = findCloseControl(dialog);
        if (close) {
          event.preventDefault();
          close.click();
        }
        return;
      }

      if (event.key === "Tab" && modal) {
        const fields = focusableIn(modal);
        if (!fields.length) {
          event.preventDefault();
          return;
        }
        const first = fields[0];
        const last = fields[fields.length - 1];
        if (!modal.contains(document.activeElement)) {
          event.preventDefault();
          first.focus();
        } else if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }

    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener("focusin", rememberFocus);
    document.addEventListener("keydown", onKeyDown);
    sync();
    return () => {
      observer.disconnect();
      document.removeEventListener("focusin", rememberFocus);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);
}
