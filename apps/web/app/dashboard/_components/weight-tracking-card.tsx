import { useEffect, useMemo, useState } from "react";
import { Scale } from "lucide-react";
import { formatNumber } from "../utils";
import type { AsyncResourceState, MutationState, WeightTrackingSnapshot, WeightUnit } from "../wellness-types";

type WeightTrackingCardProps = {
  state: AsyncResourceState<WeightTrackingSnapshot>;
  mutationState: MutationState;
  selectedUnit: WeightUnit;
  onChangeUnit: (unit: WeightUnit) => void;
  onRefresh: () => void;
  onAddWeightLog: (params: { weight: number; unit?: WeightUnit; notes?: string }) => Promise<boolean>;
  onSaveWeightGoal: (params: { target_weight: number; unit?: WeightUnit }) => Promise<boolean>;
  onClearMutationError: () => void;
};

function formatLoggedAt(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "--";
  }
  return parsed.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function signedValue(value: number | null) {
  if (value === null) {
    return "--";
  }
  const sign = value > 0 ? "+" : "";
  return `${sign}${formatNumber(value)}`;
}

export function WeightTrackingCard({
  state,
  mutationState,
  selectedUnit,
  onChangeUnit,
  onRefresh,
  onAddWeightLog,
  onSaveWeightGoal,
  onClearMutationError,
}: WeightTrackingCardProps) {
  const [weightInput, setWeightInput] = useState("");
  const [notesInput, setNotesInput] = useState("");
  const [goalInput, setGoalInput] = useState("");
  const isMutating = mutationState.status === "pending";

  const hasData = state.status === "success" || state.status === "empty";
  const snapshot = hasData ? state.data : null;
  const summary = snapshot?.summary ?? null;
  const history = snapshot?.history ?? null;

  useEffect(() => {
    if (summary?.target_weight !== null && summary?.target_weight !== undefined) {
      setGoalInput(String(summary.target_weight));
    }
  }, [summary?.target_weight]);

  const recentLogs = useMemo(() => {
    if (!history) {
      return [];
    }
    return history.logs.slice(0, 5);
  }, [history]);

  return (
    <section className="rounded-3xl border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Scale className="h-4 w-4 text-violet-500" />
          <h2 className="text-base font-semibold">Weight tracking</h2>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          className="rounded-lg border px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
        >
          Refresh
        </button>
      </div>

      <div className="mt-3 inline-flex rounded-xl border bg-background p-1">
        <button
          type="button"
          onClick={() => onChangeUnit("kg")}
          className={`rounded-lg px-2 py-1 text-xs font-medium ${
            selectedUnit === "kg" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
          }`}
        >
          kg
        </button>
        <button
          type="button"
          onClick={() => onChangeUnit("lb")}
          className={`rounded-lg px-2 py-1 text-xs font-medium ${
            selectedUnit === "lb" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
          }`}
        >
          lb
        </button>
      </div>

      {state.status === "loading" && !snapshot ? <p className="mt-4 text-sm text-muted-foreground">Loading weight summary...</p> : null}

      {state.status === "error" ? (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
          <p>{state.error}</p>
        </div>
      ) : null}

      {summary ? (
        <>
          <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-xl border bg-background p-2">
              <p className="text-muted-foreground">Current</p>
              <p className="mt-1 text-sm font-semibold">
                {summary.current_weight === null ? "--" : `${formatNumber(summary.current_weight)} ${summary.unit}`}
              </p>
            </div>
            <div className="rounded-xl border bg-background p-2">
              <p className="text-muted-foreground">Target</p>
              <p className="mt-1 text-sm font-semibold">
                {summary.target_weight === null ? "--" : `${formatNumber(summary.target_weight)} ${summary.unit}`}
              </p>
            </div>
            <div className="rounded-xl border bg-background p-2">
              <p className="text-muted-foreground">From start</p>
              <p className="mt-1 text-sm font-semibold">{signedValue(summary.change_from_start)} {summary.unit}</p>
            </div>
            <div className="rounded-xl border bg-background p-2">
              <p className="text-muted-foreground">Remaining</p>
              <p className="mt-1 text-sm font-semibold">
                {summary.remaining_to_goal === null ? "--" : `${formatNumber(summary.remaining_to_goal)} ${summary.unit}`}
              </p>
            </div>
          </div>

          <p className="mt-3 text-xs text-muted-foreground">
            Goal progress: {summary.progress_percent === null ? "--" : `${summary.progress_percent}%`}
          </p>

          <form
            className="mt-3 space-y-2"
            onSubmit={(event) => {
              event.preventDefault();
              const parsed = Number(weightInput);
              if (!Number.isFinite(parsed) || parsed < 20 || parsed > 400) {
                return;
              }
              void onAddWeightLog({ weight: parsed, unit: selectedUnit, notes: notesInput }).then((success) => {
                if (success) {
                  setNotesInput("");
                }
              });
            }}
          >
            <label className="block text-xs text-muted-foreground">
              Log current weight ({selectedUnit})
              <input
                type="number"
                min={20}
                max={400}
                step={0.1}
                value={weightInput}
                disabled={isMutating}
                onChange={(event) => setWeightInput(event.target.value)}
                className="mt-1 w-full rounded-xl border bg-background px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-xs text-muted-foreground">
              Notes (optional)
              <input
                type="text"
                maxLength={120}
                value={notesInput}
                disabled={isMutating}
                onChange={(event) => setNotesInput(event.target.value)}
                className="mt-1 w-full rounded-xl border bg-background px-3 py-2 text-sm"
              />
            </label>
            <button
              type="submit"
              disabled={isMutating}
              className="rounded-xl bg-primary px-3 py-2 text-xs font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60"
            >
              Save weight
            </button>
          </form>

          <form
            className="mt-3 flex items-end gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              const parsed = Number(goalInput);
              if (!Number.isFinite(parsed) || parsed < 20 || parsed > 400) {
                return;
              }
              void onSaveWeightGoal({ target_weight: parsed, unit: selectedUnit });
            }}
          >
            <label className="flex-1 text-xs text-muted-foreground">
              Goal weight ({selectedUnit})
              <input
                type="number"
                min={20}
                max={400}
                step={0.1}
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
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Recent logs</p>
            {recentLogs.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">No weight logs yet.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {recentLogs.map((log) => (
                  <li key={log.id} className="rounded-xl border bg-background p-2 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium">
                        {formatNumber(log.weight)} {log.unit}
                      </p>
                      <p className="text-muted-foreground">{formatLoggedAt(log.logged_at)}</p>
                    </div>
                    {log.notes ? <p className="mt-1 text-muted-foreground">{log.notes}</p> : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      ) : null}
    </section>
  );
}
