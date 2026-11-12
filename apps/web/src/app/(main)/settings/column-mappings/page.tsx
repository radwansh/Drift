"use client";

import { useState } from "react";
import { Check, Pencil } from "lucide-react";
import { Badge, Button, EmptyState, PageHeader, Panel, PanelBar } from "@/components/cv";
import { SettingsTabs } from "@/components/settings/settings-tabs";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useColumnMappings } from "@/hooks/use-column-mappings";
import { isSnapshotField, type SnapshotField } from "@saas/types";
import { usePayrollStore } from "@/lib/payroll-store";

/**
 * Settings · Column mappings — board "Settings: column mappings", screen 8 of
 * the Ink & Signal rebuild.
 *
 * The table, its edit mode, the JSON import and export and the delete
 * confirmation are the ones that were here. What the rebuild changes is what
 * each column is called and what it is allowed to claim:
 *
 * - **Type** replaces the bare "Identifiers" chips. A column's role is the same
 *   four-way model the upload wizard enforces (`mapping-row.tsx`, step 9, and
 *   the `company_column_mappings_one_role` constraint): a record role
 *   (hire date, termination date, FTE), a reporting dimension, one of the five
 *   identifier flags, or a pay component. Deriving it here from the same fields
 *   means the two screens cannot describe one column differently.
 * - **Status** is the board's third column and it is real data, not a new
 *   concept: `isAiSuggested` is "AI suggestion", and `mappedComponent ===
 *   "ignore"` is the wizard's own way of saying a column is not imported, so it
 *   reads "Do not import". Anything else was confirmed by a person.
 * - **In Detailed View** names what the checkbox does. It writes
 *   `componentVisibility` in `usePayrollStore`, which exactly one screen reads
 *   — `/detailed`, through `buildColumnConfig` — so "Visible" over an eye icon
 *   was a promise about every screen that only one screen keeps. (It is React
 *   state, not a preference: it resets on reload. That is unchanged here.)
 *
 * Two columns the board asks for are **not** here, because nothing in
 * `company_column_mappings` can answer them: **Sample**, which needs the file
 * the mapping came from, and **Matches employees**, which is the `isEmployeeId`
 * bit already shown in Type and would be the same fact twice. The board's
 * "Confirm n suggestions" button is absent for the same reason — accepting a
 * suggestion is a write this page has no handler for, and a button that only
 * looks like one is worse than none.
 *
 * The five identifier toggles move from the actions column into the Type cell
 * while a row is being edited: same buttons, same handlers, next to the value
 * they change rather than next to Delete.
 */

interface EditableMapping {
  sourceColumn: string;
  mappedComponent: string;
  isEmployeeId: boolean;
  isEmployeeName: boolean;
  isDepartment: boolean;
  isGrossSalary: boolean;
  isNetSalary: boolean;
  /**
   * Step 9. Carried through, not edited here: the upload wizard's mapping step
   * is where a column's role is chosen. Dropping them on the way through would
   * silently wipe an admin's date and dimension mappings the first time they
   * renamed anything on this page.
   */
  snapshotField: SnapshotField | null;
  dimensionName: string | null;
  isAiSuggested: boolean;
}

/**
 * A row as the table reads it.
 *
 * Structural rather than `ColumnMapping | EditableMapping`, because a saved row
 * arrives from Postgres through tRPC with `snapshotField` as plain `string |
 * null` — the reason `startEditing` narrows it with `isSnapshotField` rather
 * than casting, and the reason the old table reached for `as any` five times to
 * read the identifier flags off the union.
 */
interface DisplayMapping {
  sourceColumn: string;
  mappedComponent: string;
  isEmployeeId: boolean;
  isEmployeeName: boolean;
  isDepartment: boolean;
  isGrossSalary: boolean;
  isNetSalary: boolean;
  snapshotField?: string | null;
  dimensionName?: string | null;
  isAiSuggested: boolean;
}

const SNAPSHOT_FIELD_LABELS: Record<SnapshotField, string> = {
  hire_date: "Hire date",
  termination_date: "Termination date",
  fte: "FTE",
};

/** The five identifier flags, in the order the upload wizard lists them. */
const IDENTIFIER_FLAGS = [
  { key: "isEmployeeId", short: "ID", label: "Employee id" },
  { key: "isEmployeeName", short: "Name", label: "Employee name" },
  { key: "isDepartment", short: "Dept", label: "Department" },
  { key: "isGrossSalary", short: "Gross", label: "Gross pay" },
  { key: "isNetSalary", short: "Net", label: "Net pay" },
] as const satisfies readonly { key: keyof EditableMapping; short: string; label: string }[];

const COLUMN_COUNT = 6;

