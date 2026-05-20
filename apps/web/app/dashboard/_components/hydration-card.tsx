import { useEffect, useMemo, useState } from "react";
import { Droplets, Pencil, Trash2 } from "lucide-react";
import { clampProgress, formatNumber } from "../utils";
import type { AsyncResourceState, MutationState, WaterTodayResponse } from "../wellness-types";

type HydrationCardProps = {
  state: AsyncResourceState<WaterTodayResponse>;
  mutationState: MutationState;
  onRefresh: () => void;
  onAddWater: (amountMl: number) => Promise<boolean>;
  onEditWaterLog: (logId: string, amountMl: number) => Promise<boolean>;
  onRemoveWaterLog: (logId: string) => Promise<boolean>;
  onSaveGoal: (targetMl: number) => Promise<boolean>;
  onClearMutationError: () => void;
};

const quickAddAmounts = [250, 500, 750];

function formatLogTime(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "--:--";
  }
  return parsed.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function HydrationCard({
  state,
  mutationState,
  onRefresh,
  onAddWater,
  onEditWaterLog,
  onRemoveWaterLog,
  onSaveGoal,
  onClearMutationError,
}: HydrationCardProps) {
  const [customAmountInput, setCustomAmountInput] = useState("300");
  const [goalInput, setGoalInput] = useState("2500");
  const [editingLogId, setEditingLogId] = useState<string | null>(null);
  const [editingAmountInput, setEditingAmountInput] = useState("250");

  const hydrationData = state.status === "success" || state.status === "empty" ? state.data : null;
  const isMutating = mutationState.status === "pending";
  const progressPercent = clampProgress(hydrationData?.progress_percent ?? 0);

  useEffect(() => {
    if (hydrationData) {
      setGoalInput(String(hydrationData.goal_ml));
    }
  }, [hydrationData?.goal_ml, hydrationData]);

  const recentLogs = useMemo(() => {
    if (!hydrationData) {
      return [];
    }
    return hydrationData.logs.slice(0, 5);
  }, [hydrationData]);

  return (
    <section className="rounded-3xl border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Droplets className="h-4 w-4 text-sky-500" />
          <h2 className="text-base font-semibold">Hydration</h2>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          className="rounded-lg border px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
        >
          Refresh
        </button>
      </div>

      {state.status === "loading" && !hydrationData ? (
        <div className="mt-4 space-y-2 text-sm text-muted-foreground">
          <p>Loading hydration summary...</p>
        </div>
      ) : null}

      {state.status === "error" ? (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
          <p>{state.error}</p>
          <button
            type="button"
            onClick={onRefresh}
            className="mt-2 rounded-lg border border-red-300 bg-white px-2 py-1 text-xs dark:border-red-700 dark:bg-transparent"
          >
            Retry
          </button>
        </div>
      ) : null}

      {hydrationData ? (
        <>
          <div className="mt-4 flex items-center justify-between gap-4">
            <div
              className="relative h-24 w-24 rounded-full"
              style={{
                background: `conic-gradient(rgb(14 165 233) ${progressPercent}%, hsl(var(--muted)) ${progressPercent}% 100%)`,
              }}
            >
              <div className="absolute inset-[6px] flex items-center justify-center rounded-full bg-card text-sm font-semibold">
                {Math.round(hydrationData.progress_percent)}%
              </div>
            </div>
            <div className="flex-1 space-y-2 text-sm">
              <p className="text-muted-foreground">
                {formatNumber(hydrationData.today_total_ml)} / {formatNumber(hydrationData.goal_ml)} ml
              </p>
              <p className="font-medium text-foreground">{formatNumber(hydrationData.remaining_ml)} ml remaining today</p>
              <p className="text-xs text-muted-foreground">
                {hydrationData.logs.length} log{hydrationData.logs.length === 1 ? "" : "s"} today
              </p>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2">
            {quickAddAmounts.map((amount) => (
              <button
                key={amount}
                type="button"
                disabled={isMutating}
                onClick={() => {
                  void onAddWater(amount);
                }}
                className="rounded-xl border bg-background px-2 py-2 text-xs font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
              >
                +{amount} ml
              </button>
            ))}
          </div>

          <form
            className="mt-3 flex items-end gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              const parsed = Number(customAmountInput);
              if (!Number.isFinite(parsed) || parsed < 50 || parsed > 3000) {
                return;
              }
              void onAddWater(Math.round(parsed));
            }}
          >
            <label className="flex-1 text-xs text-muted-foreground">
              Custom water (ml)
              <input
                type="number"
                min={50}
                max={3000}
                value={customAmountInput}
                disabled={isMutating}
                onChange={(event) => setCustomAmountInput(event.target.value)}
                className="mt-1 w-full rounded-xl border bg-background px-3 py-2 text-sm"
              />
            </label>
            <button
              type="submit"
              disabled={isMutating}
              className="rounded-xl bg-primary px-3 py-2 text-xs font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60"
            >
              Add
            </button>
          </form>

          <form
            className="mt-3 flex items-end gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              const parsed = Number(goalInput);
              if (!Number.isFinite(parsed) || parsed < 1200 || parsed > 6000) {
                return;
              }
              void onSaveGoal(Math.round(parsed));
            }}
          >
            <label className="flex-1 text-xs text-muted-foreground">
              Daily goal (ml)
              <input
                type="number"
                min={1200}
                max={6000}
                value={goalInput}
                disabled={isMutating}
                onChange={(event) => setGoalInput(event.target.value)}
                className="mt-1 w-full rounded-xl border bg-background px-3 py-2 text-sm"
              />
            </label>
            <button
              type="submit"
              disabled={isMutating}
              className="rounded-xl border bg-background px-3 py-2 text-xs font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
            >
              Save
            </button>
          </form>

          {mutationState.status === "error" ? (
            <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-2 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
              <div className="flex items-center justify-between gap-2">
                <span>{mutationState.error}</span>
                <button
                  type="button"
                  onClick={onClearMutationError}
                  className="rounded border border-red-300 px-1.5 py-0.5 text-[10px] dark:border-red-700"
                >
                  Dismiss
                </button>
              </div>
            </div>
          ) : null}

          <div className="mt-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Recent water logs</p>
            {recentLogs.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">No logs yet. Start with a quick add.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {recentLogs.map((log) => {
                  const isEditing = editingLogId === log.id;
                  return (
                    <li key={log.id} className="rounded-xl border bg-background p-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium">{formatNumber(log.amount_ml)} ml</p>
                        <p className="text-xs text-muted-foreground">{formatLogTime(log.logged_at)}</p>
                      </div>

                      {isEditing ? (
                        <form
                          className="mt-2 flex items-end gap-2"
                          onSubmit={(event) => {
                            event.preventDefault();
                            const parsed = Number(editingAmountInput);
                            if (!Number.isFinite(parsed) || parsed < 50 || parsed > 3000) {
                              return;
                            }
                            void onEditWaterLog(log.id, Math.round(parsed)).then((success) => {
                              if (success) {
                                setEditingLogId(null);
                              }
                            });
                          }}
                        >
                          <input
                            type="number"
                            min={50}
                            max={3000}
                            value={editingAmountInput}
                            onChange={(event) => setEditingAmountInput(event.target.value)}
                            className="w-full rounded-lg border px-2 py-1 text-xs"
                          />
                          <button
                            type="submit"
                            disabled={isMutating}
                            className="rounded-lg bg-primary px-2 py-1 text-xs text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingLogId(null)}
                            className="rounded-lg border px-2 py-1 text-xs"
                          >
                            Cancel
                          </button>
                        </form>
                      ) : (
                        <div className="mt-2 flex items-center justify-end gap-2">
                          <button
                            type="button"
                            disabled={isMutating}
                            onClick={() => {
                              setEditingLogId(log.id);
                              setEditingAmountInput(String(log.amount_ml));
                            }}
                            className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            <Pencil className="h-3 w-3" />
                            Edit
                          </button>
                          <button
                            type="button"
                            disabled={isMutating}
                            onClick={() => {
                              void onRemoveWaterLog(log.id);
                            }}
                            className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-900/60 dark:hover:bg-red-950/30"
                          >
                            <Trash2 className="h-3 w-3" />
                            Delete
                          </button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      ) : null}
    </section>
  );
}
