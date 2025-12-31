-- Create leagues table
CREATE TABLE public.leagues (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    num_teams INTEGER NOT NULL DEFAULT 12,
    num_rounds INTEGER NOT NULL DEFAULT 15,
    draft_time_seconds INTEGER NOT NULL DEFAULT 120,
    qb_slots INTEGER NOT NULL DEFAULT 1,
    rb_slots INTEGER NOT NULL DEFAULT 2,
    wr_slots INTEGER NOT NULL DEFAULT 2,
    te_slots INTEGER NOT NULL DEFAULT 1,
    flex_slots INTEGER NOT NULL DEFAULT 2,
    k_slots INTEGER NOT NULL DEFAULT 1,
    def_slots INTEGER NOT NULL DEFAULT 1,
    bench_slots INTEGER NOT NULL DEFAULT 6,
    current_pick INTEGER DEFAULT 1,
    current_round INTEGER DEFAULT 1,
    draft_status TEXT NOT NULL DEFAULT 'not_started' CHECK (draft_status IN ('not_started', 'in_progress', 'completed')),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create teams table
CREATE TABLE public.teams (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    league_id UUID NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    draft_position INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(league_id, draft_position)
);

-- Create players table (from Sleeper API)
CREATE TABLE public.players (
    id TEXT PRIMARY KEY, -- Sleeper player ID
    first_name TEXT,
    last_name TEXT,
    full_name TEXT NOT NULL,
    position TEXT,
    team TEXT,
    status TEXT,
    years_exp INTEGER,
    search_rank INTEGER,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create keepers table
CREATE TABLE public.keepers (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
    player_id TEXT NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
    round_cost INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(team_id, player_id)
);

-- Create draft_picks table
CREATE TABLE public.draft_picks (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    league_id UUID NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
    original_team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
    current_team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
    round INTEGER NOT NULL,
    pick_number INTEGER, -- Overall pick number (set during draft)
    year INTEGER NOT NULL,
    player_id TEXT REFERENCES public.players(id) ON DELETE SET NULL,
    is_keeper BOOLEAN DEFAULT FALSE,
    picked_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(league_id, round, original_team_id, year)
);

-- Create pick_trades table
CREATE TABLE public.pick_trades (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    league_id UUID NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
    from_team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
    to_team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
    draft_pick_id UUID NOT NULL REFERENCES public.draft_picks(id) ON DELETE CASCADE,
    traded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create players_last_sync table to track API syncs
CREATE TABLE public.players_last_sync (
    id INTEGER PRIMARY KEY DEFAULT 1,
    synced_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    CHECK (id = 1)
);

-- Enable RLS on all tables (but allow public access since this is a shared draft board)
ALTER TABLE public.leagues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.keepers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.draft_picks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pick_trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.players_last_sync ENABLE ROW LEVEL SECURITY;

-- Create public read/write policies (shared draft board for friends)
CREATE POLICY "Allow public read on leagues" ON public.leagues FOR SELECT USING (true);
CREATE POLICY "Allow public insert on leagues" ON public.leagues FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on leagues" ON public.leagues FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on leagues" ON public.leagues FOR DELETE USING (true);

CREATE POLICY "Allow public read on teams" ON public.teams FOR SELECT USING (true);
CREATE POLICY "Allow public insert on teams" ON public.teams FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on teams" ON public.teams FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on teams" ON public.teams FOR DELETE USING (true);

CREATE POLICY "Allow public read on players" ON public.players FOR SELECT USING (true);
CREATE POLICY "Allow public insert on players" ON public.players FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on players" ON public.players FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on players" ON public.players FOR DELETE USING (true);

CREATE POLICY "Allow public read on keepers" ON public.keepers FOR SELECT USING (true);
CREATE POLICY "Allow public insert on keepers" ON public.keepers FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on keepers" ON public.keepers FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on keepers" ON public.keepers FOR DELETE USING (true);

CREATE POLICY "Allow public read on draft_picks" ON public.draft_picks FOR SELECT USING (true);
CREATE POLICY "Allow public insert on draft_picks" ON public.draft_picks FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on draft_picks" ON public.draft_picks FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on draft_picks" ON public.draft_picks FOR DELETE USING (true);

CREATE POLICY "Allow public read on pick_trades" ON public.pick_trades FOR SELECT USING (true);
CREATE POLICY "Allow public insert on pick_trades" ON public.pick_trades FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow public read on players_last_sync" ON public.players_last_sync FOR SELECT USING (true);
CREATE POLICY "Allow public insert on players_last_sync" ON public.players_last_sync FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on players_last_sync" ON public.players_last_sync FOR UPDATE USING (true);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add triggers for updated_at
CREATE TRIGGER update_leagues_updated_at
    BEFORE UPDATE ON public.leagues
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_players_updated_at
    BEFORE UPDATE ON public.players
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for draft_picks to see live draft updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.draft_picks;
ALTER PUBLICATION supabase_realtime ADD TABLE public.leagues;