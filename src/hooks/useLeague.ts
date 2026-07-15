import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  League,
  Team,
  DraftPick,
  Keeper,
  TeamRosterEntry,
  PickTrade,
  PickSwap,
  TradablePickSlot,
  priorSeasonYear,
} from '@/lib/types';
import { useToast } from '@/hooks/use-toast';

export function useLeagues(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['leagues'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('leagues')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as League[];
    },
    enabled: options?.enabled ?? true,
  });
}

/** Leagues where the signed-in user is an admin (primary or co-admin). */
export function useMyAdminLeagues(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['my_admin_leagues'],
    queryFn: async () => {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!user) return [];

      const { data, error } = await supabase
        .from('league_admins')
        .select('created_at, leagues(*)')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      return (data ?? [])
        .map((row) => row.leagues as League | null)
        .filter((league): league is League => !!league);
    },
    enabled: options?.enabled ?? true,
  });
}

export type LeagueAdminRow = {
  user_id: string;
  email: string;
  is_primary: boolean;
  created_at: string;
};

export function useLeagueAdmins(leagueId: string | undefined, enabled = false) {
  return useQuery({
    queryKey: ['league_admins', leagueId],
    queryFn: async () => {
      if (!leagueId) return [];
      const { data, error } = await supabase.rpc('list_league_admins', {
        p_league_id: leagueId,
      });
      if (error) throw error;
      return (data ?? []) as LeagueAdminRow[];
    },
    enabled: !!leagueId && enabled,
  });
}

export function useAddLeagueAdmin() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ leagueId, email }: { leagueId: string; email: string }) => {
      const { data, error } = await supabase.rpc('add_league_admin_by_email', {
        p_league_id: leagueId,
        p_email: email,
      });
      if (error) throw error;
      return { leagueId, rows: (data ?? []) as LeagueAdminRow[] };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['league_admins', data.leagueId] });
      queryClient.invalidateQueries({ queryKey: ['my_admin_leagues'] });
      queryClient.invalidateQueries({ queryKey: ['can_manage_league', data.leagueId] });
      queryClient.invalidateQueries({ queryKey: ['league', data.leagueId] });
      toast({ title: 'Admin added', description: 'They can manage this league when signed in.' });
    },
    onError: (error) => {
      toast({ title: 'Could not add admin', description: error.message, variant: 'destructive' });
    },
  });
}

export function useRemoveLeagueAdmin() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ leagueId, userId }: { leagueId: string; userId: string }) => {
      const { error } = await supabase.rpc('remove_league_admin', {
        p_league_id: leagueId,
        p_user_id: userId,
      });
      if (error) throw error;
      return { leagueId, userId };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['league_admins', data.leagueId] });
      queryClient.invalidateQueries({ queryKey: ['my_admin_leagues'] });
      queryClient.invalidateQueries({ queryKey: ['can_manage_league', data.leagueId] });
      queryClient.invalidateQueries({ queryKey: ['league', data.leagueId] });
      toast({ title: 'Admin removed' });
    },
    onError: (error) => {
      toast({ title: 'Could not remove admin', description: error.message, variant: 'destructive' });
    },
  });
}

export function useLeague(id: string | undefined) {
  return useQuery({
    queryKey: ['league', id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from('leagues')
        .select('*')
        .eq('id', id)
        .single();
      
      if (error) throw error;
      return data as League;
    },
    enabled: !!id,
  });
}

export function useTeams(leagueId: string | undefined) {
  return useQuery({
    queryKey: ['teams', leagueId],
    queryFn: async () => {
      if (!leagueId) return [];
      const { data, error } = await supabase
        .from('teams')
        .select('*')
        .eq('league_id', leagueId)
        .order('draft_position');
      
      if (error) throw error;
      return data as Team[];
    },
    enabled: !!leagueId,
  });
}

