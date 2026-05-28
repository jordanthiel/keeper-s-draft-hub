-- Remove round_cost column from keepers table
-- Keepers are just players that carry over from one season to another, they don't need a round
ALTER TABLE public.keepers DROP COLUMN IF EXISTS round_cost;


