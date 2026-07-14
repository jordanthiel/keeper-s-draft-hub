import { useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import {
  useLeague,
  useTeams,
  useKeepers,
  useAddKeeper,
  useRemoveKeeper,
  useDraftPicks,
  useAllKeepers,
  useTeamRoster,
} from '@/hooks/useLeague';
import { useLeaguePermissions } from '@/hooks/useLeaguePermissions';
import { useTeamAccess } from '@/contexts/TeamAccessContext';
import { useToast } from '@/hooks/use-toast';
import { PriorRosterEditor } from '@/components/PriorRosterEditor';
import { PositionBadge } from '@/components/PositionBadge';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from '@/components/ui/input-otp';
import {
  ArrowLeft,
  LayoutGrid,
  ArrowLeftRight,
  Hash,
  Mail,
  Star,
  Trash2,
  Layers,
  Clock,
  Trophy,
  KeyRound,
  Plus,
} from 'lucide-react';
import { Keeper, League, priorSeasonYear } from '@/lib/types';

const POSITION_ORDER = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'] as const;
type CountedPosition = (typeof POSITION_ORDER)[number];

function slotForPosition(league: League, position: CountedPosition) {
  const map: Record<CountedPosition, number> = {
    QB: league.qb_slots,
    RB: league.rb_slots,
    WR: league.wr_slots,
    TE: league.te_slots,
    K: league.k_slots,
    DEF: league.def_slots,
  };
  return map[position];
}

function isFlexEligible(position: string) {
  return position === 'RB' || position === 'WR' || position === 'TE';
}

const draftStatusLabel = {
  not_started: 'Not started',
  in_progress: 'In progress',
  completed: 'Completed',
} as const;

export default function TeamPage() {
  const { leagueId, teamId } = useParams<{ leagueId: string; teamId: string }>();
  const navigate = useNavigate();
  const { data: league, isLoading: leagueLoading } = useLeague(leagueId);
  const { data: teams = [], isLoading: teamsLoading } = useTeams(leagueId);
  const team = teams.find(t => t.id === teamId);
  const { data: keepers = [], isLoading: keepersLoading } = useKeepers(teamId);
  const { data: allKeepers = [] } = useAllKeepers(leagueId);
  const currentYear = new Date().getFullYear();
  const seasonYear = priorSeasonYear(currentYear);
  const { data: roster = [], isLoading: rosterLoading } = useTeamRoster(teamId, seasonYear);
  const { data: picks = [] } = useDraftPicks(leagueId, currentYear);
  const addKeeper = useAddKeeper();
  const removeKeeper = useRemoveKeeper();
  const { toast } = useToast();
  const { isAdmin, canEditTeam } = useLeaguePermissions(league);
  const { getAccess, getAccessCode, accessTeam, clearAccess } = useTeamAccess();
  const [unlockCode, setUnlockCode] = useState('');
  const [unlocking, setUnlocking] = useState(false);
  const [rosterFilter, setRosterFilter] = useState('');
  const [overLimitConfirm, setOverLimitConfirm] = useState<{
    playerId: string;
    playerName: string;
    position: CountedPosition;
    have: number;
    slots: number;
  } | null>(null);

  const canEdit = !!team && canEditTeam(team.id);
  const session = leagueId ? getAccess(leagueId) : null;
  const isLoading = leagueLoading || teamsLoading;
  const draftInitialized = picks.length > 0;

  const teamPicks = picks
    .filter(p => p.current_team_id === teamId)
    .sort((a, b) => a.round - b.round || (a.pick_number ?? 0) - (b.pick_number ?? 0));

  const keptByOthers = new Set(
    allKeepers.filter(k => k.team_id !== teamId).map(k => k.player_id)
  );
  const myKeeperIds = new Set(keepers.map(k => k.player_id));

  const countPosition = (position: CountedPosition) => {
    let count = 0;
    keepers.forEach(k => {
      if (k.player?.position === position) count++;
    });
    teamPicks.forEach(p => {
      if (!p.player_id || p.is_keeper) return;
      if (p.player?.position === position) count++;
    });
    return count;
  };

  const confirmAddKeeper = async (playerId: string) => {
    if (!team || !league) return;
    await addKeeper.mutateAsync({
      team_id: team.id,
      player_id: playerId,
      asAdmin: isAdmin,
      access_code: getAccessCode(league.id),
    });
    setOverLimitConfirm(null);
  };

  const handleAddKeeper = async (playerId: string, position: string | null | undefined, playerName: string) => {
    if (!team || !league) return;
    if (keepers.length >= league.num_keepers) {
      toast({
        title: 'Keeper limit reached',
        description: `This league allows ${league.num_keepers} keeper${league.num_keepers === 1 ? '' : 's'} per team.`,
        variant: 'destructive',
      });
      return;
    }
    if (position && POSITION_ORDER.includes(position as CountedPosition)) {
      const pos = position as CountedPosition;
      const have = countPosition(pos);
      const slots = slotForPosition(league, pos);
      if (have >= slots) {
        setOverLimitConfirm({
          playerId,
          playerName,
          position: pos,
          have,
          slots,
        });
        return;
      }
    }
    await confirmAddKeeper(playerId);
  };

  const handleRemoveKeeper = async (keeper: Keeper) => {
    if (!league) return;
    await removeKeeper.mutateAsync({
      id: keeper.id,
      teamId: keeper.team_id,
      asAdmin: isAdmin,
      access_code: getAccessCode(league.id),
    });
  };

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!leagueId) return;
    setUnlocking(true);
    try {
      const unlocked = await accessTeam(leagueId, unlockCode);
      if (unlocked && unlocked.id !== teamId) {
        navigate(`/league/${leagueId}/team/${unlocked.id}`, { replace: true });
      }
      setUnlockCode('');
    } finally {
      setUnlocking(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container max-w-3xl py-8 space-y-4">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  if (!league || !team) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <h1 className="text-2xl font-display">Team not found</h1>
          <Link to="/">
            <Button>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Home
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  if (!canEdit) {
    return (
      <div className="min-h-screen bg-background">
        <header className="border-b border-border">
          <div className="container max-w-3xl py-4 flex items-center gap-3">
            <Link to="/">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-xl font-display">{team.name}</h1>
              <p className="text-sm text-muted-foreground">{league.name}</p>
            </div>
          </div>
        </header>
        <main className="container max-w-md py-12">
          <Card className="glass">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <KeyRound className="h-5 w-5 text-primary" />
                Enter team code to manage
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleUnlock} className="space-y-4">
                <div className="space-y-2">
                  <Label>Access code for {team.name}</Label>
                  <InputOTP maxLength={6} value={unlockCode} onChange={setUnlockCode}>
                    <InputOTPGroup>
                      <InputOTPSlot index={0} />
                      <InputOTPSlot index={1} />
                      <InputOTPSlot index={2} />
                      <InputOTPSlot index={3} />
                      <InputOTPSlot index={4} />
                      <InputOTPSlot index={5} />
                    </InputOTPGroup>
                  </InputOTP>
                </div>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={unlockCode.length !== 6 || unlocking}
                >
                  {unlocking ? 'Checking...' : 'Unlock team'}
                </Button>
              </form>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  const positionCounts: Record<CountedPosition, number> = {
    QB: countPosition('QB'),
    RB: countPosition('RB'),
    WR: countPosition('WR'),
    TE: countPosition('TE'),
    K: countPosition('K'),
    DEF: countPosition('DEF'),
  };

  const slotTargets: Record<CountedPosition, number> = {
    QB: league.qb_slots,
    RB: league.rb_slots,
    WR: league.wr_slots,
    TE: league.te_slots,
    K: league.k_slots,
    DEF: league.def_slots,
  };

  const flexEligible =
    positionCounts.RB + positionCounts.WR + positionCounts.TE;
  const starterSlots =
    league.qb_slots +
    league.rb_slots +
    league.wr_slots +
    league.te_slots +
    league.flex_slots +
    league.k_slots +
    league.def_slots;
  const totalPlayers = Object.values(positionCounts).reduce((a, b) => a + b, 0);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border sticky top-0 z-40 bg-background/95 backdrop-blur">
        <div className="container max-w-3xl py-4 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <Link to="/">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl font-display truncate">{team.name}</h1>
                {draftInitialized && (
                  <Badge variant="outline" className="font-display">
                    #{team.draft_position}
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground truncate">{league.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Link to={`/league/${league.id}`}>
              <Button variant="outline" size="sm">
                <LayoutGrid className="h-4 w-4 mr-2" />
                Draft board
              </Button>
            </Link>
            {session && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  clearAccess(league.id);
                  navigate('/');
                }}
              >
                Leave team
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="container max-w-3xl py-6 space-y-6">
        {/* Team info */}
        <div className={`grid gap-3 sm:grid-cols-2 ${draftInitialized ? 'lg:grid-cols-4' : 'lg:grid-cols-3'}`}>
          {draftInitialized && (
            <Card className="glass">
              <CardContent className="p-4 flex items-center gap-3">
                <Hash className="h-5 w-5 text-primary shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">Draft position</p>
                  <p className="text-xl font-display">#{team.draft_position}</p>
                </div>
              </CardContent>
            </Card>
          )}
          <Card className="glass">
            <CardContent className="p-4 flex items-center gap-3">
              <Trophy className="h-5 w-5 text-primary shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Draft status</p>
                <p className="font-medium">{draftStatusLabel[league.draft_status]}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="glass">
            <CardContent className="p-4 flex items-center gap-3">
              <Layers className="h-5 w-5 text-primary shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Rounds</p>
                <p className="font-medium">{league.num_rounds}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="glass">
            <CardContent className="p-4 flex items-center gap-3">
              <Clock className="h-5 w-5 text-primary shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Pick clock</p>
                <p className="font-medium">{league.draft_time_seconds}s</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {team.email && (
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            <Mail className="h-4 w-4" />
            {team.email}
          </p>
        )}

        <Card className="glass">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between gap-2 text-base">
              <span>Position breakdown</span>
              <span className="text-sm font-normal text-muted-foreground">
                {totalPlayers} players · {starterSlots} starters + {league.bench_slots} bench
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              {POSITION_ORDER.map(pos => {
                const have = positionCounts[pos];
                const need = slotTargets[pos];
                const filled = need > 0 && have >= need;
                return (
                  <div
                    key={pos}
                    className="rounded-lg border border-border bg-muted/30 px-2 py-3 text-center space-y-1.5"
                  >
                    <PositionBadge position={pos} />
                    <p className="font-display text-xl leading-none">
                      {have}
                      <span className="text-sm text-muted-foreground font-sans font-normal">
                        /{need}
                      </span>
                    </p>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      {filled ? 'Filled' : need === 0 ? '—' : `${Math.max(need - have, 0)} short`}
                    </p>
                  </div>
                );
              })}
            </div>
            <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              <span>
                FLEX eligible (RB/WR/TE):{' '}
                <span className="text-foreground font-medium">{flexEligible}</span>
                <span className="text-muted-foreground"> / {league.flex_slots} slots</span>
              </span>
              <span className="hidden sm:inline">·</span>
              <span>
                Keepers:{' '}
                <span className="text-foreground font-medium">
                  {keepers.length}/{league.num_keepers}
                </span>
              </span>
            </div>
          </CardContent>
        </Card>

        {isAdmin && <PriorRosterEditor team={team} />}

        {/* Keepers — chosen from last year's roster */}
        <Card className="glass">
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-2 text-xl font-display">
              <span className="flex items-center gap-2">
                <Star className="h-5 w-5 text-accent" />
                Keepers
              </span>
              <Badge variant="outline">
                {keepers.length}/{league.num_keepers}
              </Badge>
            </CardTitle>
            <p className="text-sm text-muted-foreground font-normal">
              Select up to {league.num_keepers} keeper{league.num_keepers === 1 ? '' : 's'} from your{' '}
              {seasonYear} roster.
            </p>
          </CardHeader>
          <CardContent className="space-y-5">
            {rosterLoading || keepersLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : roster.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">
                {isAdmin
                  ? `Add last year’s (${seasonYear}) roster above, then choose keepers from it.`
                  : `Waiting for the league admin to set your ${seasonYear} roster.`}
              </p>
            ) : (
              <>
                <Input
                  value={rosterFilter}
                  onChange={e => setRosterFilter(e.target.value)}
                  placeholder="Filter roster..."
                  className="bg-secondary"
                />
                <ul className="space-y-2">
                  {roster
                    .filter(entry => {
                      const q = rosterFilter.trim().toLowerCase();
                      if (!q) return true;
                      return (
                        entry.player?.full_name?.toLowerCase().includes(q) ||
                        entry.player?.team?.toLowerCase().includes(q) ||
                        entry.player?.position?.toLowerCase().includes(q)
                      );
                    })
                    .map(entry => {
                      const isKept = myKeeperIds.has(entry.player_id);
                      const taken = keptByOthers.has(entry.player_id);
                      const keeper = keepers.find(k => k.player_id === entry.player_id);
                      return (
                        <li
                          key={entry.id}
                          className={`flex items-center justify-between gap-3 p-3 rounded-lg border ${
                            isKept
                              ? 'bg-accent/10 border-accent/20'
                              : 'border-border bg-muted/10'
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <PositionBadge position={entry.player?.position || null} />
                            <div className="min-w-0">
                              <p className="font-medium truncate">{entry.player?.full_name}</p>
                              <p className="text-sm text-muted-foreground">
                                {entry.player?.team || 'FA'}
                                {entry.player?.position ? ` · ${entry.player.position}` : ''}
                                {taken && !isKept ? ' · Kept by another team' : ''}
                              </p>
                            </div>
                          </div>
                          {isKept && keeper ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-muted-foreground hover:text-destructive shrink-0"
                              onClick={() => handleRemoveKeeper(keeper)}
                              disabled={removeKeeper.isPending}
                            >
                              <Trash2 className="h-4 w-4 mr-1" />
                              Remove
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="secondary"
                              className="shrink-0"
                              disabled={
                                taken ||
                                addKeeper.isPending ||
                                keepers.length >= league.num_keepers
                              }
                              onClick={() =>
                                handleAddKeeper(
                                  entry.player_id,
                                  entry.player?.position,
                                  entry.player?.full_name || 'This player'
                                )
                              }
                            >
                              <Plus className="h-4 w-4 mr-1" />
                              Keep
                            </Button>
                          )}
                        </li>
                      );
                    })}
                </ul>
              </>
            )}
          </CardContent>
        </Card>

        <AlertDialog
          open={!!overLimitConfirm}
          onOpenChange={open => {
            if (!open) setOverLimitConfirm(null);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Over {overLimitConfirm?.position} slots</AlertDialogTitle>
              <AlertDialogDescription className="space-y-2">
                <span className="block">
                  Keeping <strong>{overLimitConfirm?.playerName}</strong> would put you at{' '}
                  <strong>
                    {(overLimitConfirm?.have ?? 0) + 1} {overLimitConfirm?.position}
                    {(overLimitConfirm?.have ?? 0) + 1 === 1 ? '' : 's'}
                  </strong>
                  , but this league only has{' '}
                  <strong>
                    {overLimitConfirm?.slots} {overLimitConfirm?.position} slot
                    {(overLimitConfirm?.slots ?? 0) === 1 ? '' : 's'}
                  </strong>
                  .
                </span>
                {overLimitConfirm && isFlexEligible(overLimitConfirm.position) && (
                  <span className="block">
                    Extra {overLimitConfirm.position}s can sit in FLEX ({league.flex_slots}) or
                    bench ({league.bench_slots}), if you have room.
                  </span>
                )}
                <span className="block">Continue anyway?</span>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={addKeeper.isPending}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                disabled={addKeeper.isPending || !overLimitConfirm}
                onClick={e => {
                  e.preventDefault();
                  if (overLimitConfirm) {
                    void confirmAddKeeper(overLimitConfirm.playerId);
                  }
                }}
              >
                {addKeeper.isPending ? 'Keeping...' : 'Continue'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Draft picks */}
        <Card className="glass">
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle className="text-xl font-display">Your {currentYear} picks</CardTitle>
            {isAdmin && (
              <Link to={`/league/${league.id}?tab=trades`}>
                <Button variant="outline" size="sm">
                  <ArrowLeftRight className="h-4 w-4 mr-2" />
                  Trade
                </Button>
              </Link>
            )}
          </CardHeader>
          <CardContent>
            {teamPicks.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Draft picks haven&apos;t been initialized yet.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {teamPicks.map(pick => {
                  const original = teams.find(t => t.id === pick.original_team_id);
                  const traded = pick.original_team_id !== pick.current_team_id;
                  return (
                    <li
                      key={pick.id}
                      className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                    >
                      <div>
                        <p className="font-medium">
                          Round {pick.round}
                          {pick.pick_number != null && (
                            <span className="text-muted-foreground font-normal">
                              {' '}
                              · Overall #{pick.pick_number}
                            </span>
                          )}
                        </p>
                        {traded && (
                          <p className="text-xs text-muted-foreground">
                            Via trade (orig. {original?.name || 'another team'})
                          </p>
                        )}
                      </div>
                      <div className="text-right text-sm min-w-0">
                        {pick.player ? (
                          <div className="flex items-center gap-2 justify-end">
                            <PositionBadge position={pick.player.position} />
                            <span className="truncate">{pick.player.full_name}</span>
                          </div>
                        ) : pick.is_keeper ? (
                          <Badge variant="secondary">Keeper slot</Badge>
                        ) : (
                          <span className="text-muted-foreground">Available</span>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
