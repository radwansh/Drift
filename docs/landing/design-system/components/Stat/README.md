# Stat

A KPI card for the Dashboard: a label, one hero figure, and how it moved since the previous period.

## Use

- Three or four in a row at the top of the Dashboard and the Annual Salaries Dashboard; never more than one row.
- The value uses the `kpi` style (Instrument Sans 600, 36px, tabular figures). Abbreviate only above a million ("€1.28M"), and keep the full figure in the tooltip or Detailed View.
- The foot pairs a `Variance` with a caption naming the comparison period ("vs March 2026"). A card without a comparison has no foot.
- Card: `surface`, 1px `line` outline, `radius-lg`, `space-5` padding. No shadow, no coloured top border, no icon tile.

## The consumer provides

`label`, a pre-formatted `value`, `variance` (the props for `Variance`) and `caption`.
