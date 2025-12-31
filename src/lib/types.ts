export interface League {
  id: string;
  name: string;
  num_teams: number;
  num_rounds: number;
  draft_time_seconds: number;
  qb_slots: number;
  rb_slots: number;
  wr_slots: number;
  te_slots: number;
  flex_slots: number;
  k_slots: number;
  def_slots: number;
  bench_slots: number;
  current_pick: number;
  current_round: number;
  draft_status: 'not_started' | 'in_progress' | 'completed';
  created_at: string;
  updated_at: string;
}

export interface Team {
  id: string;
  league_id: string;
  name: string;
  draft_position: number;
  created_at: string;
}

export interface Player {
  id: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string;
  position: string | null;
  team: string | null;
  status: string | null;
  years_exp: number | null;
  search_rank: number | null;
  updated_at: string;
}

export interface Keeper {
  id: string;
  team_id: string;
  player_id: string;
  round_cost: number;
  created_at: string;
  player?: Player;
}

export interface DraftPick {
  id: string;
  league_id: string;
  original_team_id: string;
  current_team_id: string;
  round: number;
  pick_number: number | null;
  year: number;
  player_id: string | null;
  is_keeper: boolean;
  picked_at: string | null;
  created_at: string;
  player?: Player;
  original_team?: Team;
  current_team?: Team;
}

export interface PickTrade {
  id: string;
  league_id: string;
  from_team_id: string;
  to_team_id: string;
  draft_pick_id: string;
  traded_at: string;
}

export type Position = 'QB' | 'RB' | 'WR' | 'TE' | 'K' | 'DEF';

export const POSITION_COLORS: Record<Position, string> = {
  QB: 'position-qb',
  RB: 'position-rb',
  WR: 'position-wr',
  TE: 'position-te',
  K: 'position-k',
  DEF: 'position-def',
};
