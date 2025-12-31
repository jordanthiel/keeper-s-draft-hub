import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Check last sync time
    const { data: syncData } = await supabase
      .from('players_last_sync')
      .select('synced_at')
      .eq('id', 1)
      .maybeSingle();

    if (syncData) {
      const lastSync = new Date(syncData.synced_at);
      const now = new Date();
      const hoursSinceSync = (now.getTime() - lastSync.getTime()) / (1000 * 60 * 60);
      
      if (hoursSinceSync < 24) {
        return new Response(
          JSON.stringify({ 
            success: true, 
            message: `Players were synced ${Math.round(hoursSinceSync)} hours ago. Next sync available in ${Math.round(24 - hoursSinceSync)} hours.`,
            skipped: true
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    console.log('Fetching players from Sleeper API...');
    
    // Fetch players from Sleeper API
    const response = await fetch('https://api.sleeper.app/v1/players/nfl');
    
    if (!response.ok) {
      throw new Error(`Sleeper API error: ${response.status}`);
    }

    const playersData = await response.json();
    console.log(`Fetched ${Object.keys(playersData).length} players from Sleeper`);

    // Filter to only relevant positions and active players
    const relevantPositions = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];
    const players = Object.entries(playersData)
      .filter(([_, player]: [string, any]) => {
        return player.position && 
               relevantPositions.includes(player.position) &&
               player.active !== false;
      })
      .map(([id, player]: [string, any]) => ({
        id,
        first_name: player.first_name || null,
        last_name: player.last_name || null,
        full_name: player.full_name || `${player.first_name || ''} ${player.last_name || ''}`.trim() || id,
        position: player.position,
        team: player.team || null,
        status: player.status || null,
        years_exp: player.years_exp || null,
        search_rank: player.search_rank || 9999,
        updated_at: new Date().toISOString()
      }));

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
        count: players.length
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
