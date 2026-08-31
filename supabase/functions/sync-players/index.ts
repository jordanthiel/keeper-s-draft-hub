import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const OFFENSE_POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];
/** Sleeper primary positions for individual defensive players */
const IDP_POSITIONS = [
  'DL', 'LB', 'DB', 'DE', 'DT', 'NT',
  'CB', 'S', 'FS', 'SS',
  'ILB', 'OLB',
];
/** Sleeper fantasy IDP buckets */
const IDP_FANTASY = ['DL', 'LB', 'DB'];

function isRelevantPlayer(player: Record<string, unknown>) {
  if (player.active === false) return false;
  const pos = player.position as string | undefined;
  const fps = (player.fantasy_positions as string[] | undefined) ?? [];
  if (pos && OFFENSE_POSITIONS.includes(pos)) return true;
  if (pos && IDP_POSITIONS.includes(pos)) return true;
  if (fps.some((p) => IDP_FANTASY.includes(p) || IDP_POSITIONS.includes(p))) return true;
  return false;
}

/** Prefer fantasy IDP bucket (DL/LB/DB) when the player is a defensive specialist. */
function resolvePosition(player: Record<string, unknown>): string | null {
  const pos = (player.position as string | undefined) ?? null;
  const fps = (player.fantasy_positions as string[] | undefined) ?? [];
  const idpFantasy = fps.filter((p) => IDP_FANTASY.includes(p));

  if (pos && IDP_POSITIONS.includes(pos) && idpFantasy.length > 0) {
    return idpFantasy[0];
  }
  return pos;
}

function resolveFullName(id: string, player: Record<string, unknown>): string {
  const full = player.full_name as string | undefined;
  if (full?.trim()) return full.trim();
  const first = (player.first_name as string | undefined) ?? '';
  const last = (player.last_name as string | undefined) ?? '';
  const combined = `${first} ${last}`.trim();
  return combined || id;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const authHeader = req.headers.get('Authorization');

    // Manual auth: platform verify_jwt breaks on local ES256 signing keys.
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing authorization' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: userError,
    } = await authClient.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Allow an early re-sync when IDP players were never imported
    const { count: idpCount } = await supabase
      .from('players')
      .select('*', { count: 'exact', head: true })
      .in('position', [...IDP_FANTASY, ...IDP_POSITIONS]);
    const needsIdpBackfill = (idpCount ?? 0) < 50;

    // Check last sync time
    const { data: syncData } = await supabase
      .from('players_last_sync')
      .select('synced_at')
      .eq('id', 1)
      .maybeSingle();

    if (syncData && !needsIdpBackfill) {
      const lastSync = new Date(syncData.synced_at);
      const now = new Date();
      const hoursSinceSync = (now.getTime() - lastSync.getTime()) / (1000 * 60 * 60);

      if (hoursSinceSync < 24) {
        return new Response(
          JSON.stringify({
            success: true,
            message: `Players were synced ${Math.round(hoursSinceSync)} hours ago. Next sync available in ${Math.round(24 - hoursSinceSync)} hours.`,
            skipped: true,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    console.log('Fetching players from Sleeper API...');
    if (needsIdpBackfill) {
      console.log('IDP backfill needed — bypassing 24h sync cooldown');
    }

    // Fetch players from Sleeper API
    const response = await fetch('https://api.sleeper.app/v1/players/nfl');

    if (!response.ok) {
      throw new Error(`Sleeper API error: ${response.status}`);
    }

    const playersData = await response.json();
    console.log(`Fetched ${Object.keys(playersData).length} players from Sleeper`);

    const players = Object.entries(playersData)
      .filter(([_, player]) => isRelevantPlayer(player as Record<string, unknown>))
      .map(([id, raw]) => {
        const player = raw as Record<string, unknown>;
        return {
          id,
          first_name: (player.first_name as string | null) || null,
          last_name: (player.last_name as string | null) || null,
          full_name: resolveFullName(id, player),
          position: resolvePosition(player),
          team: (player.team as string | null) || null,
          status: (player.status as string | null) || null,
          years_exp: (player.years_exp as number | null) || null,
          search_rank: (player.search_rank as number | null) || 9999,
          updated_at: new Date().toISOString(),
        };
      });

    console.log(`Processing ${players.length} relevant players...`);

    // Upsert players in batches
    const batchSize = 500;
    let processed = 0;

    for (let i = 0; i < players.length; i += batchSize) {
      const batch = players.slice(i, i + batchSize);
      const { error } = await supabase
        .from('players')
        .upsert(batch, { onConflict: 'id' });

      if (error) {
        console.error('Error upserting batch:', error);
        throw error;
      }

      processed += batch.length;
      console.log(`Processed ${processed}/${players.length} players`);
    }

    // Update last sync time
    await supabase
      .from('players_last_sync')
      .upsert({ id: 1, synced_at: new Date().toISOString() });

    console.log('Player sync completed successfully');

    return new Response(
      JSON.stringify({
        success: true,
        message: `Successfully synced ${players.length} players`,
        count: players.length,
        idp_backfill: needsIdpBackfill,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error syncing players:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
