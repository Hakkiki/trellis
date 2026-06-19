// IndexedDB persistence for the simulator. The spec's desired-state store is
// Git and its observed-state history is an external append-only store (§11,
// §14); in the browser showcase both are realized in IndexedDB — declared
// posture and the audit trail survive a reload, so the simulator behaves like a
// real, stateful control plane rather than a toy that resets on refresh.

import { type IDBPDatabase, openDB } from "idb";
import type { AuditEntry } from "./engine";
import type { Posture } from "./model";

const DB_NAME = "trellis-sim";
const STORE = "session";
const KEY = "current";

export interface PersistedSession {
  posture: Posture;
  applied: boolean;
  audit: AuditEntry[];
  savedAt: number;
}

let dbp: Promise<IDBPDatabase> | null = null;

function db() {
  if (typeof indexedDB === "undefined") return null;
  if (!dbp) {
    dbp = openDB(DB_NAME, 1, {
      upgrade(d) {
        if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE);
      },
    });
  }
  return dbp;
}

export async function loadSession(): Promise<PersistedSession | null> {
  const p = db();
  if (!p) return null;
  try {
    return (await (await p).get(STORE, KEY)) ?? null;
  } catch {
    return null;
  }
}

export async function saveSession(s: PersistedSession): Promise<void> {
  const p = db();
  if (!p) return;
  try {
    await (await p).put(STORE, s, KEY);
  } catch {
    /* best-effort persistence */
  }
}

export async function clearSession(): Promise<void> {
  const p = db();
  if (!p) return;
  try {
    await (await p).delete(STORE, KEY);
  } catch {
    /* ignore */
  }
}
