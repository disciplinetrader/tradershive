import { createFileRoute } from "@tanstack/react-router";
import { LeaderboardScope } from "./leaderboard.index";

export const Route = createFileRoute("/_authenticated/leaderboard/friends")({
  component: () => <LeaderboardScope scope="friends" title="Friends Leaderboard" description="You and the traders you follow." hideCountry hideLeague />,
});
