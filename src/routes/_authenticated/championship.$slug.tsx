import { useEffect, useMemo } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Trophy, Users, Sparkles, Shield, TrendingUp, Zap, Info, Book, Film, Megaphone, Target } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import {
  getChampionship,
  registerChampionship,
  cancelChampionshipRegistration,
  joinChampionshipLive,
} from "@/lib/championship.functions";
import { ShareToCommunityButton } from "@/components/sharing/ShareToCommunityButton";
import { CountdownPill } from "@/components/championship/CountdownPill";
import { LeaderboardTable } from "@/components/championship/LeaderboardTable";
import { ActivityFeed } from "@/components/championship/ActivityFeed";
import { PersonalTimeline, buildPersonalTimeline } from "@/components/championship/PersonalTimeline";
import { MyPerformancePanel } from "@/components/championship/MyPerformancePanel";
import { TournamentSummary } from "@/components/championship/TournamentSummary";

export const Route = createFileRoute("/_authenticated/championship/$slug")({
  component: ChampionshipDetail;
});
