import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { League, Team, DraftPick, Keeper, Player, PickTrade } from '@/lib/types';
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

// Get year-specific draft state
export function useDraftState(leagueId: string | undefined, year: number) {
  return useQuery({
    queryKey: ['draft_state', leagueId, year],
    queryFn: async () => {
      if (!leagueId) return null;
      
      const { data, error } = await supabase
        .from('draft_state')
        .select('*')
        .eq('league_id', leagueId)
        .eq('year', year)
        .single();
      
      if (error) {
        // If no state exists, return default
        if (error.code === 'PGRST116') {
          return {
            league_id: leagueId,
            year: year,
            draft_status: 'not_started' as const,
            current_pick: 1,
            current_round: 1,
          };
        }
        throw error;
      }
      
      return data;
    },
    enabled: !!leagueId,
  });
}

// Update year-specific draft state
export function useUpdateDraftState() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ 
      leagueId, 
      year,
      draft_status,
      current_pick,
      current_round
    }: { 
      leagueId: string; 
      year: number;
      draft_status?: 'not_started' | 'in_progress' | 'completed';
      current_pick?: number;
      current_round?: number;
    }) => {
      const updateData: any = {};
      if (draft_status !== undefined) updateData.draft_status = draft_status;
      if (current_pick !== undefined) updateData.current_pick = current_pick;
      if (current_round !== undefined) updateData.current_round = current_round;

      const { data, error } = await supabase
        .from('draft_state')
        .upsert({
          league_id: leagueId,
          year: year,
          ...updateData,
        }, {
          onConflict: 'league_id,year'
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['draft_state', data.league_id, data.year] });
      queryClient.invalidateQueries({ queryKey: ['draft_picks', data.league_id, data.year] });
    },
    onError: (error) => {
      toast({ title: 'Error updating draft state', description: error.message, variant: 'destructive' });
    },
  });
}

// Get year-specific league settings, defaults to previous year or league defaults
export function useLeagueSettings(leagueId: string | undefined, year: number) {
  return useQuery({
    queryKey: ['league_settings', leagueId, year],
    queryFn: async () => {
      if (!leagueId) return null;
      
      // Try to get settings for this year
      let yearSettings = null;
      let yearError = null;
      
      // First try with dp_slots (if migration is applied)
      const { data: settingsWithDp, error: errorWithDp } = await supabase
        .from('league_settings')
        .select('*')
        .eq('league_id', leagueId)
        .eq('year', year)
        .maybeSingle();
      
      // If error is about missing column, try without dp_slots
      if (errorWithDp && (errorWithDp.message?.includes('dp_slots') || errorWithDp.code === '42703')) {
        // Column doesn't exist yet, select without it
        const { data: settingsWithoutDp, error: errorWithoutDp } = await supabase
          .from('league_settings')
          .select('id, league_id, year, num_teams, num_rounds, draft_time_seconds, qb_slots, rb_slots, wr_slots, te_slots, k_slots, def_slots, num_keepers, created_at, updated_at')
          .eq('league_id', leagueId)
          .eq('year', year)
          .maybeSingle();
        
        if (!errorWithoutDp && settingsWithoutDp) {
          yearSettings = { ...settingsWithoutDp, dp_slots: 0 };
        }
      } else if (!errorWithDp && settingsWithDp) {
        yearSettings = settingsWithDp;
      } else {
        yearError = errorWithDp;
      }
      
      // If table doesn't exist (PGRST301) or other error, skip to defaults
      if (yearError && yearError.code !== 'PGRST116') {
        // Table might not exist yet, continue to fallback logic
      } else if (yearSettings) {
        return yearSettings;
      }
      
      // If no settings for this year, try to get previous year's settings
      let prevYearSettings = null;
      const { data: prevWithDp, error: prevErrorWithDp } = await supabase
        .from('league_settings')
        .select('*')
        .eq('league_id', leagueId)
        .eq('year', year - 1)
        .maybeSingle();
      
      if (prevErrorWithDp && (prevErrorWithDp.message?.includes('dp_slots') || prevErrorWithDp.code === '42703')) {
        // Column doesn't exist, try without it
        const { data: prevWithoutDp, error: prevErrorWithoutDp } = await supabase
          .from('league_settings')
          .select('id, league_id, year, num_teams, num_rounds, draft_time_seconds, qb_slots, rb_slots, wr_slots, te_slots, k_slots, def_slots, num_keepers, created_at, updated_at')
          .eq('league_id', leagueId)
          .eq('year', year - 1)
          .maybeSingle();
        
        if (!prevErrorWithoutDp && prevWithoutDp) {
          prevYearSettings = { ...prevWithoutDp, dp_slots: 0 };
        }
      } else if (!prevErrorWithDp && prevWithDp) {
        prevYearSettings = prevWithDp;
      }
      
      if (prevYearSettings) {
        // Return previous year's settings but with current year
        return {
          ...prevYearSettings,
          year: year,
          id: undefined, // Will be created on save
        };
      }
      
      // If no previous year settings, get league defaults
      const { data: league, error: leagueError } = await supabase
        .from('leagues')
        .select('*')
        .eq('id', leagueId)
        .single();
      
      if (leagueError) throw leagueError;
      
      // Return league defaults with year
      return {
        league_id: leagueId,
        year: year,
        num_teams: league.num_teams,
        num_rounds: league.num_rounds,
        draft_time_seconds: league.draft_time_seconds,
        qb_slots: league.qb_slots,
        rb_slots: league.rb_slots,
        wr_slots: league.wr_slots,
        te_slots: league.te_slots,
        k_slots: league.k_slots,
        def_slots: league.def_slots,
        dp_slots: league.dp_slots ?? 0,
        num_keepers: 0, // Default to 0 keepers
      };
    },
    enabled: !!leagueId,
  });
}

