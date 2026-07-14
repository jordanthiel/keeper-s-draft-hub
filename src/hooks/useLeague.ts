import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { League, Team, DraftPick, Keeper, TeamRosterEntry, PickTrade, priorSeasonYear } from '@/lib/types';
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

export function useMockDraftPicks(
  leagueId: string | undefined,
  year: number,
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: ['mock_draft_picks', leagueId, year],
    queryFn: async () => {
      if (!leagueId) return [];
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
      return picks;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['draft_picks', variables.leagueId, variables.year] });
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

export function useTradePick() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      pickId,
      fromTeamId,
      toTeamId,
      leagueId,
      year,
      access_code,
      asAdmin,
    }: {
      pickId: string;
      fromTeamId: string;
      toTeamId: string;
      leagueId: string;
      year: number;
      access_code?: string | null;
      asAdmin?: boolean;
    }) => {
      if (asAdmin) {
        const { error: pickError } = await supabase
          .from('draft_picks')
          .update({ current_team_id: toTeamId })
          .eq('id', pickId);
        if (pickError) throw pickError;

        const { error: tradeError } = await supabase.from('pick_trades').insert({
          league_id: leagueId,
          from_team_id: fromTeamId,
          to_team_id: toTeamId,
          draft_pick_id: pickId,
        });
        if (tradeError) throw tradeError;
        return { leagueId, year };
      }

      const { error } = await supabase.rpc('trade_pick_with_code', {
        p_pick_id: pickId,
        p_from_team_id: fromTeamId,
        p_to_team_id: toTeamId,
        p_access_code: access_code ?? null,
      });
      if (error) throw error;
      return { leagueId, year };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['draft_picks', data.leagueId, data.year] });
      queryClient.invalidateQueries({ queryKey: ['pick_trades', data.leagueId] });
      toast({ title: 'Pick traded successfully!' });
    },
    onError: (error) => {
      toast({ title: 'Error trading pick', description: error.message, variant: 'destructive' });
    },
  });
}

export function useInitializeMockDraft() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ leagueId, year }: { leagueId: string; year: number }) => {
      const { data, error } = await supabase.rpc('initialize_mock_draft', {
        p_league_id: leagueId,
        p_year: year,
      });
      if (error) throw error;
      return { leagueId, year, count: data as number };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['mock_draft_picks', data.leagueId, data.year] });
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
      const { data, error } = await supabase
        .from('mock_draft_picks')
        .update({
          player_id: playerId,
          picked_at: new Date().toISOString(),
        })
        .eq('id', pickId)
        .select()
        .single();
      if (error) throw error;
      return { pick: data, leagueId, year };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['mock_draft_picks', data.leagueId, data.year] });
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
      queryClient.invalidateQueries({ queryKey: ['league', data.leagueId] });
      toast({
        title: 'Draft board reset',
        description: 'All selections cleared. Pick ownership and keepers were kept.',
      });
    },
    onError: (error) => {
      toast({ title: 'Could not reset draft board', description: error.message, variant: 'destructive' });
    },
  });
}
