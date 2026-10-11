## What and why

<!-- What changed, and which finding or step from docs/ANNUAL_REVIEW_45c9f13.md it addresses. -->

## Acceptance check

<!-- Paste the acceptance check from the plan step and the output proving it passes. -->

## Gates

- [ ] `pnpm lint` passes
- [ ] `pnpm typecheck` reports 0 errors
- [ ] `pnpm test` passes
- [ ] `pnpm build` passes
- [ ] CI green on this branch
- [ ] Vercel preview green

## Correctness

- [ ] Every new tenant-scoped query filters by `companyId`
- [ ] Raw SQL rows are parsed with a zod schema, not cast with `as unknown as`
- [ ] Money read from Postgres `numeric` is converted at the boundary, not deeper
- [ ] New `packages/*` code satisfies `noUncheckedIndexedAccess`
- [ ] Company-wide writes are behind the editor-only procedure
- [ ] Migrations are idempotent (`IF NOT EXISTS` / guarded `DO $$`) and re-run cleanly

## Risk

- [ ] Migration included — a rollback plan is written below
- [ ] No change to an already-applied migration file

<!-- Rollback / notes: -->
