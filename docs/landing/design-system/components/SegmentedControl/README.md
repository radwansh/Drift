# SegmentedControl

Two to five mutually exclusive options shown side by side, such as the payroll cadence or Dashboard versus Detailed View.

## Use

- Use it when every option fits on one line and switching is instant. More than five options, or options that need explanation: use a select.
- The canonical cadence order is Monthly, Bi-monthly, Bi-weekly, Weekly.
- The selected option sits on `surface` with `shadow-sm` inside a `surface-sunken` track; the others are `ink-muted`.
- `sm` (26px) inside table toolbars; `md` (32px thumbs) elsewhere.

## The consumer provides

`options` (strings or `{ value, label }`), `value` + `onChange` when controlled (or `defaultValue`), and `aria-label` naming the choice ("Payroll cadence"). Each option is a real `button` with `aria-pressed`.
