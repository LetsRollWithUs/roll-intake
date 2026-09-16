import { useCallback, useEffect, useRef, useState } from "react";
import { emptyState, type IntakeState } from "./types";

const KEY = "roll-intake-v1";

export function loadState(): IntakeState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw) as Partial<IntakeState>;
    return { ...emptyState(), ...parsed };
  } catch {
    return emptyState();
  }
}

function saveState(state: IntakeState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // localStorage kan geblokkeerd zijn (privémodus); dan geen autosave.
  }
}

/**
 * Intake-state met autosave naar localStorage. `update` neemt een patch of een
 * functie, zodat losse stappen alleen hun eigen veld hoeven te zetten.
 */
export function useIntake() {
  const [state, setState] = useState<IntakeState>(loadState);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    saveState(state);
  }, [state]);

  const update = useCallback(
    (patch: Partial<IntakeState> | ((prev: IntakeState) => Partial<IntakeState>)) => {
      setState((prev) => {
        const p = typeof patch === "function" ? patch(prev) : patch;
        return { ...prev, ...p, updatedAt: Date.now() };
      });
    },
    [],
  );

  const reset = useCallback(() => {
    const fresh = emptyState();
    setState(fresh);
    saveState(fresh);
  }, []);

  return { state, update, reset };
}

export function uid(): string {
  return Math.random().toString(36).slice(2, 9);
}