// Update year-specific league settings
export function useUpdateLeagueSettings() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ 
      leagueId, 
      year,
      ...settings
    }: { 
      leagueId: string; 
      year: number;
      num_teams?: number;
      num_rounds?: number;
      draft_time_seconds?: number;
      qb_slots?: number;
      rb_slots?: number;
      wr_slots?: number;
      te_slots?: number;
      k_slots?: number;
      def_slots?: number;
      dp_slots?: number;
      num_keepers?: number;
    }) => {
      const { data, error } = await supabase
        .from('league_settings')
        .upsert({
          league_id: leagueId,
          year: year,
          ...settings,
        }, {
          onConflict: 'league_id,year'
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['league_settings', data.league_id, data.year] });
      toast({ title: 'Settings saved successfully!' });
    },
    onError: (error) => {
      toast({ title: 'Error saving settings', description: error.message, variant: 'destructive' });
    },
  });
}

// Get year-specific draft positions for teams, with fallback to teams.draft_position
export function useTeamDraftPositions(leagueId: string | undefined, year: number) {
  return useQuery({
    queryKey: ['team_draft_positions', leagueId, year],
    queryFn: async () => {
      if (!leagueId) return new Map<string, number>();
      
      // Get year-specific positions
      const { data: yearPositions, error: yearError } = await supabase
        .from('team_draft_positions')
        .select('team_id, draft_position')
        .eq('league_id', leagueId)
        .eq('year', year);
      
      if (yearError) throw yearError;
      
      // If we have year-specific positions, use them
      if (yearPositions && yearPositions.length > 0) {
        const positionMap = new Map<string, number>();
        yearPositions.forEach(pos => {
          positionMap.set(pos.team_id, pos.draft_position);
        });
        return positionMap;
      }
      
      // Otherwise, get teams and use their default draft_position
      const { data: teams, error: teamsError } = await supabase
        .from('teams')
        .select('id, draft_position')
        .eq('league_id', leagueId);
      
      if (teamsError) throw teamsError;
      
      const positionMap = new Map<string, number>();
      teams?.forEach(team => {
        positionMap.set(team.id, team.draft_position);
      });
      
      return positionMap;
    },
    enabled: !!leagueId,
  });
}

