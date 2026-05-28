-- Create team_draft_positions table to store year-specific draft positions
CREATE TABLE public.team_draft_positions (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
    league_id UUID NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
    year INTEGER NOT NULL,
    draft_position INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(team_id, league_id, year)
);

-- Enable RLS
ALTER TABLE public.team_draft_positions ENABLE ROW LEVEL SECURITY;

-- Create public read/write policies
CREATE POLICY "Allow public read on team_draft_positions" ON public.team_draft_positions FOR SELECT USING (true);
CREATE POLICY "Allow public insert on team_draft_positions" ON public.team_draft_positions FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on team_draft_positions" ON public.team_draft_positions FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on team_draft_positions" ON public.team_draft_positions FOR DELETE USING (true);

-- Create index for faster lookups
CREATE INDEX idx_team_draft_positions_league_year ON public.team_draft_positions(league_id, year);
CREATE INDEX idx_team_draft_positions_team_league_year ON public.team_draft_positions(team_id, league_id, year);

