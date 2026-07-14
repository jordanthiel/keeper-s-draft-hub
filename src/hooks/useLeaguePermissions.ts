import { useAuth } from '@/contexts/AuthContext';
import { useTeamAccess } from '@/contexts/TeamAccessContext';
import { League } from '@/lib/types';

export function useLeaguePermissions(league: League | null | undefined) {
  const { user } = useAuth();
  const { getAccess } = useTeamAccess();

  const isLegacyOpen = !!league && league.admin_user_id == null;
  const isAdmin =
    isLegacyOpen || (!!league && !!user && league.admin_user_id === user.id);

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
