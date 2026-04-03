/**
 * Living State Machine
 *
 * The "brain" of the mesh — a finite automaton whose state reflects the
 * current energy level of the entire network. Every cascade cycle, heartbeat
 * result, and demand event influences the machine's state.
 *
 * States:
 *   BOOTING      — startup, not yet ready
 *   IDLE         — no activity, waiting
 *   SCANNING     — reading unpropagated signals
 *   PROCESSING   — cascade engine firing
 *   CASCADING    — deep cascade (signals generating signals)
 *   RESTING      — cool-down period after heavy activity
 *
 * Transitions are recorded in-memory with timestamps — this history is
 * broadcast over the WebSocket stream so the browser can show the "spark".
 */

export type MeshState =
  | "BOOTING"
  | "IDLE"
  | "SCANNING"
  | "PROCESSING"
  | "CASCADING"
  | "RESTING";

export interface StateEvent {
  from: MeshState;
  to: MeshState;
  at: string;
  reason: string;
}

let current: MeshState = "BOOTING";
const history: StateEvent[] = [];
const MAX_HISTORY = 200;

// Broadcast callback — set by the WebSocket route
let broadcaster: ((event: StateEvent) => void) | null = null;

export function setBroadcaster(fn: (event: StateEvent) => void): void {
  broadcaster = fn;
}

export function currentState(): MeshState { return current; }

export function stateHistory(): StateEvent[] { return [...history]; }

function transition(next: MeshState, reason: string): void {
  if (current === next) return;
  const event: StateEvent = { from: current, to: next, at: new Date().toISOString(), reason };
  history.push(event);
  if (history.length > MAX_HISTORY) history.shift();
  current = next;
  if (broadcaster) broadcaster(event);
}

// Called by the main pulse loop with the results of each cycle
export function advanceState(opts: {
  pendingSignals: number;
  signalsProcessed: number;
  cascadeDepth: number;       // how many rounds of cascades happened this tick
  serviceFailures: number;
  isBooted: boolean;
}): MeshState {
  const { pendingSignals, signalsProcessed, cascadeDepth, serviceFailures, isBooted } = opts;

  if (!isBooted) {
    transition("BOOTING", "startup");
    return current;
  }

  switch (current) {
    case "BOOTING":
      transition("IDLE", "startup_complete");
      break;

    case "IDLE":
      if (pendingSignals > 0) transition("SCANNING", `pending_signals=${pendingSignals}`);
      break;

    case "SCANNING":
      if (signalsProcessed > 0) transition("PROCESSING", `signals_processed=${signalsProcessed}`);
      else                       transition("IDLE", "queue_empty");
      break;

    case "PROCESSING":
      if (cascadeDepth >= 2)           transition("CASCADING", `cascade_depth=${cascadeDepth}`);
      else if (pendingSignals === 0)   transition("RESTING", "processed_all");
      else                             transition("SCANNING", "more_signals");
      break;

    case "CASCADING":
      if (pendingSignals === 0) transition("RESTING", "cascade_settled");
      else                      transition("PROCESSING", "continuing_cascade");
      break;

    case "RESTING":
      // Rest for at least 2 ticks then return to IDLE
      transition("IDLE", "cooldown_complete");
      break;
  }

  if (serviceFailures >= 2 && current !== "RESTING") {
    transition("RESTING", `service_failures=${serviceFailures}`);
  }

  return current;
}
