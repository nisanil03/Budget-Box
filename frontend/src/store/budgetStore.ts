"use client";

import localforage from "localforage";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export type BudgetFields = {
  income: number;
  monthlyBills: number;
  food: number;
  transport: number;
  subscriptions: number;
  miscellaneous: number;
};

export type SyncStatus = "local-only" | "sync-pending" | "synced";

export type BudgetSnapshot = {
  id: string;
  timestamp: string;
  budget: BudgetFields;
};

type BudgetState = {
  budget: BudgetFields;
  syncStatus: SyncStatus;
  lastUpdatedAt?: string;
  lastSyncedAt?: string;
  userEmail: string;
  authToken?: string | null;
  history: BudgetSnapshot[];
  updateField: (field: keyof BudgetFields, value: number) => void;
  setSyncStatus: (status: SyncStatus) => void;
  markSynced: (timestamp: string) => void;
  hydrateFromServer: (budget: BudgetFields, syncedAt?: string) => void;
  setUserEmail: (email: string) => void;
  setAuthToken: (token: string | null) => void;
  addSnapshot: (label?: string) => void;
  restoreSnapshot: (id: string) => void;
};

const initialBudget: BudgetFields = {
  income: 0,
  monthlyBills: 0,
  food: 0,
  transport: 0,
  subscriptions: 0,
  miscellaneous: 0,
};

export const useBudgetStore = create<BudgetState>()(
  persist(
    (set) => ({
      budget: initialBudget,
      syncStatus: "local-only",
      userEmail: "hire-me@anshumat.org",
      authToken: null,
      lastUpdatedAt: undefined,
      lastSyncedAt: undefined,
      history: [],
      updateField: (field, value) =>
        set((state) => ({
          budget: { ...state.budget, [field]: value },
          syncStatus:
            state.syncStatus === "synced" ? "sync-pending" : state.syncStatus,
          lastUpdatedAt: new Date().toISOString(),
        })),
      setSyncStatus: (status) => set({ syncStatus: status }),
      markSynced: (timestamp) =>
        set({
          syncStatus: "synced",
          lastSyncedAt: timestamp,
        }),
      hydrateFromServer: (budget, syncedAt) =>
        set({
          budget,
          syncStatus: "synced",
          lastSyncedAt: syncedAt ?? new Date().toISOString(),
        }),
      setUserEmail: (email) => set({ userEmail: email }),
      setAuthToken: (token) => set({ authToken: token }),
      addSnapshot: () =>
        set((state) => {
          const snapshot: BudgetSnapshot = {
            id: crypto.randomUUID(),
            timestamp: new Date().toISOString(),
            budget: { ...state.budget },
          };
          const nextHistory = [snapshot, ...state.history].slice(0, 20);
          return { history: nextHistory };
        }),
      restoreSnapshot: (id) =>
        set((state) => {
          const snap = state.history.find((h) => h.id === id);
          if (!snap) return state;
          return {
            budget: { ...snap.budget },
            syncStatus: "local-only",
            lastUpdatedAt: new Date().toISOString(),
          };
        }),
    }),
    {
      name: "budgetbox-store",
      storage: createJSONStorage(() => localforage),
      version: 1,
    }
  )
);

