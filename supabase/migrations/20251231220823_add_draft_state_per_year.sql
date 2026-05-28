-- Create draft_state table to store year-specific draft status and progress
CREATE TABLE public.draft_state (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    league_id UUID NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
    year INTEGER NOT NULL,
    draft_status TEXT NOT NULL DEFAULT 'not_started' CHECK (draft_status IN ('not_started', 'in_progress', 'completed')),
    current_pick INTEGER DEFAULT 1,
    current_round INTEGER DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(league_id, year)
);

-- Enable RLS
ALTER TABLE public.draft_state ENABLE ROW LEVEL SECURITY;

-- Create public read/write policies
CREATE POLICY "Allow public read on draft_state" ON public.draft_state FOR SELECT USING (true);
CREATE POLICY "Allow public insert on draft_state" ON public.draft_state FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on draft_state" ON public.draft_state FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on draft_state" ON public.draft_state FOR DELETE USING (true);

-- Create index for faster lookups
CREATE INDEX idx_draft_state_league_year ON public.draft_state(league_id, year);

-- Create updated_at trigger
CREATE TRIGGER update_draft_state_updated_at
    BEFORE UPDATE ON public.draft_state
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();


