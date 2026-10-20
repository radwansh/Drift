# Icon

The built-in stroke icons the components use: 20px grid, 1.75 stroke, round caps and joins, drawn in `currentColor`.

## Use

- 16px inside buttons, badges and table cells (`icon-sm`); 20px standalone and in navigation (`icon-md`).
- Icons inherit the text colour. Give a meaningful icon a `title`; decorative ones stay hidden from assistive tech.
- For anything beyond this set, use Lucide at `strokeWidth` 1.75 so new icons match. No filled, duotone or emoji icons.

## The consumer provides

`name` (one of the set), `size`, and `title` when the icon stands alone.