export function useDraftPicks(leagueId: string | undefined, year: number) {
  return useQuery({
    queryKey: ['draft_picks', leagueId, year],
    queryFn: async () => {
      if (!leagueId) return [];
      
      // First, check if picks exist
      const { data: existingPicks, error: fetchError } = await supabase
        .from('draft_picks')
        .select('id')
        .eq('league_id', leagueId)
        .eq('year', year)
        .limit(1);
      
      if (fetchError) throw fetchError;
      
      // If no picks exist, auto-initialize them
      if (!existingPicks || existingPicks.length === 0) {
        // Get year-specific settings or league defaults
        const { data: settings, error: settingsError } = await supabase
          .from('league_settings')
          .select('num_rounds')
          .eq('league_id', leagueId)
          .eq('year', year)
          .single();
        
        let numRounds: number;
        if (!settingsError && settings) {
          numRounds = settings.num_rounds;
        } else {
          // Fallback to league defaults
        const { data: league, error: leagueError } = await supabase
          .from('leagues')
          .select('num_rounds')
          .eq('id', leagueId)
          .single();
        
        if (leagueError) throw leagueError;
          numRounds = league.num_rounds;
        }
        
        // Get year-specific draft positions (or fallback to teams.draft_position)
        const { data: yearPositions, error: yearError } = await supabase
          .from('team_draft_positions')
          .select('team_id, draft_position')
          .eq('league_id', leagueId)
          .eq('year', year);
        
        if (yearError) throw yearError;
        
        const { data: teams, error: teamsError } = await supabase
          .from('teams')
          .select('id, draft_position')
          .eq('league_id', leagueId);
        
        if (teamsError) throw teamsError;
        
        if (teams && teams.length >= 2) {
          // Use year-specific positions if available, otherwise use teams.draft_position
          const positionMap = new Map<string, number>();
          if (yearPositions && yearPositions.length > 0) {
            yearPositions.forEach(pos => {
              positionMap.set(pos.team_id, pos.draft_position);
            });
          } else {
            teams.forEach(team => {
              positionMap.set(team.id, team.draft_position);
            });
          }
          
          // Create all draft picks
          const picks: { league_id: string; original_team_id: string; current_team_id: string; round: number; pick_number: number; year: number; is_keeper: boolean }[] = [];
          
          for (let round = 1; round <= numRounds; round++) {
            const orderedTeams = [...teams].sort((a, b) => {
              const aPos = positionMap.get(a.id) ?? a.draft_position;
              const bPos = positionMap.get(b.id) ?? b.draft_position;
              return round % 2 === 1 ? aPos - bPos : bPos - aPos;
            });
            
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
          
          const { error: insertError } = await supabase
            .from('draft_picks')
            .insert(picks);
          
          if (insertError) throw insertError;
        }
      }
      
      // Now fetch the picks with all relations
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

export function useUpdateTeamDraftPosition() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ 
      teamId, 
      leagueId, 
      newPosition,
      currentTeams 
    }: { 
      teamId: string; 
      leagueId: string; 
      newPosition: number;
      currentTeams: Team[];
    }) => {
      // Find the team being moved
      const currentTeam = currentTeams.find(t => t.id === teamId);
      if (!currentTeam) throw new Error('Team not found');

      const oldPosition = currentTeam.draft_position;

      // Calculate new positions
      const newPositions: { id: string; draft_position: number }[] = [];
      
      if (oldPosition < newPosition) {
        // Moving down: shift teams up
        currentTeams.forEach(team => {
          if (team.id === teamId) {
            newPositions.push({ id: team.id, draft_position: newPosition });
          } else if (team.draft_position > oldPosition && team.draft_position <= newPosition) {
            newPositions.push({ id: team.id, draft_position: team.draft_position - 1 });
          } else {
            newPositions.push({ id: team.id, draft_position: team.draft_position });
          }
        });
      } else if (oldPosition > newPosition) {
        // Moving up: shift teams down
        currentTeams.forEach(team => {
          if (team.id === teamId) {
            newPositions.push({ id: team.id, draft_position: newPosition });
          } else if (team.draft_position >= newPosition && team.draft_position < oldPosition) {
            newPositions.push({ id: team.id, draft_position: team.draft_position + 1 });
          } else {
            newPositions.push({ id: team.id, draft_position: team.draft_position });
          }
        });
      } else {
        // No change needed
        return { teamId, leagueId, updatedTeams: currentTeams };
      }

      // Find teams that need to change positions
      const teamsToUpdate = newPositions.filter((newPos) => {
        const oldTeam = currentTeams.find(t => t.id === newPos.id);
        return oldTeam && newPos.draft_position !== oldTeam.draft_position;
      });

      if (teamsToUpdate.length === 0) {
        return { teamId, leagueId, updatedTeams: currentTeams };
      }

      // First phase: Set all affected teams to temporary high values to avoid constraint conflicts
      const maxPosition = Math.max(...currentTeams.map(t => t.draft_position));
      const tempBase = maxPosition + 10000; // Use very large offset to avoid conflicts
      
      for (let i = 0; i < teamsToUpdate.length; i++) {
        const team = teamsToUpdate[i];
        const { error: tempError } = await supabase
          .from('teams')
          .update({ draft_position: tempBase + i })
          .eq('id', team.id);
        
        if (tempError) throw tempError;
      }

      // Second phase: Update all teams to their final positions
      for (const team of teamsToUpdate) {
        const { error: updateError } = await supabase
          .from('teams')
          .update({ draft_position: team.draft_position })
          .eq('id', team.id);
        
        if (updateError) throw updateError;
      }

      // Fetch updated teams from server
      const { data: updatedTeams, error: fetchError } = await supabase
        .from('teams')
        .select('*')
        .eq('league_id', leagueId)
        .order('draft_position');
      
      if (fetchError) throw fetchError;
      if (!updatedTeams) throw new Error('Failed to fetch updated teams');

      return { teamId, leagueId, updatedTeams: updatedTeams as Team[] };
    },
    onMutate: async ({ teamId, leagueId, newPosition, currentTeams }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['teams', leagueId] });

      // Snapshot the previous value
      const previousTeams = queryClient.getQueryData<Team[]>(['teams', leagueId]);

      // Find the team being moved
      const currentTeam = currentTeams.find(t => t.id === teamId);
      if (!currentTeam) return { previousTeams };

      const oldPosition = currentTeam.draft_position;

      // Calculate optimistic new positions
      const optimisticTeams = currentTeams.map(team => {
        if (team.id === teamId) {
          return { ...team, draft_position: newPosition };
        } else if (oldPosition < newPosition) {
          // Moving down: shift teams up
          if (team.draft_position > oldPosition && team.draft_position <= newPosition) {
            return { ...team, draft_position: team.draft_position - 1 };
          }
        } else if (oldPosition > newPosition) {
          // Moving up: shift teams down
          if (team.draft_position >= newPosition && team.draft_position < oldPosition) {
            return { ...team, draft_position: team.draft_position + 1 };
          }
        }
        return team;
      }).sort((a, b) => a.draft_position - b.draft_position);

      // Optimistically update the cache
      queryClient.setQueryData<Team[]>(['teams', leagueId], optimisticTeams);

      return { previousTeams };
    },
    onError: (error, variables, context) => {
      // Rollback to previous value on error
      if (context?.previousTeams) {
        queryClient.setQueryData(['teams', variables.leagueId], context.previousTeams);
      }
      toast({ title: 'Error updating draft order', description: error.message, variant: 'destructive' });
    },
    onSuccess: (data) => {
      // Update with the actual data from the server
      queryClient.setQueryData<Team[]>(['teams', data.leagueId], data.updatedTeams);
      toast({ title: 'Draft order updated' });
    },
  });
}

