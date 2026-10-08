"use client";

import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { CATEGORY_LABELS, type Category } from "@saas/payroll-core";
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
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tags, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatComponentName, formatMoney } from "@/components/annual/annual-utils";

const CATEGORY_OPTIONS = (Object.keys(CATEGORY_LABELS) as Category[]).map((category) => ({
  value: category,
  label: CATEGORY_LABELS[category],
}));

interface CategoryManagerProps {
  currency: string;
  hasUncategorised: boolean;
}

export function CategoryManager({ currency, hasUncategorised }: CategoryManagerProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Record<string, Category>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const utils = trpc.useUtils();
  const categoriesQuery = trpc.annual.listComponentCategories.useQuery(undefined, {
    enabled: open,
    retry: 1,
  });
  const saveMutation = trpc.annual.setComponentCategory.useMutation();

  const data = categoriesQuery.data;

  useEffect(() => {
    if (!data) return;
    setDraft(Object.fromEntries(data.categories.map((c) => [c.componentKey, c.category])));
    setError(null);
  }, [data]);

  const changedCount = useMemo(() => {
    if (!data) return 0;
    return data.categories.filter((c) => draft[c.componentKey] && draft[c.componentKey] !== c.category).length;
  }, [data, draft]);

  async function handleSave() {
    if (!data) return;
    const changes = data.categories.filter((c) => draft[c.componentKey] && draft[c.componentKey] !== c.category);
    setSaving(true);
    setError(null);
    try {
      for (const c of changes) {
        await saveMutation.mutateAsync({ componentKey: c.componentKey, category: draft[c.componentKey]! });
      }
      await Promise.all([utils.annual.getSummary.invalidate(), utils.annual.listComponentCategories.invalidate()]);
      setOpen(false);
    } catch {
      setError("Could not save categories. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant={hasUncategorised ? "default" : "outline"}
        onClick={() => setOpen(true)}
        aria-label="Categorise components"
      >
        <Tags className="mr-2 h-4 w-4" />
        Categorise components
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Categorise components</DialogTitle>
            <DialogDescription>
              Every component column seen in your payroll is grouped into a category used by the annual
              dashboard. Saved choices apply to all periods.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[55vh] min-h-[16rem] overflow-y-auto pr-1">
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
            ) : data && data.categories.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No component columns found yet. Upload a payroll period to discover components.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {data?.categories.map((row) => {
                  const label = formatComponentName(row.componentKey);
                  const badge =
                    row.source === "saved"
                      ? { text: "Saved", className: "" }
                      : row.category === "uncategorised"
                        ? { text: "Uncategorised", className: "bg-amber-500/15 text-amber-700 dark:text-amber-300" }
                        : { text: "Auto", className: "" };
                  const original = row.category;
                  const changed = draft[row.componentKey] && draft[row.componentKey] !== original;
                  return (
                    <div
                      key={row.componentKey}
                      className={cn(
                        "flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3",
                        changed && "border-primary",
                      )}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium" title={row.componentKey}>
                          {label}
                        </p>
                        <p className="text-xs text-muted-foreground tabular-nums">
                          {formatMoney(row.amountToDate, currency)} to date · {row.componentKey}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className={badge.className}>
                          {badge.text}
                        </Badge>
                        <Select
                          value={draft[row.componentKey] ?? original}
                          onValueChange={(v) =>
                            setDraft((prev) => ({ ...prev, [row.componentKey]: v as Category }))
                          }
                        >
                          <SelectTrigger
                            className="w-44"
                            aria-label={`Category for ${label}`}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {CATEGORY_OPTIONS.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" disabled={saving} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={saving || changedCount === 0 || categoriesQuery.isLoading}
              onClick={handleSave}
            >
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save{changedCount > 0 ? ` (${changedCount})` : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}