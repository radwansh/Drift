"use client";

import { useState, useEffect } from "react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Bookmark, Save, Trash2, Check } from "lucide-react";
import type { ColumnConfig } from "./column-picker";

const STORAGE_KEY = "saas-saved-views";

interface SavedView {
  id: string;
  name: string;
  columns: ColumnConfig[];
}

interface SavedViewsProps {
  currentColumns: ColumnConfig[];
  onApplyView: (columns: ColumnConfig[]) => void;
}

export function SavedViews({ currentColumns, onApplyView }: SavedViewsProps) {
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [viewName, setViewName] = useState("");
  const [deleteViewId, setDeleteViewId] = useState<string | null>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setSavedViews(JSON.parse(stored));
      }
    } catch {
      // ignore parse errors
    }
  }, []);

  const persistViews = (views: SavedView[]) => {
    setSavedViews(views);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(views));
  };

  const handleSaveView = () => {
    if (!viewName.trim()) return;
    const newView: SavedView = {
      id: crypto.randomUUID?.() ?? `${Date.now()}`,
      name: viewName.trim(),
      columns: currentColumns,
    };
    persistViews([...savedViews, newView]);
    setViewName("");
    setSaveDialogOpen(false);
  };

  const handleApplyView = (view: SavedView) => {
    setActiveViewId(view.id);
    onApplyView(view.columns);
  };

  const handleDeleteView = () => {
    if (!deleteViewId) return;
    const updated = savedViews.filter((v) => v.id !== deleteViewId);
    persistViews(updated);
    if (activeViewId === deleteViewId) {
      setActiveViewId(null);
    }
    setDeleteViewId(null);
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm">
            <Bookmark className="h-4 w-4 mr-2" />
            Saved Views
            {activeViewId && (
              <span className="ml-1.5 rounded-md bg-primary/20 px-1.5 py-0.5 text-xs text-primary">
                {savedViews.find((v) => v.id === activeViewId)?.name ?? ""}
              </span>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuLabel>Saved Views</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {savedViews.length === 0 && (
            <div className="px-2 py-4 text-center text-sm text-muted-foreground">
              No saved views yet
            </div>
          )}
          {savedViews.map((view) => (
            <div key={view.id} className="flex items-center gap-1 pr-1">
              <DropdownMenuItem
                className="flex-1"
                onClick={() => handleApplyView(view)}
              >
                {activeViewId === view.id && (
                  <Check className="h-3.5 w-3.5 mr-2 text-primary" />
                )}
                {view.name}
              </DropdownMenuItem>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <button
                    onClick={() => setDeleteViewId(view.id)}
                    className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete View</AlertDialogTitle>
                    <AlertDialogDescription>
                      Are you sure you want to delete &ldquo;{view.name}&rdquo;? This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel onClick={() => setDeleteViewId(null)}>
                      Cancel
                    </AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleDeleteView}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          ))}
          <DropdownMenuSeparator />
          <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
            <DialogTrigger asChild>
              <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                <Save className="h-4 w-4 mr-2" />
                Save Current View
              </DropdownMenuItem>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Save Current View</DialogTitle>
                <DialogDescription>
                  Give your current column configuration a name to reuse it later.
                </DialogDescription>
              </DialogHeader>
              <Input
                placeholder="e.g., Standard View, Executive View"
                value={viewName}
                onChange={(e) => setViewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveView();
                }}
                autoFocus
              />
              <DialogFooter>
                <Button variant="outline" onClick={() => setSaveDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleSaveView} disabled={!viewName.trim()}>
                  Save
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