export function useUpdateDraftOrderForYear() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ 
      teamId, 
      leagueId, 
      year,
      newPosition,
      currentTeams 
    }: { 
      teamId: string; 
      leagueId: string; 
      year: number;
      newPosition: number;
      currentTeams: Team[];
    }) => {
      // Get current year-specific positions (or fallback to teams.draft_position)
      const { data: yearPositions, error: yearError } = await supabase
        .from('team_draft_positions')
        .select('team_id, draft_position')
        .eq('league_id', leagueId)
        .eq('year', year);
      
      if (yearError) throw yearError;
      
      // Build current position map
      const currentPositions = new Map<string, number>();
      if (yearPositions && yearPositions.length > 0) {
        yearPositions.forEach(pos => {
          currentPositions.set(pos.team_id, pos.draft_position);
        });
      } else {
        // Fallback to teams.draft_position
        currentTeams.forEach(team => {
          currentPositions.set(team.id, team.draft_position);
        });
      }
      
      // Find the team being moved
      const currentTeam = currentTeams.find(t => t.id === teamId);
      if (!currentTeam) throw new Error('Team not found');

      const oldPosition = currentPositions.get(teamId) ?? currentTeam.draft_position;

      if (oldPosition === newPosition) {
        // No change needed
        return { teamId, leagueId, year };
      }

      // Calculate new team order
      const newTeamPositions = new Map<string, number>();
      currentTeams.forEach(team => {
        const teamCurrentPos = currentPositions.get(team.id) ?? team.draft_position;
        if (team.id === teamId) {
          newTeamPositions.set(team.id, newPosition);
        } else if (oldPosition < newPosition) {
          // Moving down: shift teams up
          if (teamCurrentPos > oldPosition && teamCurrentPos <= newPosition) {
            newTeamPositions.set(team.id, teamCurrentPos - 1);
          } else {
            newTeamPositions.set(team.id, teamCurrentPos);
          }
        } else {
          // Moving up: shift teams down
          if (teamCurrentPos >= newPosition && teamCurrentPos < oldPosition) {
            newTeamPositions.set(team.id, teamCurrentPos + 1);
          } else {
            newTeamPositions.set(team.id, teamCurrentPos);
          }
        }
      });
      
      // Store year-specific positions in the database
      const upsertPromises = Array.from(newTeamPositions.entries()).map(([teamId, position]) => {
        return supabase
          .from('team_draft_positions')
          .upsert({
            team_id: teamId,
            league_id: leagueId,
            year: year,
            draft_position: position,
          }, {
            onConflict: 'team_id,league_id,year'
          });
      });
      
      const upsertResults = await Promise.all(upsertPromises);
      for (const result of upsertResults) {
        if (result.error) throw result.error;
      }

      // Get all draft picks for this year
      const { data: picks, error: picksError } = await supabase
        .from('draft_picks')
        .select('*')
        .eq('league_id', leagueId)
        .eq('year', year);
      
      if (picksError) throw picksError;
      if (!picks) throw new Error('Failed to fetch draft picks');

      // Get league to know number of rounds
      const { data: league, error: leagueError } = await supabase
        .from('leagues')
        .select('num_rounds')
        .eq('id', leagueId)
        .single();
      
      if (leagueError) throw leagueError;
      if (!league) throw new Error('League not found');

      // Build old and new position -> team mappings
      const oldSortedTeams = [...currentTeams].sort((a, b) => {
        const aPos = currentPositions.get(a.id) ?? a.draft_position;
        const bPos = currentPositions.get(b.id) ?? b.draft_position;
        return aPos - bPos;
      });
      const newSortedTeams = [...currentTeams].sort((a, b) => {
        const aPos = newTeamPositions.get(a.id) ?? a.draft_position;
        const bPos = newTeamPositions.get(b.id) ?? b.draft_position;
        return aPos - bPos;
      });

      const oldPosToTeamId = new Map<number, string>();
      oldSortedTeams.forEach((team, idx) => {
        oldPosToTeamId.set(idx + 1, team.id);
      });

      const newPosToTeamId = new Map<number, string>();
      newSortedTeams.forEach((team, idx) => {
        newPosToTeamId.set(idx + 1, team.id);
      });

      // For each round, reassign picks based on new order
      // We need to map picks by their position in the round, not by the team that originally had them
      const updates: Array<{ id: string; original_team_id: string; current_team_id?: string; oldOriginalTeamId?: string; round?: number }> = [];
      const processedPickIds = new Set<string>(); // Track which picks we've already processed
      
      for (let round = 1; round <= league.num_rounds; round++) {
        const isOddRound = round % 2 === 1;
        
        // Get all picks for this round that haven't been processed yet
        const roundPicks = picks.filter(p => p.round === round && !processedPickIds.has(p.id));
        
        // Build a map of old position -> pick for this round
        const oldPositionToPick = new Map<number, typeof picks[0]>();
        for (let pos = 1; pos <= currentTeams.length; pos++) {
          const roundPosition = isOddRound ? pos : currentTeams.length - pos + 1;
          const oldTeamId = oldPosToTeamId.get(roundPosition);
          if (!oldTeamId) continue;
          
          // Find the pick for this round and old team at this position
          // This finds the pick that was originally assigned to the team at this position
          // We need to find it even if it's been traded (original_team_id still points to old team)
          const pick = roundPicks.find(p => p.original_team_id === oldTeamId);
          if (pick) {
            oldPositionToPick.set(roundPosition, pick);
            processedPickIds.add(pick.id); // Mark as processed so we don't use it in another round
          }
        }
        
        // Now update picks based on new positions
        for (let pos = 1; pos <= currentTeams.length; pos++) {
          const roundPosition = isOddRound ? pos : currentTeams.length - pos + 1;
          
          // Find the pick that was at this position (from old order)
          const pick = oldPositionToPick.get(roundPosition);
          if (!pick) {
            // No pick found at this position - this shouldn't happen but handle gracefully
            continue;
          }
          
          // Find new team at this position
          const newTeamId = newPosToTeamId.get(roundPosition);
          if (!newTeamId) continue;
          
          // Only update if the team at this position changed
          if (pick.original_team_id === newTeamId) {
            // No update needed - pick already belongs to the team at this position
            continue;
          }
          
          const wasTraded = pick.original_team_id !== pick.current_team_id;
          
          if (wasTraded) {
            // For traded picks, update original_team_id to reflect the new team at this position
            // This ensures the pick moves with the draft order change
            // Keep current_team_id unchanged (it still reflects who owns the pick via trade)
            updates.push({
              id: pick.id,
              original_team_id: newTeamId,
              oldOriginalTeamId: pick.original_team_id,
              round: round,
            });
          } else {
            // For non-traded picks, update both original and current
            updates.push({
              id: pick.id,
              original_team_id: newTeamId,
              current_team_id: newTeamId,
            });
          }
        }
      }

      // Apply updates in batch

      // Apply updates in batch
      // Use Promise.all to ensure all updates complete before continuing
      if (updates.length > 0) {
        const updatePromises = updates.map(async (update) => {
          const updateData: { original_team_id: string; current_team_id?: string } = {
            original_team_id: update.original_team_id,
          };
          if (update.current_team_id !== undefined) {
            updateData.current_team_id = update.current_team_id;
          }

          const { error, data } = await supabase
            .from('draft_picks')
            .update(updateData)
            .eq('id', update.id)
            .select();
          
          if (error) throw error;
          if (!data || data.length === 0) {
            throw new Error(`Failed to update pick ${update.id}`);
          }
          return data;
        });

        await Promise.all(updatePromises);
        
        // Update trade records for traded picks that were updated
        const tradedPickUpdates = updates.filter(u => u.oldOriginalTeamId && u.round);
        if (tradedPickUpdates.length > 0) {
          // Get all trade records that need updating
          const pickIds = tradedPickUpdates.map(u => u.id);
          const { data: tradesToUpdate, error: tradesFetchError } = await supabase
            .from('pick_trades')
            .select('id, draft_pick_id, round, original_team_id')
            .in('draft_pick_id', pickIds)
            .eq('league_id', leagueId);
          
          if (tradesFetchError) throw tradesFetchError;
          
          if (tradesToUpdate) {
            const tradeUpdateMap = new Map(tradedPickUpdates.map(u => [u.id, { newTeamId: u.original_team_id, round: u.round, oldTeamId: u.oldOriginalTeamId }]));
            
            const tradeUpdatePromises = tradesToUpdate
              .filter(trade => {
                const updateInfo = tradeUpdateMap.get(trade.draft_pick_id!);
                return updateInfo && trade.round === updateInfo.round && trade.original_team_id === updateInfo.oldTeamId;
              })
              .map(async (trade) => {
                const updateInfo = tradeUpdateMap.get(trade.draft_pick_id!);
                if (!updateInfo) return;
                
                const { error } = await supabase
                  .from('pick_trades')
                  .update({ original_team_id: updateInfo.newTeamId })
                  .eq('id', trade.id);
                
                if (error) throw error;
              });

            await Promise.all(tradeUpdatePromises);
          }
        }
        
        // Verify updates were applied by refetching a sample
        const { data: verifyPicks, error: verifyError } = await supabase
          .from('draft_picks')
          .select('id, original_team_id')
          .eq('league_id', leagueId)
          .eq('year', year)
          .in('id', updates.map(u => u.id))
          .limit(updates.length);
        
        if (verifyError) throw verifyError;
        
        // Check that all updates were applied
        const updateMap = new Map(updates.map(u => [u.id, u.original_team_id]));
        if (verifyPicks) {
          for (const pick of verifyPicks) {
            const expectedTeamId = updateMap.get(pick.id);
            if (expectedTeamId && pick.original_team_id !== expectedTeamId) {
              throw new Error(`Pick ${pick.id} was not updated correctly. Expected ${expectedTeamId}, got ${pick.original_team_id}`);
            }
          }
        }
      }

      return { teamId, leagueId, year, newPositions: newTeamPositions };
    },
    onMutate: async ({ teamId, leagueId, year, newPosition, currentTeams }) => {
      // Cancel any outgoing refetches for positions (but not draft_picks - let it refetch after update)
      await queryClient.cancelQueries({ queryKey: ['team_draft_positions', leagueId, year] });
      await queryClient.cancelQueries({ queryKey: ['teams', leagueId] });

      // Snapshot the previous values
      const previousPositions = queryClient.getQueryData<Map<string, number>>(['team_draft_positions', leagueId, year]);
      const previousTeams = queryClient.getQueryData<Team[]>(['teams', leagueId]);

      // Find the team being moved
      const currentTeam = currentTeams.find(t => t.id === teamId);
      if (!currentTeam) return { previousPositions, previousTeams };

      const oldPosition = currentTeam.draft_position;

      // Calculate optimistic new positions
      const optimisticPositions = new Map<string, number>();
      currentTeams.forEach(team => {
        const teamCurrentPos = team.draft_position;
        if (team.id === teamId) {
          optimisticPositions.set(team.id, newPosition);
        } else if (oldPosition < newPosition) {
          // Moving down: shift teams up
          if (teamCurrentPos > oldPosition && teamCurrentPos <= newPosition) {
            optimisticPositions.set(team.id, teamCurrentPos - 1);
          } else {
            optimisticPositions.set(team.id, teamCurrentPos);
          }
        } else if (oldPosition > newPosition) {
          // Moving up: shift teams down
          if (teamCurrentPos >= newPosition && teamCurrentPos < oldPosition) {
            optimisticPositions.set(team.id, teamCurrentPos + 1);
          } else {
            optimisticPositions.set(team.id, teamCurrentPos);
          }
        } else {
          optimisticPositions.set(team.id, teamCurrentPos);
        }
      });

      // Optimistically update the cache
      queryClient.setQueryData<Map<string, number>>(['team_draft_positions', leagueId, year], optimisticPositions);

      // Don't optimistically update draft_picks - the picks need to be recalculated based on the new positions
      // which is complex and error-prone. Instead, we'll refetch after the server update completes.

      return { previousPositions, previousTeams };
    },
    onError: (error, variables, context) => {
      // Rollback to previous values on error
      if (context?.previousPositions) {
        queryClient.setQueryData(['team_draft_positions', variables.leagueId, variables.year], context.previousPositions);
      }
      if (context?.previousTeams) {
        queryClient.setQueryData(['teams', variables.leagueId], context.previousTeams);
      }
      toast({ title: 'Error updating draft order', description: error.message, variant: 'destructive' });
    },
    onSuccess: async (data) => {
      // Wait a moment to ensure database updates are fully committed
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Refetch queries to get the latest data from server
      // Use refetchQueries to force an immediate refetch with fresh data
      await queryClient.refetchQueries({ queryKey: ['draft_picks', data.leagueId, data.year] });
      queryClient.invalidateQueries({ queryKey: ['team_draft_positions', data.leagueId, data.year] });
      queryClient.invalidateQueries({ queryKey: ['trades', data.leagueId] });
      toast({ title: 'Draft order updated' });
    },
  });
}

