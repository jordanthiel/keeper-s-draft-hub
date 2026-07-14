import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Player } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';

export function usePlayers(searchTerm?: string, position?: string) {
  const trimmed = searchTerm?.trim() ?? '';

  return useQuery({
    queryKey: ['players', trimmed, position],
    queryFn: async () => {
      let query = supabase
        .from('players')
        .select('*')
        .order('search_rank', { ascending: true, nullsFirst: false })
        .limit(50);

      if (trimmed.length > 0) {
        const pattern = `%${trimmed}%`;
        query = query.or(
          `full_name.ilike."${pattern}",first_name.ilike."${pattern}",last_name.ilike."${pattern}"`
        );
      }

      if (position && position !== 'ALL') {
        query = query.eq('position', position);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data as Player[];
    },
    enabled: trimmed.length > 0,
  });
}

export function usePlayerCount() {
  return useQuery({
    queryKey: ['player_count'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('players')
        .select('*', { count: 'exact', head: true });

      if (error) throw error;
      return count || 0;
    },
  });
}

export function useLastSync() {
  return useQuery({
    queryKey: ['last_sync'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('players_last_sync')
        .select('synced_at')
        .eq('id', 1)
        .maybeSingle();

      if (error) throw error;
      return data?.synced_at ? new Date(data.synced_at) : null;
    },
  });
}

export function useSyncPlayers() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('sync-players');

      if (error) throw error;
      if (!data.success) throw new Error(data.error || 'Sync failed');

      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['players'] });
      queryClient.invalidateQueries({ queryKey: ['player_count'] });
      queryClient.invalidateQueries({ queryKey: ['last_sync'] });

      if (data.skipped) {
        toast({
          title: 'Sync skipped',
          description: data.message,
        });
      } else {
        toast({
          title: 'Players synced!',
          description: data.message,
        });
      }
    },
    onError: (error) => {
      toast({
        title: 'Error syncing players',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}
