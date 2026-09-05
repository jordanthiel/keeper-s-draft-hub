import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import {
  useAllKeepers,
  useDraftPicks,
  useLeague,
  useMakePick,
  useTeams,
  useUpdateLeague,
} from '@/hooks/useLeague';
import { useLeaguePermissions } from '@/hooks/useLeaguePermissions';
import { useTeamAccess } from '@/contexts/TeamAccessContext';
import { DraftPick, Keeper, League, Player, Team } from '@/lib/types';
import { formatClock, loadClock, saveClock } from '@/lib/draftClock';
import { PlayerSearch } from '@/components/PlayerSearch';
import { PlayerHeadshot } from '@/components/PlayerHeadshot';
import { PositionBadge } from '@/components/PositionBadge';
import { ErrorModal } from '@/components/ErrorModal';
import { DraftPickReveal, DraftRevealPayload } from '@/components/DraftPickReveal';
import { DraftViewSwitch } from '@/components/DraftViewSwitch';
import { DraftBoard } from '@/components/DraftBoard';
import { Button } from '@/components/ui/button';
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
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import {
  ArrowLeft,
  Clock,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  RotateCcw,
  Star,
  Users,
} from 'lucide-react';

const REVEAL_MS = 2800;
const NEXT_UP_COUNT = 5;

function normalizePosition(position: string | null | undefined): string | null {
  if (!position) return null;
  const normalized = position.trim().toUpperCase();
  if (normalized === 'D/ST' || normalized === 'DST') return 'DEF';
  if (normalized === 'PK') return 'K';
  return normalized;
}

function getPositionCounts(teamId: string, picks: DraftPick[], keepers: Keeper[]) {
  const counts: Record<string, number> = {
    QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DEF: 0, DL: 0, LB: 0, DB: 0,
  };
  const countedPlayerIds = new Set<string>();
  const addPosition = (playerId: string | null | undefined, pos: string | null | undefined) => {
    const normalizedPos = normalizePosition(pos);
    if (!playerId || !normalizedPos || counts[normalizedPos] === undefined || countedPlayerIds.has(playerId)) return;
    countedPlayerIds.add(playerId);
    counts[normalizedPos]++;
  };

  picks
    .filter((p) => p.current_team_id === teamId && p.player_id)
    .forEach((pick) => addPosition(pick.player_id, pick.player?.position));

  keepers
    .filter((k) => k.team_id === teamId)
    .forEach((keeper) => addPosition(keeper.player_id, keeper.player?.position));

  return counts;
}

function getPositionLimit(league: League, position: string) {
  const normalizedPos = normalizePosition(position);
  if (!normalizedPos) return league.bench_slots;
  const slotKey = `${normalizedPos.toLowerCase()}_slots` as keyof League;
  const slots = league[slotKey];
  if (typeof slots === 'number') return slots;
  return league.bench_slots;
}

function teamRoster(teamId: string, picks: DraftPick[], keepers: Keeper[]) {
  const keeperRows = keepers
    .filter((k) => k.team_id === teamId && k.player)
    .sort((a, b) => (a.player?.search_rank ?? 9999) - (b.player?.search_rank ?? 9999));

  const drafted = picks
    .filter((p) => p.current_team_id === teamId && p.player_id && p.player && !p.is_keeper)
    .sort((a, b) => a.round - b.round || (a.pick_number ?? 0) - (b.pick_number ?? 0));

  return { keeperRows, drafted };
}

