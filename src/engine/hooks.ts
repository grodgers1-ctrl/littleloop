// React hooks for the V2.0 Engine. This is the ONLY place React code
// is allowed to touch the engine — engine modules themselves must not
// import React (see V2_DEV_SPEC §1 and the engine-boundary rule in
// V2_KICKOFF.md).
//
// The hooks subscribe to engine events and drive React renders when
// the underlying engine state changes. They do not own the engine —
// the engine is constructed once at app boot and injected via
// `setEngine()`.

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Engine, getEngine } from "./engine";
import type {
  ExportProgress,
  Subject,
  UnlockState,
} from "./state";

// ---------------------------------------------------------------------------
// useEngine — returns the engine instance. Throws if the engine hasn't
// been initialised yet (use `useEngineOrNull` if you want to render a
// splash instead).
// ---------------------------------------------------------------------------

export function useEngine(): Engine {
  return getEngine();
}

export function useEngineOrNull(): Engine | null {
  // Read from a state slot that we keep in sync with the singleton.
  // On Day 1 the engine is initialised synchronously in main.tsx, so
  // this is essentially `getEngine() ?? null`. The hook exists so the
  // splash render path is uniform with the rest of the engine boundary.
  const [engine] = useState<Engine | null>(() => {
    try {
      return getEngine();
    } catch {
      return null;
    }
  });
  return engine;
}

// ---------------------------------------------------------------------------
// useSubjects — reactive list of subjects.
// ---------------------------------------------------------------------------

/**
 * useSubjects — reactive list of subjects.
 *
 * Uses `useSyncExternalStore` to subscribe to the engine's
 * `subjects-changed` event. The snapshot returned to React must have
 * a stable reference when the underlying data is unchanged, or
 * `useSyncExternalStore` will detect a "change" and re-render in an
 * infinite loop. We cache the last array by value and return the
 * cached reference on every subsequent call that yields equal
 * contents.
 */
export function useSubjects(): Subject[] {
  const engine = useEngine();
  const cacheRef = useRef<Subject[]>([]);
  return useSyncExternalStore(
    (onChange) => engine.on("subjects-changed", onChange),
    () => {
      const next = engine.listSubjectsSync();
      if (sameSubjectList(cacheRef.current, next)) {
        return cacheRef.current;
      }
      cacheRef.current = next;
      return next;
    },
    () => [],
  );
}

/** Shallow-by-id-and-content equality. Sufficient for the
 *  useSubjects hook — the engine keeps subjects in stable sort order
 *  and mutates only via setSubjects(), which builds a new array. */
function sameSubjectList(a: Subject[], b: Subject[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    const x = a[i];
    const y = b[i];
    if (
      x.id !== y.id ||
      x.name !== y.name ||
      x.type !== y.type ||
      x.cadence !== y.cadence ||
      x.sortIndex !== y.sortIndex ||
      x.updatedAt !== y.updatedAt ||
      x.referenceImageBlobId !== y.referenceImageBlobId
    ) {
      return false;
    }
  }
  return true;
}

// ---------------------------------------------------------------------------
// useUnlock — reactive unlock state.
// ---------------------------------------------------------------------------

export function useUnlock(): UnlockState {
  const engine = useEngine();
  return useSyncExternalStore(
    (onChange) => engine.on("unlock-changed", onChange),
    () => engine.getUnlockState(),
    () => "free",
  );
}

// ---------------------------------------------------------------------------
// useExportProgress — current export progress, or null when idle.
// ---------------------------------------------------------------------------

export function useExportProgress(): ExportProgress | null {
  const engine = useEngine();
  return useSyncExternalStore(
    (onChange) => engine.on("export-progress", onChange),
    () => engine.getExportProgress(),
    () => null,
  );
}

// ---------------------------------------------------------------------------
// useEngineReady — true once engine.init() has resolved.
// ---------------------------------------------------------------------------

export function useEngineReady(): boolean {
  const engine = useEngineOrNull();
  const [ready, setReady] = useState<boolean>(() => engine?.isReady() ?? false);
  useEffect(() => {
    if (!engine) return;
    if (engine.isReady()) {
      setReady(true);
      return;
    }
    const off = engine.on("ready", () => setReady(true));
    return off;
  }, [engine]);
  return ready;
}