export function useDraftPicks(leagueId: string | undefined, year: number) {
  return useQuery({
    queryKey: ['draft_picks', leagueId, year],
    queryFn: async () => {
      if (!leagueId) return [];
      const { data, error } = await supabase
        .from('draft_picks')
        .select(`
          *,
          player:players(*),
          original_team:teams!draft_picks_original_team_id_fkey(*),
          current_team:teams!draft_picks_current_team_id_fkey(*)
        `)
        .eq('league_id', leagueId)
        .eq('year', year)
        .order('round')
        .order('pick_number');
      
      if (error) throw error;
      return data as DraftPick[];
    },
    enabled: !!leagueId,
  });
}

async function fetchMockDraftPicks(leagueId: string, year: number) {
  const { data, error } = await supabase
    .from('mock_draft_picks')
    .select(`
      *,
      player:players(*),
      original_team:teams!mock_draft_picks_original_team_id_fkey(*),
      current_team:teams!mock_draft_picks_current_team_id_fkey(*)
    `)
    .eq('league_id', leagueId)
    .eq('year', year)
    .order('round')
    .order('pick_number');

  if (error) throw error;
  return data as DraftPick[];
}

export function useMockDraftPicks(
  leagueId: string | undefined,
  year: number,
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: ['mock_draft_picks', leagueId, year],
    queryFn: async () => {
      if (!leagueId) return [];
      return fetchMockDraftPicks(leagueId, year);
    },
    enabled: !!leagueId && (options?.enabled ?? true),
  });
}

export function usePickTrades(leagueId: string | undefined) {
  return useQuery({
    queryKey: ['pick_trades', leagueId],
    queryFn: async () => {
      if (!leagueId) return [];
      const { data, error } = await supabase
        .from('pick_trades')
        .select(`
          *,
          from_team:teams!pick_trades_from_team_id_fkey(*),
          to_team:teams!pick_trades_to_team_id_fkey(*),
          draft_pick:draft_picks(*)
        `)
        .eq('league_id', leagueId)
        .order('traded_at', { ascending: false });

      if (error) throw error;
      return data as PickTrade[];
    },
    enabled: !!leagueId,
  });
}

export function usePickSwaps(leagueId: string | undefined, year?: number) {
  return useQuery({
    queryKey: ['pick_swaps', leagueId, year ?? 'all'],
    queryFn: async () => {
      if (!leagueId) return [];
      let query = supabase
        .from('pick_swaps')
        .select(`
          *,
          team_a:teams!pick_swaps_team_a_id_fkey(*),
          team_b:teams!pick_swaps_team_b_id_fkey(*),
          slot_a_original_team:teams!pick_swaps_slot_a_original_team_id_fkey(*),
          slot_b_original_team:teams!pick_swaps_slot_b_original_team_id_fkey(*)
        `)
        .eq('league_id', leagueId)
        .order('created_at', { ascending: false });

      if (year != null) {
        query = query.eq('year', year);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as PickSwap[];
    },
    enabled: !!leagueId,
  });
}

/** Build tradable slots for a team (works before or after board init). */
export function buildTradableSlots(args: {
  teams: Team[];
  numRounds: number;
  year: number;
  ownerTeamId: string;
  picks: DraftPick[];
  swaps: PickSwap[];
}): TradablePickSlot[] {
  const { teams, numRounds, year, ownerTeamId, picks, swaps } = args;
  const yearPicks = picks.filter((p) => p.year === year && !p.player_id);

  if (yearPicks.length > 0) {
    return yearPicks
      .filter((p) => p.current_team_id === ownerTeamId)
      .map((p) => ({
        original_team_id: p.original_team_id,
        round: p.round,
        current_owner_id: p.current_team_id,
      }))
      .sort((a, b) => a.round - b.round || a.original_team_id.localeCompare(b.original_team_id));
  }

  const ownership = new Map<string, string>();
  for (const team of teams) {
    for (let round = 1; round <= numRounds; round++) {
      ownership.set(`${team.id}:${round}`, team.id);
    }
  }

  const yearSwaps = [...swaps]
    .filter((s) => s.year === year)
    .sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime() ||
        a.id.localeCompare(b.id)
    );

  for (const swap of yearSwaps) {
    ownership.set(`${swap.slot_a_original_team_id}:${swap.slot_a_round}`, swap.team_b_id);
    ownership.set(`${swap.slot_b_original_team_id}:${swap.slot_b_round}`, swap.team_a_id);
  }

  const slots: TradablePickSlot[] = [];
  for (const [key, owner] of ownership) {
    if (owner !== ownerTeamId) continue;
    const [original_team_id, roundStr] = key.split(':');
    slots.push({
      original_team_id,
      round: parseInt(roundStr, 10),
      current_owner_id: owner,
    });
  }

  return slots.sort(
    (a, b) => a.round - b.round || a.original_team_id.localeCompare(b.original_team_id)
  );
}

