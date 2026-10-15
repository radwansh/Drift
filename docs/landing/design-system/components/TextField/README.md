# TextField

A labelled single-line input with an optional affix, hint or error; set `mono` for amounts, IDs and codes.

## Use

- Every field has a visible `label` (13px `label` style). Placeholders show an example, never the label.
- `prefix`/`suffix` for units and fixed parts: "€", "%", "EMP-". They render in Geist Mono and `ink-subtle`.
- `mono` switches the value to Geist Mono with tabular figures; use it for thresholds, amounts and column keys.
- The control is outlined in `border` (3:1), turns `accent` with the `focus-ring` on focus, and `danger` when invalid.

## Content

- Hints say what the value does ("Changes below this amount are not flagged."), in one sentence.
- Errors say what is wrong and how to fix it, and start with the icon: "No column named NET_PAY in April 2026.xlsx."

## The consumer provides

`label`, `value`/`onChange` (or `defaultValue`), `hint` or `error`, `id` when a form library needs a stable one, and any native input props (`type`, `inputMode`, `required`).