export default function DraftTheaterPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const view = searchParams.get('view') === 'board' ? 'board' : 'show';
  const currentYear = new Date().getFullYear();
  const { data: league, isLoading: leagueLoading } = useLeague(id);
  const { data: teams = [], isLoading: teamsLoading } = useTeams(id);
  const { data: picks = [], refetch } = useDraftPicks(id, currentYear);
  const { data: keepers = [] } = useAllKeepers(id);
  const { isAdmin, canStartDraft, accessedTeamId } = useLeaguePermissions(league);
  const { getAccessCode } = useTeamAccess();
  const makePick = useMakePick();
  const updateLeague = useUpdateLeague();

  const [timeLeft, setTimeLeft] = useState(league?.draft_time_seconds ?? 90);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [reveal, setReveal] = useState<DraftRevealPayload | null>(null);
  const [errorModal, setErrorModal] = useState({ open: false, title: '', message: '' });
  const [adminOverride, setAdminOverride] = useState<{
    pickId: string;
    player: Player;
    title: string;
    message: string;
  } | null>(null);

  const endsAtRef = useRef<number | null>(null);
  const trackedPickIdRef = useRef<string | null>(null);
  const seenPickIdsRef = useRef<Set<string> | null>(null);
  const skipDetectRef = useRef(false);
  const revealQueueRef = useRef<DraftRevealPayload[]>([]);
  const revealTimerRef = useRef<number | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const unpicked = useMemo(
    () => picks.filter((p) => !p.player_id && !p.is_keeper),
    [picks]
  );
  const currentPick = unpicked[0] ?? null;
  const nextPicks = unpicked.slice(1, NEXT_UP_COUNT + 1);
  const currentTeam = currentPick
    ? teams.find((t) => t.id === currentPick.current_team_id) ?? null
    : null;
  const draftedPlayerIds = picks.filter((p) => p.player_id).map((p) => p.player_id!);
  const keeperPlayerIds = keepers.map((k) => k.player_id).filter(Boolean);
  const draftStatus = league?.draft_status ?? 'not_started';
  const draftInteractive =
    draftStatus === 'in_progress' || (draftStatus === 'completed' && !!currentPick);
  const showTimer = draftStatus === 'in_progress' && !!currentPick;
  const canPick =
    !!currentPick && (isAdmin || accessedTeamId === currentPick.current_team_id);

  const recentPicks = useMemo(
    () =>
      picks
        .filter((p) => p.player_id && p.player)
        .slice()
        .sort((a, b) => {
          const aTime = a.picked_at ? new Date(a.picked_at).getTime() : 0;
          const bTime = b.picked_at ? new Date(b.picked_at).getTime() : 0;
          if (bTime !== aTime) return bTime - aTime;
          return (b.pick_number ?? 0) - (a.pick_number ?? 0);
        })
        .slice(0, 6),
    [picks]
  );

  const roster = currentTeam
    ? teamRoster(currentTeam.id, picks, keepers)
    : { keeperRows: [] as Keeper[], drafted: [] as DraftPick[] };

  const totalPicks = picks.filter((p) => !p.is_keeper).length;
  const madePicks = picks.filter((p) => p.player_id && !p.is_keeper).length;

  const dismissReveal = useCallback(() => {
    if (revealTimerRef.current) {
      window.clearTimeout(revealTimerRef.current);
      revealTimerRef.current = null;
    }
    const queued = revealQueueRef.current.shift();
    setReveal(queued ?? null);
  }, []);

  const showReveal = useCallback((payload: DraftRevealPayload) => {
    setReveal((current) => {
      if (current) {
        revealQueueRef.current.push(payload);
        return current;
      }
      return payload;
    });
  }, []);

  useEffect(() => {
    if (!reveal) return;
    revealTimerRef.current = window.setTimeout(dismissReveal, REVEAL_MS);
    return () => {
      if (revealTimerRef.current) window.clearTimeout(revealTimerRef.current);
    };
  }, [reveal, dismissReveal]);

  useEffect(() => {
    const filled = picks.filter((p) => p.player_id && p.player);
    if (seenPickIdsRef.current === null) {
      seenPickIdsRef.current = new Set(filled.map((p) => p.id));
      return;
    }

    const newlyFilled = filled.filter((p) => !seenPickIdsRef.current!.has(p.id));
    for (const pick of newlyFilled) {
      seenPickIdsRef.current.add(pick.id);
    }

    if (skipDetectRef.current) {
      skipDetectRef.current = false;
      return;
    }

    const latest = newlyFilled
      .slice()
      .sort((a, b) => {
        const aTime = a.picked_at ? new Date(a.picked_at).getTime() : 0;
        const bTime = b.picked_at ? new Date(b.picked_at).getTime() : 0;
        return bTime - aTime;
      })[0];

    if (!latest?.player) return;
    const team = teams.find((t) => t.id === latest.current_team_id);
    showReveal({
      player: latest.player,
      teamName: team?.name ?? latest.current_team?.name ?? 'Unknown',
      team,
      round: latest.round,
      pickNumber: latest.pick_number,
      year: latest.year,
    });
  }, [picks, teams, showReveal]);

  useEffect(() => {
    if (!id) return;
    const channel = supabase
      .channel(`draft-theater-${id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'draft_picks',
          filter: `league_id=eq.${id}`,
        },
        () => {
          refetch();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, refetch]);

  useEffect(() => {
    if (!league || draftStatus !== 'in_progress' || !currentPick) {
      trackedPickIdRef.current = null;
      endsAtRef.current = null;
      setIsTimerRunning(false);
      return;
    }

    if (trackedPickIdRef.current === currentPick.id) return;
    trackedPickIdRef.current = currentPick.id;

    const saved = loadClock(league.id);
    if (saved?.pickId === currentPick.id) {
      if (saved.isRunning && saved.endsAt) {
        const remaining = Math.max(0, Math.ceil((saved.endsAt - Date.now()) / 1000));
        endsAtRef.current = remaining > 0 ? saved.endsAt : null;
        setTimeLeft(remaining);
        setIsTimerRunning(remaining > 0);
        if (remaining <= 0) {
          saveClock(league.id, {
            pickId: currentPick.id,
            endsAt: null,
            remainingSeconds: 0,
            isRunning: false,
          });
        }
      } else {
        endsAtRef.current = null;
        setTimeLeft(Math.max(0, saved.remainingSeconds));
        setIsTimerRunning(false);
      }
      return;
    }

    const endsAt = Date.now() + league.draft_time_seconds * 1000;
    endsAtRef.current = endsAt;
    setTimeLeft(league.draft_time_seconds);
    setIsTimerRunning(true);
    saveClock(league.id, {
      pickId: currentPick.id,
      endsAt,
      remainingSeconds: league.draft_time_seconds,
      isRunning: true,
    });
  }, [currentPick?.id, draftStatus, league]);

  useEffect(() => {
    if (!isTimerRunning || draftStatus !== 'in_progress' || !currentPick || !league) return;

    const interval = window.setInterval(() => {
      const endsAt = endsAtRef.current;
      if (!endsAt) return;
      const remaining = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
      setTimeLeft(remaining);
      if (remaining <= 0) {
        setIsTimerRunning(false);
        endsAtRef.current = null;
        setTimeLeft(0);
        saveClock(league.id, {
          pickId: currentPick.id,
          endsAt: null,
          remainingSeconds: 0,
          isRunning: false,
        });
      }
    }, 250);

    return () => window.clearInterval(interval);
  }, [isTimerRunning, draftStatus, currentPick?.id, league]);

  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        return;
      }
      await (rootRef.current ?? document.documentElement).requestFullscreen();
    } catch {
      // Browser may block without a gesture or if the API is unavailable.
    }
  };

  const handleDraft = async (player: Player) => {
    if (!league || !currentPick || !currentTeam) {
      setErrorModal({
        open: true,
        title: 'NO PICK AVAILABLE',
        message: 'There is no pick currently on the clock.',
      });
      return;
    }

    if (!canPick) {
      setErrorModal({
        open: true,
        title: 'NOT YOUR PICK',
        message: 'Only the team on the clock (or the league admin) can make this selection.',
      });
      return;
    }

    const queueAdminOverride = (title: string, message: string) => {
      if (!isAdmin) {
        setErrorModal({ open: true, title, message });
        return;
      }
      setAdminOverride({
        pickId: currentPick.id,
        player,
        title,
        message,
      });
    };

    if (draftedPlayerIds.includes(player.id)) {
      queueAdminOverride(
        'ALREADY DRAFTED!',
        `${player.full_name} has already been drafted.${isAdmin ? ' Admin can override and assign anyway.' : ''}`
      );
      return;
    }

    if (keeperPlayerIds.includes(player.id)) {
      queueAdminOverride(
        "THAT'S A KEEPER!",
        `${player.full_name} is already someone's keeper.${isAdmin ? ' Admin can override and assign anyway.' : ''}`
      );
      return;
    }

    const normalizedPos = normalizePosition(player.position);
    if (normalizedPos) {
      const counts = getPositionCounts(currentPick.current_team_id, picks, keepers);
      const limit = getPositionLimit(league, normalizedPos);
      if ((counts[normalizedPos] ?? 0) >= limit) {
        queueAdminOverride(
          'TOO MANY AT THAT POSITION!',
          `You already have ${counts[normalizedPos] ?? 0} ${normalizedPos}s and the limit is ${limit}.${isAdmin ? ' Admin can override and pick anyway.' : ''}`
        );
        return;
      }
    }

    try {
      skipDetectRef.current = true;
      seenPickIdsRef.current?.add(currentPick.id);
      showReveal({
        player,
        teamName: currentTeam.name,
        team: currentTeam,
        round: currentPick.round,
        pickNumber: currentPick.pick_number,
        year: currentYear,
      });
      await makePick.mutateAsync({
        pickId: currentPick.id,
        playerId: player.id,
        leagueId: league.id,
        year: currentYear,
        asAdmin: isAdmin,
        access_code: getAccessCode(league.id),
      });
    } catch (error) {
      skipDetectRef.current = false;
      seenPickIdsRef.current?.delete(currentPick.id);
      setReveal(null);
      revealQueueRef.current = [];
      const message = error instanceof Error ? error.message : 'Could not make this pick.';
      setErrorModal({ open: true, title: 'PICK FAILED', message });
    }
  };

  const confirmAdminOverridePick = async () => {
    if (!adminOverride || !league) return;
    if (!currentPick || currentPick.id !== adminOverride.pickId || !currentTeam) {
      setAdminOverride(null);
      setErrorModal({
        open: true,
        title: 'PICK MOVED',
        message: 'The pick on the clock changed. Try selecting the player again.',
      });
      return;
    }

    try {
      skipDetectRef.current = true;
      seenPickIdsRef.current?.add(currentPick.id);
      showReveal({
        player: adminOverride.player,
        teamName: currentTeam.name,
        team: currentTeam,
        round: currentPick.round,
        pickNumber: currentPick.pick_number,
        year: currentYear,
      });
      await makePick.mutateAsync({
        pickId: currentPick.id,
        playerId: adminOverride.player.id,
        leagueId: league.id,
        year: currentYear,
        asAdmin: true,
      });
    } catch (error) {
      skipDetectRef.current = false;
      seenPickIdsRef.current?.delete(currentPick.id);
      setReveal(null);
      revealQueueRef.current = [];
      const message = error instanceof Error ? error.message : 'Could not make this pick.';
      setErrorModal({ open: true, title: 'OVERRIDE FAILED', message });
    } finally {
      setAdminOverride(null);
    }
  };

  const startDraft = async () => {
    if (!league) return;
    await updateLeague.mutateAsync({
      id: league.id,
      draft_status: 'in_progress',
      current_pick: 1,
      current_round: 1,
    });
  };

  const pauseTimer = () => {
    if (!league || !currentPick) return;
    setIsTimerRunning(false);
    endsAtRef.current = null;
    saveClock(league.id, {
      pickId: currentPick.id,
      endsAt: null,
      remainingSeconds: timeLeft,
      isRunning: false,
    });
  };

  const startTimer = () => {
    if (!league || !currentPick) return;
    const seconds = timeLeft > 0 ? timeLeft : league.draft_time_seconds;
    const endsAt = Date.now() + seconds * 1000;
    endsAtRef.current = endsAt;
    setTimeLeft(seconds);
    setIsTimerRunning(true);
    saveClock(league.id, {
      pickId: currentPick.id,
      endsAt,
      remainingSeconds: seconds,
      isRunning: true,
    });
  };

  const resetTimer = () => {
    if (!league || !currentPick) return;
    setTimeLeft(league.draft_time_seconds);
    if (isTimerRunning) {
      const endsAt = Date.now() + league.draft_time_seconds * 1000;
      endsAtRef.current = endsAt;
      saveClock(league.id, {
        pickId: currentPick.id,
        endsAt,
        remainingSeconds: league.draft_time_seconds,
        isRunning: true,
      });
    } else {
      endsAtRef.current = null;
      saveClock(league.id, {
        pickId: currentPick.id,
        endsAt: null,
        remainingSeconds: league.draft_time_seconds,
        isRunning: false,
      });
    }
  };

  if (leagueLoading || teamsLoading) {
    return (
      <div className="flex h-[100dvh] items-center justify-center bg-background">
        <Skeleton className="h-24 w-80" />
      </div>
    );
  }

  if (!league) {
    return (
      <div className="flex h-[100dvh] flex-col items-center justify-center gap-4 bg-background">
        <h1 className="font-display text-3xl">League Not Found</h1>
        <Link to="/">
          <Button>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Home
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      className="relative flex h-[100dvh] flex-col overflow-hidden bg-background"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,hsl(var(--primary)/0.12),transparent_55%)]" />

      <header className="relative z-20 flex items-center justify-between gap-3 border-b border-border/70 bg-background/80 px-3 py-2 backdrop-blur sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <Link to={`/league/${league.id}?tab=draft`}>
            <Button variant="ghost" size="icon" aria-label="Back to league">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div className="min-w-0">
            <div className="truncate font-display text-xl leading-none sm:text-2xl">{league.name}</div>
            <div className="text-xs text-muted-foreground">
              {madePicks}/{totalPicks || league.num_teams * league.num_rounds} picks
            </div>
          </div>
          <DraftViewSwitch leagueId={league.id} current={view} size="lg" />
        </div>

        {showTimer && currentPick && (
          <div className="flex items-center gap-2 sm:gap-3">
            <div
              className={cn(
                'flex items-center gap-2 rounded-lg px-4 py-1.5 font-display text-3xl sm:text-4xl',
                timeLeft <= 0
                  ? 'bg-destructive/30 text-destructive'
                  : timeLeft <= 30
                    ? 'bg-destructive/20 text-destructive animate-pulse'
                    : 'bg-primary/15 text-primary'
              )}
            >
              <Clock className="h-6 w-6 sm:h-7 sm:w-7" />
              {formatClock(timeLeft)}
            </div>
            {isTimerRunning ? (
              <Button variant="secondary" size="sm" onClick={pauseTimer}>
                <Pause className="mr-2 h-4 w-4" />
                Pause
              </Button>
            ) : (
              <Button size="sm" className="glow-primary" onClick={startTimer}>
                <Play className="mr-2 h-4 w-4" />
                {timeLeft <= 0 ? 'Start' : 'Resume'}
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={resetTimer}>
              <RotateCcw className="mr-2 h-4 w-4" />
              Reset
            </Button>
          </div>
        )}

        <Button variant="outline" size="sm" onClick={toggleFullscreen}>
          {isFullscreen ? (
            <>
              <Minimize2 className="mr-2 h-4 w-4" />
              Exit TV
            </>
          ) : (
            <>
              <Maximize2 className="mr-2 h-4 w-4" />
              Full screen
            </>
          )}
        </Button>
      </header>

      {view === 'board' ? (
      <div className="relative z-10 min-h-0 flex-1 p-3">
        <DraftBoard league={league} teams={teams} fill hideViewSwitch />
      </div>
      ) : (
      <div className="relative z-10 grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-[300px_minmax(0,1fr)_280px] lg:overflow-hidden">
        <aside className="border-b border-border/70 p-4 lg:min-h-0 lg:overflow-y-auto lg:border-b-0 lg:border-r">
          <div className="text-[11px] font-semibold uppercase tracking-[0.25em] text-primary">
            On the clock
          </div>
          {currentTeam && currentPick ? (
            <>
              <h2 className="mt-1 font-display text-4xl leading-none text-foreground sm:text-5xl">
                {currentTeam.name}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Round {currentPick.round} · Pick {currentPick.pick_number}
              </p>
              {currentPick.original_team_id !== currentPick.current_team_id && (
                <p className="mt-1 text-xs text-accent">
                  Traded pick
                </p>
              )}
            </>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              {picks.length === 0
                ? 'Initialize the draft board to begin.'
                : draftStatus === 'not_started'
                  ? 'Waiting for the draft to start.'
                  : 'The draft is complete.'}
            </p>
          )}

          <div className="mt-6 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            <Users className="h-3.5 w-3.5" />
            Roster
          </div>
          <div className="mt-3 space-y-2">
            {roster.keeperRows.length === 0 && roster.drafted.length === 0 && (
              <p className="text-sm text-muted-foreground">No players yet.</p>
            )}
            {roster.keeperRows.map((keeper) => (
              <RosterRow
                key={keeper.id}
                player={keeper.player!}
                detail={`Keeper · Rd ${keeper.round_cost}`}
                keeper
              />
            ))}
            {roster.drafted.map((pick) => (
              <RosterRow
                key={pick.id}
                player={pick.player!}
                detail={`R${pick.round} · Pick ${pick.pick_number}`}
              />
            ))}
          </div>
        </aside>

        <section className="relative flex min-h-0 flex-col items-center justify-center overflow-hidden px-4 py-6 sm:px-8">
          {picks.length === 0 ? (
            <EmptyState
              title="Draft board not ready"
              body="Initialize draft picks on the league page, then come back here for the live show."
              action={
                <Link to={`/league/${league.id}?tab=draft`}>
                  <Button>Open draft board</Button>
                </Link>
              }
            />
          ) : draftStatus === 'not_started' ? (
            <EmptyState
              title="Draft night"
              body={canStartDraft ? 'Start the draft when everyone is ready.' : 'Waiting for the league admin to start the draft.'}
              action={
                canStartDraft ? (
                  <Button size="lg" className="glow-primary" onClick={startDraft}>
                    <Play className="mr-2 h-5 w-5" />
                    Start Draft
                  </Button>
                ) : null
              }
            />
          ) : !currentPick ? (
            <EmptyState
              title="Draft complete"
              body="Every pick is in. Check the board for the final results."
              action={
                <Link to={`/league/${league.id}?tab=draft`}>
                  <Button variant="secondary">View board</Button>
                </Link>
              }
            />
          ) : (
            <>
              <div className="mb-8 text-center">
                <div className="text-xs uppercase tracking-[0.35em] text-primary">Now picking</div>
                <h1 className="mt-2 font-display text-6xl leading-none text-primary sm:text-7xl md:text-8xl">
                  {currentTeam?.name}
                </h1>
                <p className="mt-2 text-muted-foreground">
                  Round {currentPick.round} · Overall {currentPick.pick_number}
                </p>
              </div>

              {draftInteractive && (
                <div className="w-full max-w-xl">
                  {canPick ? (
                    <PlayerSearch
                      key={currentPick.id}
                      onSelect={handleDraft}
                      excludePlayerIds={draftedPlayerIds}
                      placeholder={`Draft a player for ${currentTeam?.name}...`}
                      autoFocus
                      inputClassName="h-12 text-base"
                    />
                  ) : (
                    <p className="rounded-lg border border-border/70 bg-card/60 px-4 py-3 text-center text-sm text-muted-foreground">
                      {accessedTeamId
                        ? `Waiting on ${currentTeam?.name ?? 'the next team'} to pick.`
                        : `Enter ${currentTeam?.name ?? 'the on-clock team'}'s access code on the board to draft.`}
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </section>

        <aside className="border-t border-border/70 p-4 lg:min-h-0 lg:overflow-y-auto lg:border-l lg:border-t-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.25em] text-muted-foreground">
            Up next
          </div>
          <div className="mt-3 space-y-2">
            {nextPicks.length === 0 && (
              <p className="text-sm text-muted-foreground">No more picks after this one.</p>
            )}
            {nextPicks.map((pick, index) => {
              const team = teams.find((t) => t.id === pick.current_team_id);
              return (
                <div
                  key={pick.id}
                  className="flex items-center gap-3 rounded-lg border border-border/60 bg-card/50 px-3 py-2"
                >
                  <div className="w-6 font-display text-xl text-muted-foreground">{index + 1}</div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{team?.name ?? 'Unknown'}</div>
                    <div className="text-xs text-muted-foreground">
                      R{pick.round} · Pick {pick.pick_number}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-8 text-[11px] font-semibold uppercase tracking-[0.25em] text-muted-foreground">
            Recent picks
          </div>
          <div className="mt-3 space-y-2">
            {recentPicks.length === 0 && (
              <p className="text-sm text-muted-foreground">No selections yet.</p>
            )}
            {recentPicks.map((pick) => {
              const team = teams.find((t) => t.id === pick.current_team_id);
              return (
                <div key={pick.id} className="flex items-center gap-3">
                  <PlayerHeadshot player={pick.player!} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{pick.player!.full_name}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {team?.name} · R{pick.round} P{pick.pick_number}
                    </div>
                  </div>
                  <PositionBadge position={pick.player!.position} className="text-[10px]" />
                </div>
              );
            })}
          </div>
        </aside>
      </div>
      )}

      {reveal && <DraftPickReveal reveal={reveal} onDismiss={dismissReveal} />}

      <ErrorModal
        open={errorModal.open}
        onClose={() => setErrorModal({ ...errorModal, open: false })}
        title={errorModal.title}
        message={errorModal.message}
      />
      <AlertDialog
        open={!!adminOverride}
        onOpenChange={(open) => {
          if (!open) setAdminOverride(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{adminOverride?.title ?? 'Admin override'}</AlertDialogTitle>
            <AlertDialogDescription>
              {adminOverride?.message}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={makePick.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={makePick.isPending}
              onClick={(event) => {
                event.preventDefault();
                void confirmAdminOverridePick();
              }}
            >
              {makePick.isPending ? 'Applying...' : 'Override and draft'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function RosterRow({
  player,
  detail,
  keeper,
}: {
  player: Player;
  detail: string;
  keeper?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg bg-card/60 px-2 py-1.5">
      <PlayerHeadshot player={player} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          {keeper && <Star className="h-3 w-3 shrink-0 text-accent" />}
          <span className="truncate text-sm font-semibold">{player.full_name}</span>
        </div>
        <div className="text-xs text-muted-foreground">{detail}</div>
      </div>
      <PositionBadge position={player.position} className="text-[10px]" />
    </div>
  );
}

function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="max-w-md text-center">
      <h1 className="font-display text-5xl sm:text-6xl">{title}</h1>
      <p className="mt-3 text-muted-foreground">{body}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