export function slotKey(slot: Pick<{ original_team_id: string; round: number }>) {
  return `${slot.original_team_id}:${slot.round}`;
}

export function useKeepers(teamId: string | undefined) {
  return useQuery({
    queryKey: ['keepers', teamId],
    queryFn: async () => {
      if (!teamId) return [];
      const { data, error } = await supabase
        .from('keepers')
        .select(`
          *,
          player:players(*)
        `)
        .eq('team_id', teamId);
      
      if (error) throw error;
      return data as Keeper[];
    },
    enabled: !!teamId,
  });
}

export function useAllKeepers(leagueId: string | undefined) {
  return useQuery({
    queryKey: ['all_keepers', leagueId],
    queryFn: async () => {
      if (!leagueId) return [];
      
      // First get all teams for this league
      const { data: teams, error: teamsError } = await supabase
        .from('teams')
        .select('id')
        .eq('league_id', leagueId);
      
      if (teamsError) throw teamsError;
      
      const teamIds = teams.map(t => t.id);
      
      const { data, error } = await supabase
        .from('keepers')
        .select(`
          *,
          player:players(*)
        `)
        .in('team_id', teamIds);
      
      if (error) throw error;
      return data as Keeper[];
    },
    enabled: !!leagueId,
  });
}

export function useCreateLeague() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (league: Omit<Partial<League>, 'id' | 'created_at' | 'updated_at'> & { name: string }) => {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!user) throw new Error('You must be signed in as an admin to create a league');

      const { data, error } = await supabase
        .from('leagues')
        .insert([{ ...league, admin_user_id: user.id }])
        .select()
        .single();
      
      if (error) throw error;
      return data as League;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leagues'] });
      queryClient.invalidateQueries({ queryKey: ['my_admin_leagues'] });
      toast({ title: 'League created successfully!' });
    },
    onError: (error) => {
      toast({ title: 'Error creating league', description: error.message, variant: 'destructive' });
    },
  });
}

export function useUpdateLeague() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<League> & { id: string }) => {
      const { data, error } = await supabase
        .from('leagues')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data as League;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['leagues'] });
      queryClient.invalidateQueries({ queryKey: ['league', data.id] });
    },
    onError: (error) => {
      toast({ title: 'Error updating league', description: error.message, variant: 'destructive' });
    },
  });
}

export function useCreateTeam() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (team: { league_id: string; name: string; email: string; draft_position: number }) => {
      const { data, error } = await supabase.rpc('create_team_with_access', {
        p_league_id: team.league_id,
        p_name: team.name,
        p_email: team.email,
        p_draft_position: team.draft_position,
      });

      if (error) throw error;
      const created = data?.[0];
      if (!created) throw new Error('Failed to create team');
      return created as Team & { access_code: string };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['teams', data.league_id] });
      queryClient.invalidateQueries({ queryKey: ['team_codes', data.league_id] });
      toast({
        title: 'Team added',
        description: `Access code: ${data.access_code}. Share it with ${data.email}.`,
      });
    },
    onError: (error) => {
      toast({ title: 'Error adding team', description: error.message, variant: 'destructive' });
    },
  });
}

