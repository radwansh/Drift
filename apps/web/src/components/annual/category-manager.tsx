"use client";

import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { CATEGORY_LABELS, EARNING_CATEGORIES, type Category } from "@saas/payroll-core";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  SelectGroup,
  SelectLabel,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Tags, Loader2, Search, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatComponentName, formatMoney } from "@/components/annual/annual-utils";

/**
 * Categories grouped with a one-line description each, so a user choosing a
 * bucket can tell what it does to the dashboard (step 40).
 */
const CATEGORY_GROUPS: { label: string; categories: Category[] }[] = [
  {
    label: "Earnings — count toward gross",
    categories: ["base_salary", "allowance", "bonus_commission", "overtime", "other_earning"],
  },
  {
    label: "Employee deductions — gross to net",
    categories: ["income_tax", "social_security_employee", "other_deduction", "absence_deduction"],
  },
  {
    label: "Employer costs — on top of gross",
    categories: ["social_security_employer", "other_employer_cost"],
  },
  { label: "Quantities — never money", categories: ["absence_days", "other_quantity"] },
  { label: "Excluded", categories: ["ignore", "uncategorised"] },
];

const CATEGORY_HINTS: Partial<Record<Category, string>> = {
  base_salary: "Contractual base pay",
  allowance: "Housing, transport, meals",
  bonus_commission: "Variable, non-recurring",
  overtime: "Paid overtime",
  other_earning: "Any other earning",
  income_tax: "Withheld from the employee",
  social_security_employee: "Employee's own contribution",
  other_deduction: "Loans, union dues, insurance",
  absence_deduction: "Unpaid leave, lateness",
  social_security_employer: "Employer's contribution",
  other_employer_cost: "Levies, training funds",
  absence_days: "A count of days, not money",
  other_quantity: "Hours or other counts",
  ignore: "Totals columns, excluded entirely",
  uncategorised: "Not yet decided",
};

type SortKey = "amount" | "name";

interface CategoryManagerProps {
  year: number;
  currency: string;
  periodType: "monthly" | "weekly" | "bi_monthly" | "bi_weekly";
  hasUncategorised: boolean;
  /** Incrementing this opens the dialog from elsewhere on the page. */
  openSignal?: number;
}

