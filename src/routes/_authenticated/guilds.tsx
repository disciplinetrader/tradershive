import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/coming-soon";

export const Route = createFileRoute("/_authenticated/guilds")({
  head: () => ({ meta: [{ title: "Guilds — TradersHIVE Arena" }] }),
  component: () => <ComingSoon title="Guilds" description="Form or join a trading guild, climb the guild leaderboard and share strategies with your crew." />,
});