export function useTeamAccessCodes(leagueId: string | undefined, enabled = false) {
  return useQuery({
    queryKey: ['team_codes', leagueId],
    queryFn: async () => {
      if (!leagueId) return [];
      const { data, error } = await supabase.rpc('list_team_access_codes', {
        p_league_id: leagueId,
      });
      if (error) throw error;
      return (data ?? []) as { team_id: string; team_name: string; email: string; access_code: string }[];
    },
    enabled: !!leagueId && enabled,
  });
}

export function useSendKeeperRequests() {
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      leagueId,
      teamId,
    }: {
      leagueId: string;
      teamId?: string;
    }) => {
      const { data, error } = await supabase.functions.invoke('send-keeper-requests', {
        body: {
          league_id: leagueId,
          team_id: teamId,
          app_url: window.location.origin,
        },
      });

      const payload = data as {
        success?: boolean;
        message?: string;
        error?: string;
        sent?: number;
        failed?: number;
        skipped?: number;
      } | null;

      if (error) {
        throw new Error(payload?.error || payload?.message || error.message);
      }
      if (!payload?.success) {
        throw new Error(payload?.error || payload?.message || 'Failed to send emails');
      }
      return {
        success: true as const,
        message: payload.message || `Sent ${payload.sent ?? 0} emails`,
        sent: payload.sent ?? 0,
        failed: payload.failed ?? 0,
        skipped: payload.skipped ?? 0,
      };
    },
    onSuccess: (data) => {
      toast({
        title: 'Keeper requests sent',
        description: data.message,
      });
    },
    onError: (error) => {
      toast({
        title: 'Could not send keeper requests',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

export function useDeleteTeam() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, leagueId }: { id: string; leagueId: string }) => {
      const { error } = await supabase
        .from('teams')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
      return { id, leagueId };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['teams', data.leagueId] });
      toast({ title: 'Team deleted' });
    },
    onError: (error) => {
      toast({ title: 'Error deleting team', description: error.message, variant: 'destructive' });
    },
  });
}

export function useSetDraftOrder() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      leagueId,
      teamIds,
    }: {
      leagueId: string;
      teamIds: string[];
    }) => {
      const { error } = await supabase.rpc('set_draft_order', {
        p_league_id: leagueId,
        p_team_ids: teamIds,
      });
      if (error) throw error;
      return { leagueId };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['teams', data.leagueId] });
      toast({ title: 'Draft order updated' });
    },
    onError: (error) => {
      toast({
        title: 'Could not update draft order',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

export function useAddKeeper() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (keeper: {
      team_id: string;
      player_id: string;
      round_cost?: number;
      access_code?: string | null;
      asAdmin?: boolean;
    }) => {
      if (keeper.asAdmin) {
        const { data, error } = await supabase
          .from('keepers')
          .insert([{
            team_id: keeper.team_id,
            player_id: keeper.player_id,
            round_cost: keeper.round_cost ?? 0,
          }])
          .select()
          .single();
        if (error) throw error;
        return data as Keeper;
      }

      const { data, error } = await supabase.rpc('add_keeper_with_code', {
        p_team_id: keeper.team_id,
        p_player_id: keeper.player_id,
        p_access_code: keeper.access_code ?? '',
        p_round_cost: keeper.round_cost ?? 0,
      });

      if (error) throw error;
      return data as Keeper;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['keepers', data.team_id] });
      queryClient.invalidateQueries({ queryKey: ['all_keepers'] });
      toast({ title: 'Keeper added!' });
    },
    onError: (error) => {
      toast({ title: 'Error adding keeper', description: error.message, variant: 'destructive' });
    },
  });
}