export function useAddKeeper() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (keeper: { team_id: string; player_id: string }) => {
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
      numRounds?: number;
      year: number;
    }) => {
      // Delete existing picks for this year
      await supabase
        .from('draft_picks')
        .delete()
        .eq('league_id', leagueId)
        .eq('year', year);

      // Get num_rounds from year-specific settings if not provided
      let roundsToUse = numRounds;
      if (!roundsToUse) {
        const { data: settings, error: settingsError } = await supabase
          .from('league_settings')
          .select('num_rounds')
          .eq('league_id', leagueId)
          .eq('year', year)
          .single();
        
        if (!settingsError && settings) {
          roundsToUse = settings.num_rounds;
        } else {
          // Fallback to league defaults
          const { data: league, error: leagueError } = await supabase
            .from('leagues')
            .select('num_rounds')
            .eq('id', leagueId)
            .single();
          
          if (leagueError) throw leagueError;
          roundsToUse = league.num_rounds;
        }
      }

      // Get year-specific draft positions (or fallback to teams.draft_position)
      const { data: yearPositions, error: yearError } = await supabase
        .from('team_draft_positions')
        .select('team_id, draft_position')
        .eq('league_id', leagueId)
        .eq('year', year);
      
      if (yearError) throw yearError;
      
      // Build position map
      const positionMap = new Map<string, number>();
      if (yearPositions && yearPositions.length > 0) {
        yearPositions.forEach(pos => {
          positionMap.set(pos.team_id, pos.draft_position);
        });
      } else {
        teams.forEach(team => {
          positionMap.set(team.id, team.draft_position);
        });
      }

      // Create all draft picks
      const picks: { league_id: string; original_team_id: string; current_team_id: string; round: number; pick_number: number; year: number; is_keeper: boolean }[] = [];
      
      for (let round = 1; round <= roundsToUse; round++) {
        const orderedTeams = [...teams].sort((a, b) => {
          const aPos = positionMap.get(a.id) ?? a.draft_position;
          const bPos = positionMap.get(b.id) ?? b.draft_position;
          return round % 2 === 1 ? aPos - bPos : bPos - aPos;
        });
        
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

      // Insert picks (we already deleted existing ones above)
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
    mutationFn: async ({ pickId, playerId, leagueId, year, nextPickNumber, nextRound }: { 
      pickId: string; 
      playerId: string;
      leagueId: string;
      year: number;
      nextPickNumber?: number;
      nextRound?: number;
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
      
      // Update draft state with next pick/round if provided
      if (nextPickNumber !== undefined || nextRound !== undefined) {
        const updateData: any = {};
        if (nextPickNumber !== undefined) updateData.current_pick = nextPickNumber;
        if (nextRound !== undefined) updateData.current_round = nextRound;
        
        await supabase
          .from('draft_state')
          .upsert({
            league_id: leagueId,
            year: year,
            ...updateData,
          }, {
            onConflict: 'league_id,year'
          });
      }
      
      return { pick: data, leagueId, year };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['draft_picks', data.leagueId, data.year] });
      queryClient.invalidateQueries({ queryKey: ['draft_state', data.leagueId, data.year] });
      queryClient.invalidateQueries({ queryKey: ['league', data.leagueId] });
    },
    onError: (error) => {
      toast({ title: 'Error making pick', description: error.message, variant: 'destructive' });
    },
  });
}

