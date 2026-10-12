import { requireDb } from "../client";
import { backfillPeriodComponentTotals } from "../aggregates/periodComponentTotals";

/**
 * Backfill script for step 31.
 *
 *   pnpm db:backfill-period-totals            # periods with no aggregates yet
 *   pnpm db:backfill-period-totals --force    # rebuild everything
 *   pnpm db:backfill-period-totals --limit 500
 *
 * Runs in bounded passes so a large history can be filled without holding one
 * long transaction open, and is safe to re-run: each period is deleted and
 * rebuilt atomically.
 */
async function main() {
  const db = requireDb();
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const limitArg = args.indexOf("--limit");
  const limit = limitArg >= 0 ? Number(args[limitArg + 1]) : 100;

  if (!Number.isInteger(limit) || limit < 1) {
    console.error("--limit must be a positive integer");
    process.exit(1);
  }

  console.log(`Backfilling period component totals (limit ${limit}${force ? ", force" : ""})…`);

  let totalRebuilt = 0;
  for (;;) {
    const ids = await backfillPeriodComponentTotals(db, { limit, force });
    totalRebuilt += ids.length;
    if (ids.length > 0) console.log(`  rebuilt ${ids.length} period(s)`);
    // `force` rebuilds the same newest N every pass, so it must not loop.
    if (ids.length < limit || force) break;
  }

  console.log(`Done. ${totalRebuilt} period(s) rebuilt.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
