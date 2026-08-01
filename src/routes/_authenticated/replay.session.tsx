/**
 * Legacy Replay workspace route (pre-Phase 8B).
 *
 * The legacy playback controller, its own timers, autosave and keyboard
 * listeners were removed in Phase 8C. `/replay/session` now redirects to the
 * single canonical Replay runtime at `/replay/studio`, preserving the
 * session id so old links and bookmarks keep working.
 */
import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";

export const Route = createFileRoute("/_authenticated/replay/session")({
  validateSearch: (s) => z.object({ id: z.string().optional() }).parse(s),
  beforeLoad: ({ search }) => {
    throw redirect({
      to: "/replay/studio",
      search: (search as { id?: string })?.id ? { id: (search as { id?: string }).id } : {},
    });
  },
});