export function useTrades(leagueId: string | undefined) {
  return useQuery({
    queryKey: ['trades', leagueId],
    queryFn: async () => {
      if (!leagueId) return [];
      
      const { data, error } = await supabase
        .from('pick_trades')
        .select(`
          *,
          draft_pick:draft_picks!pick_trades_draft_pick_id_fkey(
            *,
            original_team:teams!draft_picks_original_team_id_fkey(*)
          ),
          from_team:teams!pick_trades_from_team_id_fkey(*),
          to_team:teams!pick_trades_to_team_id_fkey(*),
          original_team:teams!pick_trades_original_team_id_fkey(*)
        `)
        .eq('league_id', leagueId)
        .order('traded_at', { ascending: false });
      
      if (error) throw error;
      return data as any[];
    },
    enabled: !!leagueId,
  });
}

export function useTradePick() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ 
      pickId, 
      returnPickId,
      fromTeamId, 
      toTeamId, 
      leagueId,
      year 
    }: { 
      pickId: string;
      returnPickId: string;
      fromTeamId: string;
      toTeamId: string;
      leagueId: string;
      year: number;
    }) => {
      // Swap both picks atomically - use a transaction-like approach
      // First pick goes from fromTeamId to toTeamId
      const { error: pick1Error } = await supabase
        .from('draft_picks')
        .update({ current_team_id: toTeamId })
        .eq('id', pickId);
      
      if (pick1Error) throw pick1Error;

      // Return pick goes from toTeamId to fromTeamId
      const { error: pick2Error } = await supabase
        .from('draft_picks')
        .update({ current_team_id: fromTeamId })
        .eq('id', returnPickId);
      
      if (pick2Error) {
        // Rollback the first update if second fails
        await supabase
          .from('draft_picks')
          .update({ current_team_id: fromTeamId })
          .eq('id', pickId);
        throw pick2Error;
      }

      // Get pick details for trade records
      const { data: pick1Data, error: pick1DataError } = await supabase
        .from('draft_picks')
        .select('round, original_team_id, year')
        .eq('id', pickId)
        .single();
      
      if (pick1DataError) throw pick1DataError;
      if (!pick1Data) throw new Error('Pick 1 not found');

      const { data: pick2Data, error: pick2DataError } = await supabase
        .from('draft_picks')
        .select('round, original_team_id, year')
        .eq('id', returnPickId)
        .single();
      
      if (pick2DataError) throw pick2DataError;
      if (!pick2Data) throw new Error('Pick 2 not found');

      // Record both trades with round and original_team_id
      const { error: trade1Error } = await supabase
        .from('pick_trades')
        .insert({
          league_id: leagueId,
          from_team_id: fromTeamId,
          to_team_id: toTeamId,
          draft_pick_id: pickId,
          round: pick1Data.round,
          original_team_id: pick1Data.original_team_id,
          year: pick1Data.year,
        });
      
      if (trade1Error) throw trade1Error;

      const { error: trade2Error } = await supabase
        .from('pick_trades')
        .insert({
          league_id: leagueId,
          from_team_id: toTeamId,
          to_team_id: fromTeamId,
          draft_pick_id: returnPickId,
          round: pick2Data.round,
          original_team_id: pick2Data.original_team_id,
          year: pick2Data.year,
        });
      
      if (trade2Error) throw trade2Error;

      return { leagueId, year };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['draft_picks', data.leagueId, data.year] });
      queryClient.invalidateQueries({ queryKey: ['trades', data.leagueId] });
      toast({ title: 'Pick traded successfully!' });
    },
    onError: (error) => {
      toast({ title: 'Error trading pick', description: error.message, variant: 'destructive' });
    },
  });
}