export function useRemoveKeeper() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      id,
      teamId,
      access_code,
      asAdmin,
    }: {
      id: string;
      teamId: string;
      access_code?: string | null;
      asAdmin?: boolean;
    }) => {
      if (asAdmin) {
        const { error } = await supabase.from('keepers').delete().eq('id', id);
        if (error) throw error;
        return { id, teamId };
      }

      const { error } = await supabase.rpc('remove_keeper_with_code', {
        p_keeper_id: id,
        p_access_code: access_code ?? '',
      });
      if (error) throw error;
      return { id, teamId };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['keepers', data.teamId] });
      queryClient.invalidateQueries({ queryKey: ['all_keepers'] });
      toast({ title: 'Keeper removed' });
    },
    onError: (error) => {
      toast({ title: 'Error removing keeper', description: error.message, variant: 'destructive' });
    },
  });
}

export function useTeamRoster(teamId: string | undefined, seasonYear?: number) {
  const year = seasonYear ?? priorSeasonYear();
  return useQuery({
    queryKey: ['team_roster', teamId, year],
    queryFn: async () => {
      if (!teamId) return [];
      const { data, error } = await supabase
        .from('team_rosters')
        .select(`
          *,
          player:players(*)
        `)
        .eq('team_id', teamId)
        .eq('season_year', year);

      if (error) throw error;
      return (data as TeamRosterEntry[]).sort(
        (a, b) => (a.player?.search_rank ?? 9999) - (b.player?.search_rank ?? 9999)
      );
    },
    enabled: !!teamId,
  });
}

export function useAddToRoster() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      teamId,
      playerId,
      seasonYear,
    }: {
      teamId: string;
      playerId: string;
      seasonYear?: number;
    }) => {
      const year = seasonYear ?? priorSeasonYear();
      const { data, error } = await supabase
        .from('team_rosters')
        .insert([{ team_id: teamId, player_id: playerId, season_year: year }])
        .select(`*, player:players(*)`)
        .single();
      if (error) throw error;
      return data as TeamRosterEntry;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: ['team_roster', data.team_id, data.season_year],
      });
      toast({ title: "Added to last year's roster" });
    },
    onError: (error) => {
      toast({
        title: 'Error updating roster',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

export function useRemoveFromRoster() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      id,
      teamId,
      seasonYear,
      playerId,
    }: {
      id: string;
      teamId: string;
      seasonYear: number;
      playerId: string;
    }) => {
      // Drop keeper if this roster player was kept
      await supabase
        .from('keepers')
        .delete()
        .eq('team_id', teamId)
        .eq('player_id', playerId);

      const { error } = await supabase.from('team_rosters').delete().eq('id', id);
      if (error) throw error;
      return { id, teamId, seasonYear };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: ['team_roster', data.teamId, data.seasonYear],
      });
      queryClient.invalidateQueries({ queryKey: ['keepers', data.teamId] });
      queryClient.invalidateQueries({ queryKey: ['all_keepers'] });
      toast({ title: 'Removed from roster' });
    },
    onError: (error) => {
      toast({
        title: 'Error updating roster',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

export function useInitializeDraftPicks() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ leagueId, teams, numRounds, year }: { 
      leagueId: string; 
      teams: Team[]; 
      numRounds: number;
      year: number;
    }) => {
      // Delete existing picks for this year
      await supabase
        .from('draft_picks')
        .delete()
        .eq('league_id', leagueId)
        .eq('year', year);

      // Create all draft picks
      const picks: { league_id: string; original_team_id: string; current_team_id: string; round: number; pick_number: number; year: number; is_keeper: boolean }[] = [];
      
      for (let round = 1; round <= numRounds; round++) {
        const orderedTeams = round % 2 === 1 
          ? [...teams].sort((a, b) => a.draft_position - b.draft_position)
          : [...teams].sort((a, b) => b.draft_position - a.draft_position);
        
        orderedTeams.forEach((team, idx) => {
          picks.push({
            league_id: leagueId,
            original_team_id: team.id,
            current_team_id: team.id,
            round,
            pick_number: (round - 1) * teams.length + idx + 1,
            year,
            is_keeper: false,
          });
        });
      }

      const { error } = await supabase
        .from('draft_picks')
        .insert(picks);
      
      if (error) throw error;

      const { error: swapError } = await supabase.rpc('apply_pick_swaps', {
        p_league_id: leagueId,
        p_year: year,
      });
      if (swapError) throw swapError;

      return picks;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['draft_picks', variables.leagueId, variables.year] });
      queryClient.invalidateQueries({ queryKey: ['pick_trades', variables.leagueId] });
      queryClient.invalidateQueries({ queryKey: ['pick_swaps', variables.leagueId] });
      toast({ title: 'Draft picks initialized!' });
    },
    onError: (error) => {
      toast({ title: 'Error initializing picks', description: error.message, variant: 'destructive' });
    },
  });
}

