// App-store polish — persisted defaults for new subjects.
//
// The V2 Settings screen lets the user pick a default cadence and
// subject type; the AddSubjectSheet seeds its form from these values.
// Persistence is intentionally local-only (localStorage), matching the
// app's no-accounts, no-cloud stance. Failures (private mode, quota)
// degrade silently to the built-in defaults.

import type { Cadence } from "../db/schema";
import { SUBJECT_TYPES, type SubjectType } from "../engine/state";

export interface SubjectDefaults {
  cadence: Cadence;
  type: SubjectType;
}

export const FALLBACK_DEFAULTS: SubjectDefaults = {
  cadence: "daily",
  type: "baby",
};

const STORAGE_KEY = "ll-subject-defaults";

export function loadSubjectDefaults(): SubjectDefaults {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (!raw) return FALLBACK_DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<SubjectDefaults>;
    const cadence = parsed.cadence === "weekly" ? "weekly" : "daily";
    const type = SUBJECT_TYPES.includes(parsed.type as SubjectType)
      ? (parsed.type as SubjectType)
      : FALLBACK_DEFAULTS.type;
    return { cadence, type };
  } catch {
    return FALLBACK_DEFAULTS;
  }
}

export function saveSubjectDefaults(defaults: SubjectDefaults): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(defaults));
  } catch {
    /* best-effort — see header */
  }
}