export function useCancelTrade() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ 
      trade1Id,
      trade2Id,
      pick1Id,
      pick2Id,
      leagueId,
      year 
    }: { 
      trade1Id: string;
      trade2Id: string;
      pick1Id: string | null;
      pick2Id: string | null;
      leagueId: string;
      year: number;
    }) => {
      // Get trade records to find round and original_team_id
      const { data: trade1, error: trade1FetchError } = await supabase
        .from('pick_trades')
        .select('round, original_team_id, year')
        .eq('id', trade1Id)
        .single();
      
      if (trade1FetchError) throw trade1FetchError;
      if (!trade1) throw new Error('Trade 1 not found');

      const { data: trade2, error: trade2FetchError } = await supabase
        .from('pick_trades')
        .select('round, original_team_id, year')
        .eq('id', trade2Id)
        .single();
      
      if (trade2FetchError) throw trade2FetchError;
      if (!trade2) throw new Error('Trade 2 not found');

      // Find picks by round and original_team_id (more resilient to draft order changes)
      let pick1, pick2;
      
      if (pick1Id) {
        // Try to find by ID first (for backwards compatibility)
        const { data, error } = await supabase
          .from('draft_picks')
          .select('id, original_team_id')
          .eq('id', pick1Id)
          .single();
        if (!error && data) {
          pick1 = data;
        }
      }
      
      if (!pick1 && trade1.round && trade1.original_team_id) {
        // Find by round and original_team_id
        const { data, error } = await supabase
          .from('draft_picks')
          .select('id, original_team_id')
          .eq('league_id', leagueId)
          .eq('year', trade1.year || year)
          .eq('round', trade1.round)
          .eq('original_team_id', trade1.original_team_id)
          .maybeSingle();
        if (!error && data) {
          pick1 = data;
        }
      }
      
      if (!pick1) throw new Error('Pick 1 not found');

      if (pick2Id) {
        const { data, error } = await supabase
          .from('draft_picks')
          .select('id, original_team_id')
          .eq('id', pick2Id)
          .single();
        if (!error && data) {
          pick2 = data;
        }
      }
      
      if (!pick2 && trade2.round && trade2.original_team_id) {
        const { data, error } = await supabase
          .from('draft_picks')
          .select('id, original_team_id')
          .eq('league_id', leagueId)
          .eq('year', trade2.year || year)
          .eq('round', trade2.round)
          .eq('original_team_id', trade2.original_team_id)
          .maybeSingle();
        if (!error && data) {
          pick2 = data;
        }
      }
      
      if (!pick2) throw new Error('Pick 2 not found');

      // Reverse both picks back to their original teams
      const { error: pick1Error } = await supabase
        .from('draft_picks')
        .update({ current_team_id: pick1.original_team_id })
        .eq('id', pick1.id);
      
      if (pick1Error) throw pick1Error;

      const { error: pick2Error } = await supabase
        .from('draft_picks')
        .update({ current_team_id: pick2.original_team_id })
        .eq('id', pick2.id);
      
      if (pick2Error) {
        // Rollback the first update if second fails
        await supabase
          .from('draft_picks')
          .update({ current_team_id: pick1.original_team_id })
          .eq('id', pick1.id);
        throw pick2Error;
      }

      // Delete both trade records
      const { error: trade1Error } = await supabase
        .from('pick_trades')
        .delete()
        .eq('id', trade1Id);
      
      if (trade1Error) throw trade1Error;

      const { error: trade2Error } = await supabase
        .from('pick_trades')
        .delete()
        .eq('id', trade2Id);
      
      if (trade2Error) throw trade2Error;

      return { leagueId, year };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['draft_picks', data.leagueId, data.year] });
      queryClient.invalidateQueries({ queryKey: ['trades', data.leagueId] });
      toast({ title: 'Trade cancelled successfully!' });
    },
    onError: (error) => {
      toast({ title: 'Error cancelling trade', description: error.message, variant: 'destructive' });
    },
  });
}