export function useMakePick() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      pickId,
      playerId,
      leagueId,
      year,
      access_code,
      asAdmin,
    }: {
      pickId: string;
      playerId: string;
      leagueId: string;
      year: number;
      access_code?: string | null;
      asAdmin?: boolean;
    }) => {
      if (asAdmin) {
        const { data, error } = await supabase
          .from('draft_picks')
          .update({
            player_id: playerId,
            picked_at: new Date().toISOString(),
          })
          .eq('id', pickId)
          .select()
          .single();
        if (error) throw error;
        return { pick: data, leagueId, year };
      }

      const { data, error } = await supabase.rpc('make_pick_with_code', {
        p_pick_id: pickId,
        p_player_id: playerId,
        p_access_code: access_code ?? null,
      });
      if (error) throw error;
      return { pick: data, leagueId, year };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['draft_picks', data.leagueId, data.year] });
      queryClient.invalidateQueries({ queryKey: ['league', data.leagueId] });
    },
    onError: (error) => {
      toast({ title: 'Error making pick', description: error.message, variant: 'destructive' });
    },
  });
}

export function useExecutePickSwap() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      leagueId,
      year,
      teamAId,
      slotAOriginalTeamId,
      slotARound,
      teamBId,
      slotBOriginalTeamId,
      slotBRound,
    }: {
      leagueId: string;
      year: number;
      teamAId: string;
      slotAOriginalTeamId: string;
      slotARound: number;
      teamBId: string;
      slotBOriginalTeamId: string;
      slotBRound: number;
    }) => {
      const { data, error } = await supabase.rpc('execute_pick_swap', {
        p_league_id: leagueId,
        p_year: year,
        p_team_a_id: teamAId,
        p_slot_a_original_team_id: slotAOriginalTeamId,
        p_slot_a_round: slotARound,
        p_team_b_id: teamBId,
        p_slot_b_original_team_id: slotBOriginalTeamId,
        p_slot_b_round: slotBRound,
      });
      if (error) throw error;
      return { swap: data as PickSwap, leagueId, year };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['pick_swaps', data.leagueId] });
      queryClient.invalidateQueries({ queryKey: ['draft_picks', data.leagueId, data.year] });
      queryClient.invalidateQueries({ queryKey: ['pick_trades', data.leagueId] });
      toast({
        title: 'Trade recorded',
        description: 'Even swap saved. It applies when the board is initialized (or immediately if it already is).',
      });
    },
    onError: (error) => {
      toast({ title: 'Error executing trade', description: error.message, variant: 'destructive' });
    },
  });
}