export function CategoryManager({
  year,
  currency,
  periodType,
  hasUncategorised,
  openSignal = 0,
}: CategoryManagerProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Record<string, Category>>({});
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [onlyUncategorised, setOnlyUncategorised] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("amount");
  const [bulkCategory, setBulkCategory] = useState<Category | "">("");

  useEffect(() => {
    if (openSignal > 0) setOpen(true);
  }, [openSignal]);

  const utils = trpc.useUtils();
  const categoriesQuery = trpc.annual.listComponentCategories.useQuery(
    { year, currency, periodType },
    { enabled: open, retry: 1 },
  );
  const saveMutation = trpc.annual.setComponentCategories.useMutation();
  const resetMutation = trpc.annual.resetComponentCategory.useMutation();

  const data = categoriesQuery.data;

  // Seed once per distinct payload rather than on every object identity change,
  // which discarded in-progress edits on any refetch (finding C18).
  const seedKey = data?.categories.map((c) => `${c.componentKey}:${c.category}`).join("|") ?? "";
  useEffect(() => {
    if (!data) return;
    setDraft(Object.fromEntries(data.categories.map((c) => [c.componentKey, c.category])));
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedKey]);

  const visible = useMemo(() => {
    const rows = data?.categories ?? [];
    const needle = search.trim().toLowerCase();
    const filtered = rows.filter((r) => {
      if (onlyUncategorised && (draft[r.componentKey] ?? r.category) !== "uncategorised") return false;
      if (!needle) return true;
      return r.componentKey.toLowerCase().includes(needle);
    });
    return filtered.sort((a, b) =>
      sortKey === "amount"
        ? Math.abs(b.amountToDate) - Math.abs(a.amountToDate)
        : a.componentKey.localeCompare(b.componentKey),
    );
  }, [data, search, onlyUncategorised, sortKey, draft]);

  const changes = useMemo(() => {
    if (!data) return [];
    return data.categories
      .filter((c) => draft[c.componentKey] && draft[c.componentKey] !== c.category)
      .map((c) => ({ componentKey: c.componentKey, category: draft[c.componentKey]! }));
  }, [data, draft]);

  /**
   * What saving would do to gross, shown before the user commits (step 40).
   *
   * Moving a component into or out of an earnings category changes gross for the
   * whole company and every figure derived from it, so the consequence should be
   * visible at the point of decision.
   */
  const grossDelta = useMemo(() => {
    if (!data) return 0;
    const isEarning = (c: Category) => (EARNING_CATEGORIES as readonly Category[]).includes(c);
    return data.categories.reduce((acc, row) => {
      const next = draft[row.componentKey];
      if (!next || next === row.category) return acc;
      const was = isEarning(row.category) ? row.amountToDate : 0;
      const now = isEarning(next) ? row.amountToDate : 0;
      return acc + (now - was);
    }, 0);
  }, [data, draft]);

  const saving = saveMutation.isPending;

  function applyBulk() {
    if (!bulkCategory) return;
    setDraft((prev) => {
      const next = { ...prev };
      for (const row of visible) next[row.componentKey] = bulkCategory;
      return next;
    });
  }

  async function handleSave() {
    if (changes.length === 0) {
      setOpen(false);
      return;
    }
    setError(null);
    try {
      // One request for all of them (finding C14).
      await saveMutation.mutateAsync({ entries: changes });
      await Promise.all([
        utils.annual.getSummary.invalidate(),
        utils.annual.listComponentCategories.invalidate(),
      ]);
      setOpen(false);
    } catch (err) {
      setError(
        err instanceof Error && err.message.includes("admin or manager")
          ? "Changing categories requires the admin or manager role."
          : "Could not save categories. Please try again.",
      );
    }
  }

  async function handleReset(componentKey: string) {
    try {
      const result = await resetMutation.mutateAsync({ componentKey });
      setDraft((prev) => ({ ...prev, [componentKey]: result.category }));
      await utils.annual.listComponentCategories.invalidate();
    } catch {
      setError("Could not reset that component.");
    }
  }

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant={hasUncategorised ? "default" : "outline"}
        onClick={() => setOpen(true)}
      >
        <Tags className="mr-2 h-4 w-4" aria-hidden="true" />
        Categorise components
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Categorise components</DialogTitle>
            <DialogDescription>
              Every component column in your payroll belongs to a category. Choices apply to all
              periods, for {year} and {currency}.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-wrap items-center gap-2 border-b pb-3">
            <div className="relative min-w-0 flex-1">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search components"
                aria-label="Search components"
                className="h-9 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>

            <label className="inline-flex items-center gap-2 text-sm">
              <Checkbox
                checked={onlyUncategorised}
                onCheckedChange={(v) => setOnlyUncategorised(v === true)}
                aria-label="Show only uncategorised components"
              />
              Uncategorised only
            </label>

            <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
              <SelectTrigger className="w-36" aria-label="Sort components">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="amount">By amount</SelectItem>
                <SelectItem value="name">By name</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Bulk assign, so a long tail of similar columns is one action. */}
          {visible.length > 1 && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground">
                Set all {visible.length} shown to
              </span>
              <Select value={bulkCategory} onValueChange={(v) => setBulkCategory(v as Category)}>
                <SelectTrigger className="w-52" aria-label="Bulk category">
                  <SelectValue placeholder="Choose a category" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORY_GROUPS.map((group) => (
                    <SelectGroup key={group.label}>
                      <SelectLabel>{group.label}</SelectLabel>
                      {group.categories.map((c) => (
                        <SelectItem key={c} value={c}>
                          {CATEGORY_LABELS[c]}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
              <Button size="sm" variant="outline" disabled={!bulkCategory} onClick={applyBulk}>
                Apply
              </Button>
            </div>
          )}

          <div className="max-h-[50vh] min-h-[16rem] overflow-y-auto pr-1">
            {categoriesQuery.isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full" />
                ))}
              </div>
            ) : categoriesQuery.isError ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Could not load component categories. Please try again.
              </p>
            ) : visible.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {data && data.categories.length === 0
                  ? "No component columns found yet. Upload a payroll period to discover components."
                  : "No components match the current filter."}
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {visible.map((row) => {
                  const label = formatComponentName(row.componentKey);
                  const current = draft[row.componentKey] ?? row.category;
                  const changed = current !== row.category;
                  return (
                    <div
                      key={row.componentKey}
                      className={cn(
                        "flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3",
                        changed && "border-primary",
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{label}</p>
                        <p className="truncate text-xs tabular-nums text-muted-foreground">
                          {formatMoney(row.amountToDate, currency)} to date · {row.componentKey}
                        </p>
                        {/* The rule that matched, so an automatic choice can be
                            understood rather than guessed at. */}
                        {row.source === "auto" && (
                          <p className="truncate text-xs text-muted-foreground">
                            Matched automatically by rule &ldquo;{row.autoRule}&rdquo;
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {row.source === "saved" ? (
                          <Badge variant="secondary">Saved</Badge>
                        ) : row.category === "uncategorised" ? (
                          <Badge
                            variant="secondary"
                            className="bg-amber-500/15 text-amber-700 dark:text-amber-300"
                          >
                            Uncategorised
                          </Badge>
                        ) : (
                          <Badge variant="outline">Auto</Badge>
                        )}

                        <Select
                          value={current}
                          onValueChange={(v) =>
                            setDraft((prev) => ({ ...prev, [row.componentKey]: v as Category }))
                          }
                        >
                          <SelectTrigger className="w-52" aria-label={`Category for ${label}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {CATEGORY_GROUPS.map((group) => (
                              <SelectGroup key={group.label}>
                                <SelectLabel>{group.label}</SelectLabel>
                                {group.categories.map((c) => (
                                  <SelectItem key={c} value={c}>
                                    <span>{CATEGORY_LABELS[c]}</span>
                                    {CATEGORY_HINTS[c] && (
                                      <span className="ml-2 text-xs text-muted-foreground">
                                        {CATEGORY_HINTS[c]}
                                      </span>
                                    )}
                                  </SelectItem>
                                ))}
                              </SelectGroup>
                            ))}
                          </SelectContent>
                        </Select>

                        {row.source === "saved" && (
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label={`Reset ${label} to the automatic category`}
                            disabled={resetMutation.isPending}
                            onClick={() => handleReset(row.componentKey)}
                          >
                            <RotateCcw className="h-4 w-4" aria-hidden="true" />
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter className="flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
              {changes.length === 0
                ? "No changes yet."
                : grossDelta === 0
                  ? `${changes.length} change${changes.length === 1 ? "" : "s"}. Gross is unaffected.`
                  : `${changes.length} change${changes.length === 1 ? "" : "s"}. Gross to date would ${
                      grossDelta > 0 ? "rise" : "fall"
                    } by ${formatMoney(Math.abs(grossDelta), currency)}.`}
            </p>
            <div className="flex gap-2">
              <Button type="button" variant="outline" disabled={saving} onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                disabled={saving || changes.length === 0 || categoriesQuery.isLoading}
                onClick={handleSave}
              >
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
                Save{changes.length > 0 ? ` (${changes.length})` : ""}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
