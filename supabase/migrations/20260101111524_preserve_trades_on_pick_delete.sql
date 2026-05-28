-- Change pick_trades.draft_pick_id to allow preserving trades when picks are deleted
-- First, drop the existing foreign key constraint
ALTER TABLE public.pick_trades
DROP CONSTRAINT IF EXISTS pick_trades_draft_pick_id_fkey;

-- Make draft_pick_id nullable so trades can persist even when picks are deleted
ALTER TABLE public.pick_trades
ALTER COLUMN draft_pick_id DROP NOT NULL;

-- Add the foreign key constraint back with ON DELETE SET NULL
ALTER TABLE public.pick_trades
ADD CONSTRAINT pick_trades_draft_pick_id_fkey
FOREIGN KEY (draft_pick_id)
REFERENCES public.draft_picks(id)
ON DELETE SET NULL;


