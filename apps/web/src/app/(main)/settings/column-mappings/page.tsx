"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useColumnMappings } from "@/hooks/use-column-mappings";
import { Plus, Trash2, Save, Download, Upload, TestTube, Check, X, Edit3 } from "lucide-react";
import type { ColumnMapping } from "@saas/types";

interface EditableMapping {
  sourceColumn: string;
  mappedComponent: string;
  isEmployeeId: boolean;
  isEmployeeName: boolean;
  isDepartment: boolean;
  isGrossSalary: boolean;
  isNetSalary: boolean;
}

export default function ColumnMappingsPage() {
  const { mappings, saveMappings, isMapping } = useColumnMappings();
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
      { sourceColumn: "", mappedComponent: "", isEmployeeId: false, isEmployeeName: false, isDepartment: false, isGrossSalary: false, isNetSalary: false },
    ]);
    setEditIndex(localMappings.length);
  };

  const updateMapping = (index: number, field: keyof EditableMapping, value: string | boolean) => {
    setLocalMappings((prev) =>
      prev.map((m, i) => (i === index ? { ...m, [field]: value } : m)),
    );
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
      } catch {}
    };
    input.click();
  };

  const displayMappings = isEditing ? localMappings : mappings;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Column Mappings</h2>
          <p className="text-muted-foreground mt-1">Manage how CSV/XLSX columns map to salary components</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExportJson}>
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
          <Button variant="outline" size="sm" onClick={handleImportJson}>
            <Upload className="h-4 w-4 mr-2" />
            Import
          </Button>
          {!isEditing ? (
            <Button size="sm" onClick={startEditing}>
              <Edit3 className="h-4 w-4 mr-2" />
              Edit
            </Button>
          ) : (
            <>
              <Button size="sm" variant="outline" onClick={cancelEditing}>
                <X className="h-4 w-4 mr-2" />
                Cancel
              </Button>
              <Button size="sm" onClick={handleSave} disabled={isMapping}>
                <Save className="h-4 w-4 mr-2" />
                {isMapping ? "Saving..." : "Save"}
              </Button>
            </>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>{displayMappings.length} Mapping{displayMappings.length !== 1 ? "s" : ""}</span>
            {isEditing && (
              <Button variant="outline" size="sm" onClick={addMapping}>
                <Plus className="h-4 w-4 mr-2" />
                Add Mapping
              </Button>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Source Column</TableHead>
                <TableHead>Mapped Component</TableHead>
                <TableHead>Identifiers</TableHead>
                <TableHead className="w-24"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {displayMappings.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                    No mappings configured. Add a mapping to get started.
                  </TableCell>
                </TableRow>
              ) : (
                displayMappings.map((mapping, index) => (
                  <TableRow key={index}>
                    <TableCell>
                      {isEditing && editIndex === index ? (
                        <Input
                          value={mapping.sourceColumn}
                          onChange={(e) => updateMapping(index, "sourceColumn", e.target.value)}
                          className="h-8"
                        />
                      ) : (
                        <span className="font-medium">{mapping.sourceColumn}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {isEditing && editIndex === index ? (
                        <Input
                          value={mapping.mappedComponent}
                          onChange={(e) => updateMapping(index, "mappedComponent", e.target.value)}
                          className="h-8"
                        />
                      ) : (
                        <code className="rounded bg-muted px-1.5 py-0.5 text-sm">
                          {mapping.mappedComponent}
                        </code>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {(mapping as any).isEmployeeId && <Badge variant="outline" className="text-[10px]">ID</Badge>}
                        {(mapping as any).isEmployeeName && <Badge variant="outline" className="text-[10px]">Name</Badge>}
                        {(mapping as any).isDepartment && <Badge variant="outline" className="text-[10px]">Dept</Badge>}
                        {(mapping as any).isGrossSalary && <Badge variant="outline" className="text-[10px]">Gross</Badge>}
                        {(mapping as any).isNetSalary && <Badge variant="outline" className="text-[10px]">Net</Badge>}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {isEditing && editIndex !== index && (
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditIndex(index)}>
                            <Edit3 className="h-4 w-4" />
                          </Button>
                        )}
                        {isEditing && editIndex === index && (
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-green-600" onClick={() => setEditIndex(null)}>
                            <Check className="h-4 w-4" />
                          </Button>
                        )}
                        {editIndex === index && (
                          <div className="flex gap-1">
                            <Button
                              variant={mapping.isEmployeeId ? "default" : "outline"} size="sm" className="h-7 text-[10px] px-2"
                              onClick={() => toggleFlag(index, "isEmployeeId")}
                            >
                              ID
                            </Button>
                            <Button
                              variant={mapping.isEmployeeName ? "default" : "outline"} size="sm" className="h-7 text-[10px] px-2"
                              onClick={() => toggleFlag(index, "isEmployeeName")}
                            >
                              Name
                            </Button>
                            <Button
                              variant={mapping.isDepartment ? "default" : "outline"} size="sm" className="h-7 text-[10px] px-2"
                              onClick={() => toggleFlag(index, "isDepartment")}
                            >
                              Dept
                            </Button>
                            <Button
                              variant={mapping.isGrossSalary ? "default" : "outline"} size="sm" className="h-7 text-[10px] px-2"
                              onClick={() => toggleFlag(index, "isGrossSalary")}
                            >
                              Gross
                            </Button>
                            <Button
                              variant={mapping.isNetSalary ? "default" : "outline"} size="sm" className="h-7 text-[10px] px-2"
                              onClick={() => toggleFlag(index, "isNetSalary")}
                            >
                              Net
                            </Button>
                          </div>
                        )}
                        {isEditing && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            onClick={() => setDeleteIndex(index)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => alert("Test Mapping: This will validate mappings against a sample file.")}>
          <TestTube className="h-4 w-4 mr-2" />
          Test Mapping
        </Button>
      </div>

      <ConfirmDialog
        open={deleteIndex !== null}
        onOpenChange={(open) => { if (!open) setDeleteIndex(null); }}
        title="Delete Mapping"
        description="Are you sure you want to delete this column mapping?"
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={removeMapping}
      />
    </div>
  );
}
