import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useTeamAccess } from '@/contexts/TeamAccessContext';
import { supabase } from '@/integrations/supabase/client';
import { League } from '@/lib/types';

export function useLeaguePermissions(league: League | null | undefined) {
  const { user } = useAuth();
  const { getAccess } = useTeamAccess();

  const { data: canManageFromServer } = useQuery({
    queryKey: ['can_manage_league', league?.id, user?.id ?? 'anon'],
    queryFn: async () => {
      if (!league?.id) return false;
      const { data, error } = await supabase.rpc('can_manage_league', {
        p_league_id: league.id,
      });
      if (error) throw error;
      return !!data;
    },
    enabled: !!league?.id,
  });

  // Optimistic fallback while the server check loads (co-admins resolve via RPC)
  const optimisticAdmin =
    (!!league && league.admin_user_id == null) ||
    (!!league && !!user && league.admin_user_id === user.id);

  const isAdmin = canManageFromServer ?? optimisticAdmin;
  const isLegacyOpen = !!league && league.admin_user_id == null;

  const teamAccess = league ? getAccess(league.id) : null;
  const accessedTeamId = teamAccess?.teamId ?? null;

  const canEditTeam = (teamId: string) => isAdmin || accessedTeamId === teamId;

  return {
    isAdmin,
    isLegacyOpen,
    accessedTeamId,
    teamAccess,
    canEditTeam,
    canManageLeague: isAdmin,
    canStartDraft: isAdmin,
    canInitializeDraft: isAdmin,
    canEditSettings: isAdmin,
    canAddOrDeleteTeams: isAdmin,
  };
}