export default function ColumnMappingsPage() {
  const { mappings, saveMappings, isMapping } = useColumnMappings();
  const { componentVisibility, setComponentVisibility } = usePayrollStore();
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [deleteIndex, setDeleteIndex] = useState<number | null>(null);
  const [localMappings, setLocalMappings] = useState<EditableMapping[]>([]);
  const [isEditing, setIsEditing] = useState(false);

  const startEditing = () => {
    setLocalMappings(
      mappings.map((m) => ({
        sourceColumn: m.sourceColumn,
        mappedComponent: m.mappedComponent,
        isEmployeeId: m.isEmployeeId,
        isEmployeeName: m.isEmployeeName,
        isDepartment: m.isDepartment,
        isGrossSalary: m.isGrossSalary,
        isNetSalary: m.isNetSalary,
        // The row comes back from Postgres as plain text, so narrow it rather
        // than casting: a value outside the set is not one this page can keep.
        snapshotField: isSnapshotField(m.snapshotField) ? m.snapshotField : null,
        dimensionName: m.dimensionName ?? null,
        isAiSuggested: m.isAiSuggested,
      })),
    );
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setIsEditing(false);
    setLocalMappings([]);
    setEditIndex(null);
  };

  const handleSave = async () => {
    await saveMappings(localMappings);
    setIsEditing(false);
    setEditIndex(null);
  };

  const addMapping = () => {
    setLocalMappings((prev) => [
      ...prev,
      {
        sourceColumn: "",
        mappedComponent: "",
        isEmployeeId: false,
        isEmployeeName: false,
        isDepartment: false,
        isGrossSalary: false,
        isNetSalary: false,
        snapshotField: null,
        dimensionName: null,
        isAiSuggested: false,
      },
    ]);
    setEditIndex(localMappings.length);
  };

  const updateMapping = (index: number, field: keyof EditableMapping, value: string | boolean) => {
    setLocalMappings((prev) => prev.map((m, i) => (i === index ? { ...m, [field]: value } : m)));
  };

  const removeMapping = () => {
    if (deleteIndex === null) return;
    if (isEditing) {
      setLocalMappings((prev) => prev.filter((_, i) => i !== deleteIndex));
      if (editIndex === deleteIndex) setEditIndex(null);
      else if (editIndex !== null && editIndex > deleteIndex) setEditIndex(editIndex - 1);
    }
    setDeleteIndex(null);
  };

  const toggleFlag = (index: number, flag: keyof EditableMapping) => {
    updateMapping(index, flag, !localMappings[index][flag]);
  };

  const handleExportJson = () => {
    const data = isEditing ? localMappings : mappings;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "column-mappings.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportJson = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const text = await file.text();
      try {
        const imported = JSON.parse(text) as EditableMapping[];
        setLocalMappings(imported);
        setIsEditing(true);
      } catch {
        // Malformed or non-JSON file: leave the existing mappings untouched.
      }
    };
    input.click();
  };

  const displayMappings: DisplayMapping[] = isEditing ? localMappings : mappings;
  const mappingBeingDeleted = deleteIndex === null ? undefined : displayMappings[deleteIndex];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Settings"
        title="Column mappings"
        lede="How the columns in your payroll file become salary components, identifiers and reporting dimensions."
        actions={
          <>
            <Button variant="secondary" size="sm" iconLeft="download" onClick={handleExportJson}>
              Export
            </Button>
            <Button variant="secondary" size="sm" iconLeft="upload" onClick={handleImportJson}>
              Import
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                alert("Test with a file: this will validate your mappings against a sample file.")
              }
            >
              Test with a file
            </Button>
            {!isEditing ? (
              <Button size="sm" icon={<Pencil aria-hidden="true" />} onClick={startEditing}>
                Edit
              </Button>
            ) : (
              <>
                <Button variant="ghost" size="sm" onClick={cancelEditing}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={() => void handleSave()}
                  disabled={isMapping}
                  loading={isMapping}
                >
                  {isMapping ? "Saving…" : "Save"}
                </Button>
              </>
            )}
          </>
        }
      />

      <SettingsTabs />

      <Panel flush>
        <PanelBar className="justify-between">
          <p className="m-0 text-[13px] leading-[18px] text-cv-ink-muted">
            {displayMappings.length} mapping{displayMappings.length === 1 ? "" : "s"}
            {isEditing ? " · editing" : ""}
          </p>
          {isEditing && (
            <Button variant="secondary" size="sm" onClick={addMapping}>
              Add mapping
            </Button>
          )}
        </PanelBar>

        <div className="overflow-x-auto">
          <Table className="min-w-[900px]">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Column in your file</TableHead>
                <TableHead>Maps to</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="w-36">In Detailed View</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-28 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {displayMappings.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={COLUMN_COUNT} className="p-0">
                    <EmptyState
                      bare
                      title="No column mappings yet"
                      description="Upload a payroll file and the wizard's mapping step writes them, or add one here."
                      action={
                        isEditing ? (
                          <Button onClick={addMapping}>Add mapping</Button>
                        ) : (
                          <Button icon={<Pencil aria-hidden="true" />} onClick={startEditing}>
                            Edit
                          </Button>
                        )
                      }
                    />
                  </TableCell>
                </TableRow>
              ) : (
                displayMappings.map((mapping, index) => {
                  const rowEditing = isEditing && editIndex === index;
                  const visible = componentVisibility[mapping.mappedComponent] !== false;
                  const name = mapping.sourceColumn || "this column";

                  return (
                    <TableRow key={index}>
                      <TableCell>
                        {rowEditing ? (
                          <Input
                            value={mapping.sourceColumn}
                            aria-label="Column in your file"
                            onChange={(e) => updateMapping(index, "sourceColumn", e.target.value)}
                            className="h-8"
                          />
                        ) : (
                          <span className="font-medium text-cv-ink">{mapping.sourceColumn}</span>
                        )}
                      </TableCell>

                      <TableCell>
                        {rowEditing ? (
                          <Input
                            value={mapping.mappedComponent}
                            aria-label="Maps to"
                            onChange={(e) =>
                              updateMapping(index, "mappedComponent", e.target.value)
                            }
                            className="h-8"
                          />
                        ) : (
                          <span className="rounded-cv-sm bg-cv-surface-sunken px-1.5 py-0.5 font-cv-mono text-xs leading-5 text-cv-ink-muted">
                            {mapping.mappedComponent}
                          </span>
                        )}
                      </TableCell>

                      <TableCell>
                        {rowEditing ? (
                          <div className="flex flex-wrap gap-1">
                            {IDENTIFIER_FLAGS.map((flag) => {
                              const on = mapping[flag.key] === true;
                              return (
                                <Button
                                  key={flag.key}
                                  variant={on ? "primary" : "secondary"}
                                  size="sm"
                                  aria-pressed={on}
                                  aria-label={`${flag.label} column`}
                                  className="h-7 px-2 text-xs"
                                  onClick={() => toggleFlag(index, flag.key)}
                                >
                                  {flag.short}
                                </Button>
                              );
                            })}
                          </div>
                        ) : (
                          <TypeCell mapping={mapping} />
                        )}
                      </TableCell>

                      <TableCell>
                        <label className="flex cursor-pointer items-center gap-2 text-[13px] leading-[18px] text-cv-ink-muted">
                          <Checkbox
                            checked={visible}
                            onCheckedChange={(checked) =>
                              setComponentVisibility(mapping.mappedComponent, checked === true)
                            }
                            aria-label={`Show ${name} in the Detailed View`}
                          />
                          {visible ? "Shown" : "Hidden"}
                        </label>
                      </TableCell>

                      <TableCell>
                        <MappingStatus mapping={mapping} />
                      </TableCell>

                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          {isEditing && !rowEditing && (
                            <Button
                              variant="ghost"
                              size="sm"
                              iconOnly
                              icon={<Pencil aria-hidden="true" />}
                              aria-label={`Edit ${name}`}
                              onClick={() => setEditIndex(index)}
                            />
                          )}
                          {rowEditing && (
                            <Button
                              variant="ghost"
                              size="sm"
                              iconOnly
                              icon={<Check aria-hidden="true" />}
                              aria-label={`Done editing ${name}`}
                              onClick={() => setEditIndex(null)}
                            />
                          )}
                          {isEditing && (
                            <Button
                              variant="ghost"
                              size="sm"
                              iconOnly
                              iconLeft="trash"
                              aria-label={`Delete ${name}`}
                              onClick={() => setDeleteIndex(index)}
                            />
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </Panel>

      <ConfirmDialog
        open={deleteIndex !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteIndex(null);
        }}
        title={
          mappingBeingDeleted?.sourceColumn
            ? `Delete the mapping for ${mappingBeingDeleted.sourceColumn}?`
            : "Delete this column mapping?"
        }
        description="It goes when you save. The column stays in your file, and nothing already imported changes."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={removeMapping}
      />
    </div>
  );
}

/**
 * What the column is, in the wizard's four-way model: a record role, a reporting
 * dimension, one or more identifiers, or a pay component.
 */
function TypeCell({ mapping }: { mapping: DisplayMapping }) {
  const identifiers = IDENTIFIER_FLAGS.filter((flag) => mapping[flag.key] === true);

  if (isSnapshotField(mapping.snapshotField)) {
    return <Badge tone="neutral">{SNAPSHOT_FIELD_LABELS[mapping.snapshotField]}</Badge>;
  }
  if (mapping.dimensionName) {
    return <Badge tone="neutral">Dimension · {mapping.dimensionName}</Badge>;
  }
  if (identifiers.length > 0) {
    return (
      <div className="flex flex-wrap gap-1">
        {identifiers.map((flag) => (
          <Badge key={flag.key} tone="neutral">
            {flag.label}
          </Badge>
        ))}
      </div>
    );
  }
  return <span className="text-[13px] leading-[18px] text-cv-ink-subtle">Pay component</span>;
}

/** AI suggestion, confirmed by a person, or deliberately not imported. */
function MappingStatus({ mapping }: { mapping: DisplayMapping }) {
  if (!mapping.mappedComponent || mapping.mappedComponent === "ignore") {
    return <Badge tone="neutral">Do not import</Badge>;
  }
  if (mapping.isAiSuggested) {
    return <Badge tone="accent">AI suggestion</Badge>;
  }
  return (
    <Badge tone="success" icon="check">
      Confirmed
    </Badge>
  );
}
