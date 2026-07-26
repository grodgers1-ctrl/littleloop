// Single source of truth for the screen-state router.
// V1 does not need a routing library; one screen at a time is enough.

export type Screen =
  | "intro"
  | "setup"
  | "home"
  | "capture-preview"
  | "import-date"
  | "timeline"
  | "export-config"
  | "export-progress"
  | "export-complete"
  | "settings"
  | "restore-preview";

export type Route =
  | { name: "intro" }
  | { name: "setup"; mode: "real" | "sandbox" }
  | { name: "home" }
  | {
      name: "capture-preview";
      source: "camera" | "library";
      blob: Blob;
      previewUrl: string;
      suggestedDate: string;
      replaceEntryId?: string;
    }
  | { name: "import-date"; previewUrl: string; suggestedDate: string; blob: Blob; replaceEntryId?: string }
  | { name: "timeline" }
  | { name: "export-config" }
  | { name: "export-progress" }
  | { name: "export-complete"; downloadUrl: string; filename: string }
  | { name: "settings" }
  | { name: "restore-preview"; projectName: string; cadence: string; count: number };

export const initialRoute: Route = { name: "intro" };