# Badge

One or two words of status beside a row, a file or a period; the tone carries meaning, never decoration.

## Tones

| Tone | Means | Example |
| --- | --- | --- |
| `signal` | Changed since the previous period (with the square dot) | Changed |
| `accent` | Selected, current, new | Current period |
| `success` | Done or matched | Mapped |
| `warning` | Needs a decision | Needs review |
| `danger` | Failed or blocked | Upload failed |
| `neutral` | Everything else | Draft |

## Use

- Sentence case, no punctuation, at most two words.
- Text is the tone's `*-ink` token on its `*-soft` ground (4.5:1 in both themes); `neutral` is `ink-muted` on `surface-sunken`.
- Corners are `radius-sm` (4px): badges are labels, not pills. The dot is square, like the signal everywhere else.
- Never rely on tone alone in a table: the word must say it.
- Anomaly severity chips always pair the word with an icon: Warning is `signal` with `alert`, Info is `accent` with `info`, Data check is `neutral` with `search`.

## The consumer provides

`tone`, `children` (the words), `icon` for a 12px icon before the words, and `dot` to force the square dot on or off.
