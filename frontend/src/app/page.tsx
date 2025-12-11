"use client";

import clsx from "clsx";
import {
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ChangeEvent,
} from "react";
import {
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  Cell,
  Legend,
} from "recharts";
import { formatCurrency, getTotals, getWarnings } from "@/lib/budget";
import {
  useBudgetStore,
  SyncStatus,
  type BudgetFields,
  type BudgetSnapshot,
} from "@/store/budgetStore";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:4000";

type ExpenseField = Exclude<keyof BudgetFields, "income">;

const CATEGORY_FIELDS: Array<{ key: ExpenseField; label: string }> = [
  { key: "monthlyBills", label: "Monthly Bills" },
  { key: "food", label: "Food" },
  { key: "transport", label: "Transport" },
  { key: "subscriptions", label: "Subscriptions" },
  { key: "miscellaneous", label: "Miscellaneous" },
];

const COLORS = ["#2563eb", "#10b981", "#f97316", "#8b5cf6", "#ef4444"];

const subscribeOnline = (callback: () => void) => {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
};

const getOnlineSnapshot = () =>
  typeof navigator !== "undefined" ? navigator.onLine : true;

function useOnlineStatus() {
  // useSyncExternalStore avoids hydration mismatches for env-based values
  const isOnline = useSyncExternalStore(
    subscribeOnline,
    getOnlineSnapshot,
    () => true
  );
  // return null on first SSR render to keep markup stable
  const [hasHydrated, setHasHydrated] = useState(false);
  // safe: just marks client hydration to delay showing status text
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setHasHydrated(true), []);
  return hasHydrated ? isOnline : null;
}

const statusLabel: Record<SyncStatus, string> = {
  "local-only": "Local Only",
  "sync-pending": "Sync Pending",
  synced: "Synced",
};

const statusColor: Record<SyncStatus, string> = {
  "local-only": "bg-amber-100 text-amber-900 border-amber-200",
  "sync-pending": "bg-blue-100 text-blue-900 border-blue-200",
  synced: "bg-emerald-100 text-emerald-900 border-emerald-200",
};