export function useResetDraft() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ 
      leagueId, 
      year,
      teams,
      numRounds 
    }: { 
      leagueId: string; 
      year: number;
      teams: Team[];
      numRounds?: number;
    }) => {
      // Get num_rounds from year-specific settings if not provided
      let roundsToUse = numRounds;
      if (!roundsToUse) {
        const { data: settings, error: settingsError } = await supabase
          .from('league_settings')
          .select('num_rounds')
          .eq('league_id', leagueId)
          .eq('year', year)
          .single();
        
        if (!settingsError && settings) {
          roundsToUse = settings.num_rounds;
        } else {
          // Fallback to league defaults
          const { data: league, error: leagueError } = await supabase
            .from('leagues')
            .select('num_rounds')
            .eq('id', leagueId)
            .single();
          
          if (leagueError) throw leagueError;
          roundsToUse = league.num_rounds;
        }
      }

      // Delete all draft picks for this league/year
      // Note: Trades will be automatically deleted due to ON DELETE CASCADE constraint
      // If you want to preserve trades, you'll need to modify the foreign key constraint
      const { error: picksError } = await supabase
        .from('draft_picks')
        .delete()
        .eq('league_id', leagueId)
        .eq('year', year);
      
      if (picksError) throw picksError;

      // Reset year-specific draft state
      const { error: stateError } = await supabase
        .from('draft_state')
        .upsert({
          league_id: leagueId,
          year: year,
          draft_status: 'not_started',
          current_pick: 1,
          current_round: 1,
        }, {
          onConflict: 'league_id,year'
        });
      
      if (stateError) throw stateError;

      // Get year-specific draft positions (or fallback to teams.draft_position)
      const { data: yearPositions, error: yearPosError } = await supabase
        .from('team_draft_positions')
        .select('team_id, draft_position')
        .eq('league_id', leagueId)
        .eq('year', year);
      
      if (yearPosError) throw yearPosError;
      
      // Build position map
      const positionMap = new Map<string, number>();
      if (yearPositions && yearPositions.length > 0) {
        yearPositions.forEach(pos => {
          positionMap.set(pos.team_id, pos.draft_position);
        });
      } else {
        teams.forEach(team => {
          positionMap.set(team.id, team.draft_position);
        });
      }

      // Recreate draft picks with fresh state
      const picks: { league_id: string; original_team_id: string; current_team_id: string; round: number; pick_number: number; year: number; is_keeper: boolean }[] = [];
      
      for (let round = 1; round <= roundsToUse; round++) {
        const orderedTeams = [...teams].sort((a, b) => {
          const aPos = positionMap.get(a.id) ?? a.draft_position;
          const bPos = positionMap.get(b.id) ?? b.draft_position;
          return round % 2 === 1 ? aPos - bPos : bPos - aPos;
        });
        
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

      const { error: insertError } = await supabase
        .from('draft_picks')
        .insert(picks);
      
      if (insertError) throw insertError;

      return { leagueId, year };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['draft_picks', data.leagueId, data.year] });
      queryClient.invalidateQueries({ queryKey: ['draft_state', data.leagueId, data.year] });
      queryClient.invalidateQueries({ queryKey: ['trades', data.leagueId] });
      queryClient.invalidateQueries({ queryKey: ['leagues'] });
      queryClient.invalidateQueries({ queryKey: ['league', data.leagueId] });
      toast({ title: 'Draft reset successfully' });
    },
    onError: (error) => {
      toast({ title: 'Error resetting draft', description: error.message, variant: 'destructive' });
    },
  });
}
