# Notice

An inline message about the page or the task in progress: info, success, warning or danger, each with its icon.

## Use

- Place it above the content it is about, full width of that content. One notice per region.
- Tone sets the ground (`accent-soft`, `success-soft`, `warning-soft`, `danger-soft`) and the icon colour (`accent`, `success-ink`, `warning-ink`, `danger-ink`); the text stays `ink`.
- Danger notices are announced (`role="alert"`); the others are polite (`role="status"`).
- Errors are not variances. A rust signal means "this changed"; crimson danger means "this failed".

## Content

Title: what happened, in a few words ("2 columns need mapping"). Body: one or two sentences on what to do next. Put the fix in `action` as a `sm` secondary Button when there is one.

## The consumer provides

`tone`, `title`, `children` (the body) and an optional `action`.
