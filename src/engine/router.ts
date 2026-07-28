// V2 router types and hook. Pure TS so this file is excluded from the
// react-refresh rule that complains about non-component exports in .tsx
// files.

import { useCallback, useMemo, useState } from "react";
import type { Subject } from "../db/schema";
import { useEngine, useEngineReady } from "./hooks";

export type V2RouteName =
  | "home"
  | "subject"
  | "subject-settings"
  | "paywall"
  | "export-config"
  | "export-progress"
  | "export-result";

export type V2Route =
  | { name: "home" }
  | { name: "subject"; subjectId: string }
  | { name: "subject-settings"; subjectId: string }
  | { name: "paywall"; source: "home" | "export-sheet" }
  | { name: "export-config"; subjectId: string }
  | { name: "export-progress"; subjectId: string }
  | { name: "export-result"; result: import("../engine/state").ExportResult; subjectName: string; subjectId: string }
  // Forwarded to V1 screens from the V2 subject detail. The V2
  // subject screen narrows these to V1 Route on its own.
  | {
      name: "capture-preview";
      subjectId: string;
      blob: Blob;
      previewUrl: string;
      suggestedDate: string;
      source: "camera" | "library";
      replaceEntryId?: string;
    }
  | {
      name: "import-date";
      subjectId: string;
      previewUrl: string;
      suggestedDate: string;
      blob: Blob;
      replaceEntryId?: string;
    };

export const INITIAL_V2_ROUTE: V2Route = { name: "home" };

/** Returns a stable `navigate` function bound to the engine's subject
 *  cache. The router state lives in the caller's component. */
export function useV2Router(): {
  route: V2Route;
  navigate: (r: V2Route) => void;
  /** Find a subject by id from the engine cache. Returns undefined if
   *  the subject doesn't exist (e.g. it was just deleted) or no id
   *  is provided. */
  currentSubject: (id?: string) => Subject | undefined;
} {
  const engine = useEngine();
  const [route, setRoute] = useState<V2Route>(INITIAL_V2_ROUTE);
  const navigate = useCallback((r: V2Route) => setRoute(r), []);
  const currentSubject = useCallback(
    (id?: string) => {
      if (!id) return undefined;
      return engine.listSubjectsSync().find((s) => s.id === id);
    },
    [engine],
  );
  return useMemo(
    () => ({ route, navigate, currentSubject }),
    [route, navigate, currentSubject],
  );
}

/** Re-export for convenience. */
export { useEngineReady };
