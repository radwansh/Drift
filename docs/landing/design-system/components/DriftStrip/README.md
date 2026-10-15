# DriftStrip

Clarivo's signature device: a calm baseline of ticks with one tick drifted upward in signal rust, the picture of an unexpected payroll change.

## Use

- As a quiet brand mark: under the landing hero, in empty states ("No changes above your threshold"), on report covers and section dividers.
- As the loading state: `animate="scan"` runs a wave through the ticks (the Button's `loading` uses it). It respects `prefers-reduced-motion`.
- `animate="lift"` lifts the drifted tick into place once, for a moment of discovery (a comparison finishing).
- Baseline ticks are `delta-flat`; the drifted tick is `signal`. Exactly one tick drifts. Never colour two.
- Sizes: `xs` inside buttons, `sm` inline with text, `md` default, `lg` for heroes and covers.

## The consumer provides

`count` (ticks), `drift` (which one, defaults to 70% along), `size`, `animate`, and `label` when the strip carries meaning (otherwise it is hidden from assistive tech).