export function useDeletePickSwap() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ swapId, leagueId, year }: { swapId: string; leagueId: string; year: number }) => {
      const { error } = await supabase.rpc('delete_pick_swap', { p_swap_id: swapId });
      if (error) throw error;
      return { leagueId, year };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['pick_swaps', data.leagueId] });
      queryClient.invalidateQueries({ queryKey: ['draft_picks', data.leagueId, data.year] });
      queryClient.invalidateQueries({ queryKey: ['pick_trades', data.leagueId] });
      toast({ title: 'Trade removed' });
    },
    onError: (error) => {
      toast({ title: 'Could not remove trade', description: error.message, variant: 'destructive' });
    },
  });
}

export function useInitializeMockDraft() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ leagueId, year }: { leagueId: string; year: number }) => {
      // Drop stale pick IDs immediately so the UI can't submit deleted rows
      queryClient.setQueryData(['mock_draft_picks', leagueId, year], []);

      const { data, error } = await supabase.rpc('initialize_mock_draft', {
        p_league_id: leagueId,
        p_year: year,
      });
      if (error) throw error;

      // Seed cache with fresh IDs before mock mode is enabled (query is disabled until then)
      const picks = await fetchMockDraftPicks(leagueId, year);
      queryClient.setQueryData(['mock_draft_picks', leagueId, year], picks);

      return { leagueId, year, count: data as number, picks };
    },
    onSuccess: () => {
      toast({
        title: 'Mock draft ready',
        description: 'Teams cannot see this board. Practice freely.',
      });
    },
    onError: (error) => {
      toast({ title: 'Could not start mock draft', description: error.message, variant: 'destructive' });
    },
  });
}

export function useMakeMockPick() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      pickId,
      playerId,
      leagueId,
      year,
    }: {
      pickId: string;
      playerId: string;
      leagueId: string;
      year: number;
    }) => {
      const { data, error } = await supabase.rpc('make_mock_pick', {
        p_pick_id: pickId,
        p_player_id: playerId,
      });
      if (error) {
        const details = [error.message, error.hint, error.details].filter(Boolean).join(' — ');
        throw new Error(details || 'Mock pick failed');
      }
      return { pick: data, leagueId, year };
    },
    onSuccess: async (data) => {
      // Keep board in sync without waiting on a slow invalidate/refetch path
      const picks = await fetchMockDraftPicks(data.leagueId, data.year);
      queryClient.setQueryData(['mock_draft_picks', data.leagueId, data.year], picks);
    },
    onError: (error) => {
      toast({ title: 'Error making mock pick', description: error.message, variant: 'destructive' });
    },
  });
}

export function useClearMockDraft() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ leagueId, year }: { leagueId: string; year: number }) => {
      const { error } = await supabase.rpc('clear_mock_draft', {
        p_league_id: leagueId,
        p_year: year,
      });
      if (error) throw error;
      return { leagueId, year };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['mock_draft_picks', data.leagueId, data.year] });
      toast({ title: 'Mock draft cleared' });
    },
    onError: (error) => {
      toast({ title: 'Could not clear mock draft', description: error.message, variant: 'destructive' });
    },
  });
}

export function useResetDraftBoard() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ leagueId, year }: { leagueId: string; year: number }) => {
      const { error } = await supabase.rpc('reset_draft_board', {
        p_league_id: leagueId,
        p_year: year,
      });
      if (error) throw error;
      return { leagueId, year };
    },
    onSuccess: (data) => {
      try {
        localStorage.removeItem(`draft-clock-${data.leagueId}`);
      } catch {
        // ignore storage errors
      }
      queryClient.invalidateQueries({ queryKey: ['draft_picks', data.leagueId, data.year] });
      queryClient.invalidateQueries({ queryKey: ['pick_trades', data.leagueId] });
      queryClient.invalidateQueries({ queryKey: ['league', data.leagueId] });
      toast({
        title: 'Draft board reset',
        description: 'Board uninitialized. You can change draft order and initialize again.',
      });
    },
    onError: (error) => {
      toast({ title: 'Could not reset draft board', description: error.message, variant: 'destructive' });
    },
  });
}
