# Variance

The signed change between two payroll periods (arrow, amount, optional percentage), coloured by direction and flagged when unexpected.

## Rules

- Direction comes from the sign of `value`: increases in `delta-up-ink` (signal rust) with an up arrow and "+", decreases in `delta-down-ink` (clarity cobalt) with a down arrow and a true minus sign (U+2212), zero as "No change" in `delta-flat-ink`.
- Colour never works alone: the arrow and the sign always say the direction, and screen readers hear "Increase" or "Decrease".
- `flagged` marks a change that breaks the customer's threshold: `signal-soft` tint plus the square signal mark. Flag only what needs a human look; if everything is flagged, nothing is.
- Set in Geist Mono with tabular figures and right-aligned in tables, so amounts line up digit by digit.
- Format with the customer's locale and currency (`currency="EUR"`, `locale="de-DE"`); two decimals for money, one for percentages.

## The consumer provides

`value` (current minus previous), `percent`, `currency`, `locale`, and `flagged` from the threshold logic. Pass `direction="flat"` for a change below the noise threshold.