export default function Home() {
  const {
    budget,
    updateField,
    syncStatus,
    setSyncStatus,
    markSynced,
    hydrateFromServer,
    lastUpdatedAt,
    lastSyncedAt,
    userEmail,
    setUserEmail,
    authToken,
    setAuthToken,
    history,
    addSnapshot,
    restoreSnapshot,
  } = useBudgetStore();

  const online = useOnlineStatus();
  const [password, setPassword] = useState("HireMe@2025!");
  const [message, setMessage] = useState<string | null>(null);
  const [loadingSync, setLoadingSync] = useState(false);
  const [loadingFetch, setLoadingFetch] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    // rehydrate persisted store on mount (Zustand persist)
    useBudgetStore.persist?.rehydrate();
  }, []);

  useEffect(() => {
    if (online === null) return;
    if (!online) {
      setMessage("Offline mode: all edits are saved locally.");
    } else {
      setMessage(null);
    }
  }, [online]);

  const totals = useMemo(() => getTotals(budget), [budget]);
  const warnings = useMemo(() => getWarnings(budget), [budget]);

  const chartData = CATEGORY_FIELDS.map((field) => ({
    name: field.label,
    value: budget[field.key],
  })).filter((item) => item.value > 0);

  const onFieldChange = (key: ExpenseField | "income") =>
    (event: ChangeEvent<HTMLInputElement>) => {
      const next = Number(event.target.value ?? 0);
      updateField(key, Number.isNaN(next) ? 0 : next);
    };

  const login = async () => {
    try {
      setAuthError(null);
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: userEmail, password }),
      });
      if (!res.ok) {
        throw new Error("Invalid demo credentials");
      }
      const data = await res.json();
      setAuthToken(data.token);
      setMessage("Authenticated with backend for sync.");
    } catch (err) {
      setAuthError(
        err instanceof Error ? err.message : "Unable to login to backend"
      );
    }
  };

  const syncToServer = async () => {
    setLoadingSync(true);
    setMessage(null);
    setSyncStatus("sync-pending");
    try {
      const res = await fetch(`${API_BASE}/budget/sync`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({ budget, email: userEmail }),
      });
      if (!res.ok) {
        throw new Error("Sync failed");
      }
      const data = await res.json();
      markSynced(data.timestamp ?? new Date().toISOString());
      setMessage("Synced to server successfully.");
    } catch (err) {
      setMessage(
        err instanceof Error ? err.message : "Could not sync — data is safe locally."
      );
      setSyncStatus("local-only");
    } finally {
      setLoadingSync(false);
    }
  };

  const fetchLatest = async () => {
    setLoadingFetch(true);
    setMessage(null);
    try {
      const res = await fetch(
        `${API_BASE}/budget/latest?email=${encodeURIComponent(userEmail)}`
      );
      const data = await res.json();
      if (data.budget) {
        hydrateFromServer(data.budget, data.updatedAt ?? undefined);
        setMessage("Pulled latest server version.");
      } else {
        setMessage("No server copy found — still local-first.");
      }
    } catch (err) {
      setMessage(
        err instanceof Error
          ? err.message
          : "Could not fetch server copy — working offline."
      );
    } finally {
      setLoadingFetch(false);
    }
  };

  const downloadJson = (filename: string, payload: unknown) => {
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white text-slate-900">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-blue-500">
              Offline-First
            </p>
            <h1 className="text-3xl font-semibold text-slate-900">
              BudgetBox — Personal Budgeting
            </h1>
            <p className="text-sm text-slate-600">
              Auto-saves every keystroke locally. Works offline like Google Docs.
            </p>
          </div>
          <div className="flex flex-col gap-2 text-sm">
            <div
              className={clsx(
                "inline-flex w-fit items-center gap-2 rounded-full px-3 py-1 text-xs font-medium",
                online ?? true
                  ? "bg-emerald-100 text-emerald-800"
                  : "bg-rose-100 text-rose-800"
              )}
            >
              <span className="h-2 w-2 rounded-full bg-current" />
              {online === null
                ? "Loading status..."
                : online
                  ? "Online"
                  : "Offline — saving to IndexedDB"}
            </div>
            <div
              className={clsx(
                "inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium",
                statusColor[syncStatus]
              )}
            >
              <span className="h-2 w-2 rounded-full bg-current" />
              Sync Status: {statusLabel[syncStatus]}
            </div>
          </div>
        </header>

        {message && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
            {message}
          </div>
        )}

        <section className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-blue-500">
                  Monthly Budget
                </p>
                <p className="text-sm text-slate-600">
                  Auto-saved locally (IndexedDB) on each keystroke.
                </p>
              </div>
              <div className="text-right text-xs text-slate-500">
                <p>Last saved: {lastUpdatedAt ? new Date(lastUpdatedAt).toLocaleTimeString() : "—"}</p>
                <p>Last synced: {lastSyncedAt ? new Date(lastSyncedAt).toLocaleTimeString() : "—"}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-2">
                <span className="text-sm font-medium text-slate-800">Income</span>
                <input
                  type="number"
                  inputMode="decimal"
                  className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none ring-blue-200 focus:bg-white focus:ring-2"
                  value={budget.income}
                  onChange={onFieldChange("income")}
                  min={0}
                />
              </label>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {CATEGORY_FIELDS.map((field, idx) => (
                <label key={field.key} className="flex flex-col gap-2">
                  <span className="text-sm font-medium text-slate-800">
                    {idx + 1}. {field.label}
                  </span>
                  <input
                    type="number"
                    inputMode="decimal"
                    className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none ring-blue-200 focus:bg-white focus:ring-2"
                    value={budget[field.key]}
                    onChange={onFieldChange(field.key)}
                    min={0}
                  />
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-sm font-semibold text-slate-800">Sync with server</p>
            <p className="text-xs text-slate-600">
              Local-first by default. Use sync to push/pull when you are online.
            </p>
            <div className="space-y-2">
              <label className="flex flex-col gap-1">
                <span className="text-xs text-slate-600">Email</span>
                <input
                  className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none ring-blue-200 focus:bg-white focus:ring-2"
                  value={userEmail}
                  onChange={(e) => setUserEmail(e.target.value)}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-slate-600">Password (demo)</span>
                <input
                  type="password"
                  className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none ring-blue-200 focus:bg-white focus:ring-2"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
              <button
                onClick={login}
                className="w-full rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
                disabled={!online}
              >
                {online ? "Login to backend" : "Offline: login later"}
              </button>
              {authError && (
                <p className="text-xs text-rose-600">{authError}</p>
              )}
              <div className="h-px bg-slate-200" />
              <button
                onClick={syncToServer}
                disabled={loadingSync || !online}
                className="w-full rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {loadingSync ? "Syncing..." : online ? "Sync now" : "Offline — queue"}
              </button>
              <button
                onClick={fetchLatest}
                disabled={loadingFetch}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {loadingFetch ? "Fetching..." : "Pull latest copy"}
              </button>
              <ul className="text-xs text-slate-600">
                <li>Local Only: saved to IndexedDB</li>
                <li>Sync Pending: edits waiting for network</li>
                <li>Synced: server & local aligned</li>
              </ul>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-2">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard title="Burn Rate" value={(totals.burnRate || 0).toFixed(2)} />
              <StatCard title="Total Spend" value={formatCurrency(totals.expenses)} />
              <StatCard title="Savings Potential" value={formatCurrency(totals.savings)} positive />
              <StatCard title="Month-End Prediction" value={formatCurrency(totals.monthEndPrediction)} />
            </div>
            <div className="h-72 rounded-lg border border-slate-100 bg-slate-50 p-4">
              {chartData.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={chartData}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={50}
                      outerRadius={90}
                      paddingAngle={2}
                    >
                      {chartData.map((_, index) => (
                        <Cell key={index} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Legend />
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-sm text-slate-600">
                  Start entering expenses to see category breakdown.
                </p>
              )}
            </div>
          </div>

          <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-sm font-semibold text-slate-800">Anomaly warnings</p>
            <div className="space-y-2 text-sm text-slate-700">
              {warnings.length === 0 ? (
                <p className="text-slate-500">No anomalies detected yet.</p>
              ) : (
                warnings.map((warn) => (
                  <div
                    key={warn}
                    className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900"
                  >
                    {warn}
                  </div>
                ))
              )}
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-800">History / Export</p>
              <button
                onClick={() => {
                  addSnapshot();
                  setMessage("Snapshot saved locally.");
                }}
                className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-800 transition hover:bg-slate-50"
              >
                Save snapshot
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() =>
                  downloadJson(
                    `budgetbox-current-${new Date().toISOString()}.json`,
                    { budget, lastUpdatedAt }
                  )
                }
                className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-slate-800"
              >
                Export current JSON
              </button>
            </div>
            <div className="space-y-2">
              {history.length === 0 ? (
                <p className="text-sm text-slate-500">No snapshots yet.</p>
              ) : (
                history.map((snap: BudgetSnapshot) => (
                  <div
                    key={snap.id}
                    className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  >
                    <div>
                      <p className="font-semibold text-slate-800">
                        {new Date(snap.timestamp).toLocaleString()}
                      </p>
                      <p className="text-xs text-slate-500">
                        Income {formatCurrency(snap.budget.income)} · Spend{" "}
                        {formatCurrency(
                          snap.budget.monthlyBills +
                            snap.budget.food +
                            snap.budget.transport +
                            snap.budget.subscriptions +
                            snap.budget.miscellaneous
                        )}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => restoreSnapshot(snap.id)}
                        className="rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-800 transition hover:bg-slate-50"
                      >
                        Restore
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function StatCard({
  title,
  value,
  positive,
}: {
  title: string;
  value: string;
  positive?: boolean;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <p className="text-xs text-slate-500">{title}</p>
      <p
        className={clsx(
          "text-lg font-semibold",
          positive ? "text-emerald-700" : "text-slate-900"
        )}
      >
        {value}
      </p>
    </div>
  );
}
