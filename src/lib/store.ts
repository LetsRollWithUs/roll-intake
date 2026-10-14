import { useCallback, useEffect, useRef, useState } from "react";
import { emptyState, type IntakeState } from "./types";

const KEY = "roll-intake-v1";
const SFEER_V2: Record<string, string> = {
  "licht-1": "licht-luchtig", "warm-1": "rustig-koel", "kleur-1": "zacht-warm",
  "warm-2": "aards-geborgen", "warm-3": "diep-sfeervol", "kleur-3": "speels-kleurig",
};

export function loadState(): IntakeState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw) as Partial<IntakeState>;
    // Sfeerbeelden v2: een eerder gekozen beeld wordt het nieuwe beeld met hetzelfde label.
    if (parsed.inspirationLikes) parsed.inspirationLikes = [...new Set(parsed.inspirationLikes.map((id) => SFEER_V2[id] ?? id))];
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

const SCREEN_KEY = "roll-intake-screen-v1";
const ID_KEY = "roll-intake-id-v1";

export function loadScreen(): string | null {
  try {
    return localStorage.getItem(SCREEN_KEY);
  } catch {
    return null;
  }
}

export function saveScreen(screen: string) {
  try {
    localStorage.setItem(SCREEN_KEY, screen);
  } catch {
    /* privémodus */
  }
}

/** Blijvend intake-id, zodat een concept-lead later bijgewerkt kan worden. */
export function getIntakeId(): string {
  try {
    let id = localStorage.getItem(ID_KEY);
    if (!id) {
      id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      localStorage.setItem(ID_KEY, id);
    }
    return id;
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

export function clearIntakeSession() {
  try {
    localStorage.removeItem(SCREEN_KEY);
    localStorage.removeItem(ID_KEY);
  } catch {
    /* privémodus */
  }
}
