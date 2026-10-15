# Logo

The Clarivo logo as inline SVG: the Drift C symbol, the wordmark, or both as the horizontal lockup.

## Use

- `lockup` in the app header (height 24 to 28px) and on the landing page (32px); `mark` alone at 32px and below, and wherever the name is already on screen; `wordmark` where a square mark would crowd (document footers, partner lists).
- `tone="auto"` follows the `ink` and `signal` tokens, so it flips with the theme. Use `brand` to pin Ink on light, `reversed` (white) on photography or `surface-inverse`, `mono` for one-colour contexts (it takes `currentColor`).
- One signal per mark: in the lockup the rust lives in the symbol and the i's square is ink; the wordmark alone carries the rust square.
- Below 24px use the favicon cut from the Logos assets, not this component.
- Accessible name defaults to "Clarivo"; pass `title` to change it, or wrap it in the link that names the destination.

## The consumer provides

`variant`, `tone`, `height` in px (width follows the aspect ratio) and an optional `title`.
