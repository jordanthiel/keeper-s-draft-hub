import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { League, Team, DraftPick, Keeper, Player } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';

export function useLeagues() {
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
      const { data, error } = await supabase
        .from('leagues')
        .insert([league])
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
    mutationFn: async (team: { league_id: string; name: string; draft_position: number }) => {
      const { data, error } = await supabase
        .from('teams')
        .insert([team])
        .select()
        .single();
      
      if (error) throw error;
      return data as Team;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['teams', data.league_id] });
      toast({ title: 'Team added successfully!' });
    },
    onError: (error) => {
      toast({ title: 'Error adding team', description: error.message, variant: 'destructive' });
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
    mutationFn: async (keeper: { team_id: string; player_id: string; round_cost: number }) => {
      const { data, error } = await supabase
        .from('keepers')
        .insert([keeper])
        .select()
        .single();
      
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
    mutationFn: async ({ id, teamId }: { id: string; teamId: string }) => {
      const { error } = await supabase
        .from('keepers')
        .delete()
        .eq('id', id);
      
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
    mutationFn: async ({ pickId, playerId, leagueId, year }: { 
      pickId: string; 
      playerId: string;
      leagueId: string;
      year: number;
    }) => {
      const { data, error } = await supabase
        .from('draft_picks')
        .update({ 
          player_id: playerId, 
          picked_at: new Date().toISOString() 
        })
        .eq('id', pickId)
        .select()
        .single();
      
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
      year 
    }: { 
      pickId: string; 
      fromTeamId: string;
      toTeamId: string;
      leagueId: string;
      year: number;
    }) => {
      // Update the pick's current owner
      const { error: pickError } = await supabase
        .from('draft_picks')
        .update({ current_team_id: toTeamId })
        .eq('id', pickId);
      
      if (pickError) throw pickError;

      // Record the trade
      const { error: tradeError } = await supabase
        .from('pick_trades')
        .insert({
          league_id: leagueId,
          from_team_id: fromTeamId,
          to_team_id: toTeamId,
          draft_pick_id: pickId,
        });
      
      if (tradeError) throw tradeError;

      return { leagueId, year };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['draft_picks', data.leagueId, data.year] });
      toast({ title: 'Pick traded successfully!' });
    },
    onError: (error) => {
      toast({ title: 'Error trading pick', description: error.message, variant: 'destructive' });
    },
  });
}
