"use client";

import { useState, useCallback, useEffect } from "react";

export interface ColumnViewConfig {
  component: string;
  visible: boolean;
  mode: "current" | "previous" | "side_by_side" | "delta_only";
}

export interface SavedView {
  id: string;
  name: string;
  columnConfig: ColumnViewConfig[];
  createdAt: string;
}

const STORAGE_KEY = "salarycompare_saved_views";

function loadViews(): SavedView[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeViews(views: SavedView[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(views));
  } catch {}
}

export function useSavedViews() {
  const [views, setViews] = useState<SavedView[]>([]);
  const [currentView, setCurrentView] = useState<string | null>(null);

  useEffect(() => {
    setViews(loadViews());
  }, []);

  const saveView = useCallback((name: string, columnConfig: ColumnViewConfig[]) => {
    const newView: SavedView = {
      id: crypto.randomUUID(),
      name,
      columnConfig,
      createdAt: new Date().toISOString(),
    };
    const updated = [...views, newView];
    setViews(updated);
    writeViews(updated);
    setCurrentView(newView.id);
    return newView;
  }, [views]);

  const loadView = useCallback((id: string): SavedView | null => {
    const view = views.find((v) => v.id === id) ?? null;
    if (view) setCurrentView(id);
    return view;
  }, [views]);

  const deleteView = useCallback((id: string) => {
    const updated = views.filter((v) => v.id !== id);
    setViews(updated);
    writeViews(updated);
    if (currentView === id) setCurrentView(null);
  }, [views, currentView]);

  return {
    views,
    saveView,
    loadView,
    deleteView,
    currentView,
  };
}
