import { Player } from '@/lib/types';

const NFL_TEAM_PRIMARY: Record<string, string> = {
  ARI: '#97233F',
  ATL: '#A71930',
  BAL: '#241773',
  BUF: '#00338D',
  CAR: '#0085CA',
  CHI: '#0B162A',
  CIN: '#FB4F14',
  CLE: '#311D00',
  DAL: '#003594',
  DEN: '#FB4F14',
  DET: '#0076B6',
  GB: '#203731',
  HOU: '#03202F',
  IND: '#002C5F',
  JAX: '#006778',
  KC: '#E31837',
  LV: '#000000',
  LAC: '#0080C6',
  LAR: '#003594',
  MIA: '#008E97',
  MIN: '#4F2683',
  NE: '#002244',
  NO: '#D3BC8D',
  NYG: '#0B2265',
  NYJ: '#125740',
  PHI: '#004C54',
  PIT: '#FFB612',
  SEA: '#002244',
  SF: '#AA0000',
  TB: '#D50A0A',
  TEN: '#0C2340',
  WAS: '#5A1414',
  WSH: '#5A1414',
};

export function nflTeamLogoUrl(team: string) {
  return `https://sleepercdn.com/images/team_logos/nfl/${team.toLowerCase()}.png`;
}

export function nflTeamColor(team: string | null | undefined) {
  if (!team) return 'hsl(var(--primary))';
  return NFL_TEAM_PRIMARY[team.toUpperCase()] ?? 'hsl(var(--primary))';
}

export function playerHeadshotUrl(player: Player, size: 'thumb' | 'full' = 'thumb') {
  if (player.position === 'DEF') {
    const abbr = player.team || player.id;
    return nflTeamLogoUrl(abbr);
  }
  const path = size === 'full' ? '' : 'thumb/';
  return `https://sleepercdn.com/content/nfl/players/${path}${player.id}.jpg`;
}

export function playerDisplayName(player: Player) {
  if (player.last_name) return player.last_name;
  const parts = player.full_name.trim().split(/\s+/);
  return parts[parts.length - 1] || player.full_name;
}

export function ordinal(n: number) {
  const v = n % 100;
  const suffix = v >= 11 && v <= 13
    ? 'th'
    : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th';
  return `${n}${suffix}`;
}
