-- Create league_settings table to store year-specific league settings
CREATE TABLE public.league_settings (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    league_id UUID NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
    year INTEGER NOT NULL,
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
    num_keepers INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(league_id, year)
);

-- Enable RLS
ALTER TABLE public.league_settings ENABLE ROW LEVEL SECURITY;

-- Create public read/write policies
CREATE POLICY "Allow public read on league_settings" ON public.league_settings FOR SELECT USING (true);
CREATE POLICY "Allow public insert on league_settings" ON public.league_settings FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on league_settings" ON public.league_settings FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on league_settings" ON public.league_settings FOR DELETE USING (true);

-- Create index for faster lookups
CREATE INDEX idx_league_settings_league_year ON public.league_settings(league_id, year);

-- Create updated_at trigger
CREATE TRIGGER update_league_settings_updated_at
    BEFORE UPDATE ON public.league_settings
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();


