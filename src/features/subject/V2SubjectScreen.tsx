// V2 Subject Detail Screen. Thin wrapper around the V1 TimelineScreen
// so V2 subjects reuse the proven V1 timeline view without a rewrite.
//
// The adapter reads the V1 Project row (which is mirror-written by the
// V2 engine when a subject is created or renamed) so V1's `Project`
// contract is satisfied. V1's screen reads the Project name from the
// header; because the engine mirrors renames, the header stays
// consistent.

import { useEffect, useState } from "react";
import { TimelineScreen } from "../timeline/TimelineScreen";
import { getDb } from "../../db/database";
import type { Project } from "../../db/schema";
import type { Subject } from "../../engine/state";
import type { V2Route } from "../../engine/router";

interface Props {
  subject: Subject;
  navigate: (r: V2Route) => void;
}

export function V2SubjectScreen({ subject, navigate }: Props) {
  const [project, setProject] = useState<Project | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      // Read the V1 Project row that mirrors this subject. The V1
      // TimelineScreen requires a Project shape.
      const p = await getDb().projects.get(subject.id);
      if (!cancelled) setProject(p ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [subject.id, subject.updatedAt]);

  if (!project) {
    return (
      <div className="ll-content">
        <p>Loading subject…</p>
      </div>
    );
  }

  // Adapt V2Route → V1 Route for the V1 TimelineScreen. V1's router
  // handles capture, import-date, timeline, export-config,
  // export-progress, export-complete internally. We only forward
  // home + settings navigation back up.
  const v1Navigate = (r: import("../../app/routes").Route) => {
    if (r.name === "home") {
      navigate({ name: "home" });
    } else if (r.name === "settings") {
      navigate({ name: "subject-settings", subjectId: subject.id });
    }
    // Other routes remain on the V1 screen until Day 8 wires them
    // through the engine.
  };

  return (
    <TimelineScreen
      project={project}
      kind="real"
      navigate={v1Navigate}
    />
  );
}
