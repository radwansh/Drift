"use client";

import { useEffect, useId, useRef } from "react";
import { Icon } from "./ui";
import { EarlyAccessForm } from "./early-access-form";

/**
 * The early-access form in a dialog. The form itself lives in
 * early-access-form.tsx and is shared with /waitlist.
 *
 * A native `<dialog>` opened with `showModal()` rather than a fixed-position
 * div: native gets the focus trap, the Escape key, the inert background and
 * the top layer right without a line of code for any of them — the same
 * reasoning as the header's `<details>` menu.
 *
 * The form is mounted only while open, which is also how it resets: a closed
 * and reopened dialog is a fresh form, with no state to clear by hand.
 */
interface EarlyAccessModalProps {
  open: boolean;
  onClose: () => void;
}

export function EarlyAccessModal({ open, onClose }: EarlyAccessModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingId = useId();

  // showModal() is what puts the dialog in the top layer and makes the rest of
  // the page inert; the `open` attribute alone does neither.
  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={headingId}
      // Escape fires the dialog's own close event, so the state is synced here
      // rather than with a key handler.
      onClose={onClose}
      // A backdrop click targets the dialog itself; a click on the card inside
      // targets a child.
      onClick={(e) => {
        if (e.target === dialogRef.current) onClose();
      }}
      className="max-w-[min(30rem,calc(100vw-2rem))] rounded-cv-xl border border-cv-line bg-cv-surface p-0 text-cv-ink shadow-cv-lg backdrop:bg-black/50"
    >
      <div className="relative p-8">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-cv-md text-cv-ink-subtle hover:bg-cv-surface-sunken hover:text-cv-ink focus-visible:outline-none focus-visible:shadow-cv-focus-ring"
        >
          <Icon name="x" size={18} />
        </button>

        {open && <EarlyAccessForm headingId={headingId} headingLevel={2} onDone={onClose} />}
      </div>
    </dialog>
  );
}
