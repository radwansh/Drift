"use client";

import { useState, useEffect } from "react";
import { Bookmark, Check, Save, Trash2 } from "lucide-react";
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
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { buttonVariants } from "@/components/ui/button";
import { Badge, Button, TextField } from "@/components/cv";
import type { ColumnConfig } from "./column-picker";

/**
 * Saved column layouts for the Detailed View (canvas board "Detailed View",
 * the toolbar's "Saved views").
 *
 * **The storage key is unchanged.** It is `saas-saved-views`, which is what
 * this component has always written; `docs/design/SCREEN_MAP.md` and
 * CLAUDE.md both name `drift_saved_views`, but that key belongs to
 * `hooks/use-saved-views.ts`, which nothing imports. Renaming the key here
 * would silently empty every user's saved views, which is a behaviour change,
 * so the key stays and the discrepancy is recorded instead.
 *
 * Two structural fixes came with the re-skin, both of which made an existing
 * handler reachable rather than changing what it does:
 *
 * - the delete button carried `opacity-0 … group-hover:opacity-100` with no
 *   `group` ancestor, so it was invisible at every width and `handleDeleteView`
 *   could not be reached at all;
 * - both overlays lived inside `DropdownMenuContent`. A menu unmounts its
 *   content when it closes, so the confirmation that was supposed to open on
 *   that click went with it. They now sit outside the menu, driven by the
 *   `deleteViewId` and `saveDialogOpen` state that was already here.
 */

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

  const activeView = savedViews.find((v) => v.id === activeViewId) ?? null;
  const viewToDelete = savedViews.find((v) => v.id === deleteViewId) ?? null;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="secondary" icon={<Bookmark />}>
            Saved views
            {activeView && (
              <Badge tone="accent" className="ml-1.5">
                {activeView.name}
              </Badge>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          <DropdownMenuLabel>Saved views</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {savedViews.length === 0 && (
            <p className="m-0 px-2 py-4 text-center text-sm leading-5 text-cv-ink-subtle">
              No saved views yet
            </p>
          )}
          {savedViews.map((view) => (
            <div key={view.id} className="flex items-center gap-1 pr-1">
              <DropdownMenuItem className="flex-1" onClick={() => handleApplyView(view)}>
                {activeViewId === view.id && (
                  <Check className="mr-2 h-3.5 w-3.5 text-cv-accent" aria-hidden="true" />
                )}
                {view.name}
              </DropdownMenuItem>
              <button
                type="button"
                aria-label={`Delete ${view.name}`}
                onClick={() => setDeleteViewId(view.id)}
                className="inline-flex h-7 w-7 flex-none items-center justify-center rounded-cv-sm text-cv-ink-subtle transition-colors duration-[120ms] hover:bg-cv-danger-soft hover:text-cv-danger-ink focus-visible:shadow-cv-focus-ring focus-visible:outline-none"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setSaveDialogOpen(true)}>
            <Save className="mr-2 h-4 w-4" aria-hidden="true" />
            Save current view
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save current view</DialogTitle>
            <DialogDescription>
              Give this set of columns a name to reuse it later. It is kept in this browser.
            </DialogDescription>
          </DialogHeader>
          <TextField
            label="View name"
            placeholder="Standard view"
            value={viewName}
            onChange={(e) => setViewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSaveView();
            }}
            autoFocus
          />
          <DialogFooter>
            <Button variant="secondary" onClick={() => setSaveDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveView} disabled={!viewName.trim()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deleteViewId !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteViewId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {viewToDelete?.name ?? "this view"}?</AlertDialogTitle>
            <AlertDialogDescription>
              The columns on screen are not affected. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteViewId(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteView}
              className={buttonVariants({ variant: "destructive" })}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
