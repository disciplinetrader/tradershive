import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export function useActiveArena(paperAccountId: string | null) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["active-arena", paperAccountId, user?.id],
    queryFn: async () => {
      if (!paperAccountId || !user) return null;

      // Find the participant entry for this paper account
      const { data: participant, error: pError } = await supabase
        .from("battle_participants")
        .select("battle_id, status")
        .eq("paper_account_id", paperAccountId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (pError || !participant) return null;

      // Get battle details
      const { data: battle, error: bError } = await supabase
        .from("battles")
        .select("*")
        .eq("id", participant.battle_id)
        .maybeSingle();

      if (bError || !battle) return null;

      // Also check if the user is a host (if not a participant)
      const isHost = battle.host_id === user.id;

      return {
        battle,
        participantStatus: participant.status,
        isParticipant: true,
        isHost,
      };
    },
    enabled: !!paperAccountId && !!user,
    staleTime: 30000,
  });
}
