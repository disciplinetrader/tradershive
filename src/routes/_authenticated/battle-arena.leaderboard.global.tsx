import { createFileRoute } from "@tanstack/react-router";
import { LeaderboardScope } from "./leaderboard.index";

export const Route = createFileRoute("/_authenticated/leaderboard/global")({
  component: () => <LeaderboardScope scope="global" title="Global Leaderboard" description="Every eligible trader across the platform." />,
});
