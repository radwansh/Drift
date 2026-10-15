# Button

The one action control: the Ink `primary` button for the main action of an app view, the cobalt `accent` button for the website's sign-up call to action, `secondary` and `ghost` for everything else, `danger` only to confirm a destructive step.

## Use

- One `primary` per app view, for the thing the screen is for ("Compare periods" on upload).
- On the website, every sign-up button is the `accent` variant with the same label, "Get early access", so visitors meet one action throughout. Its partner ("Sign in", "See how it works") is `secondary`.
- Pass `href` when the button goes somewhere (sign-up, sign-in, an anchor, a mailto): it renders a real link with the same look.
- `secondary` (outlined in `border`) for alternatives next to it; `ghost` for tertiary actions in toolbars and table rows.
- `danger` (`danger` fill, `danger-hover` on hover) only inside the confirmation step of a destructive action. "Cancel" is never `danger`.
- Sizes: `md` 40px by default; `sm` 32px inside tables and toolbars; `lg` 48px for marketing CTAs and touch layouts.
- Never fill a button with `signal` rust. Rust means *change*, not *action*.

## Content

- Verb first, sentence case, two or three words: "Upload payroll", "Map columns", "Export CSV". No exclamation marks, no trailing ellipsis.
- Icons are 16px. `iconLeft` names the object of the verb (`upload`, `download`); `iconRight` is only `arrow-right` on forward-moving CTAs.

## The consumer provides

- `children` (the label) and `onClick`; `type="submit"` inside forms.
- `aria-label` on `iconOnly` buttons (a string child is used if you pass one).
- `loading` while work runs: the icon becomes the scanning drift strip and `aria-busy` is set. Keep the label.

## States

Hover darkens to `primary-hover` or tints with `surface-sunken`. Keyboard focus draws `focus-ring`. Disabled buttons use `surface-sunken`, `line` and `ink-disabled`; prefer explaining why an action is unavailable over disabling it silently.
