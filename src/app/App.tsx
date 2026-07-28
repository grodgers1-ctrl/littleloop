// App shell for V2.0. Renders the V2App which is engine-driven.
// The V1 router (features/home, features/capture, etc.) is still
// used by V2App's V1 route adapters; this file is the single entry
// point that swaps to V2.
//
// V1 screens (HomeScreen, TimelineScreen, ExportScreen, etc.) are
// imported and used by V2App's route adapters, so they remain in
// the bundle. The V1 App.tsx routing logic is replaced by V2App's
// engine-driven router.

import { V2App } from "../features/V2App";

export default function App() {
  return <V2App />;
}