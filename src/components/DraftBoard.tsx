import { useState, useEffect, useRef, useCallback } from 'react';
import {
  useDraftPicks,
  useMakePick,
  useUpdateLeague,
  useAllKeepers,
  useMockDraftPicks,
  useInitializeMockDraft,
  useMakeMockPick,
  useClearMockDraft,
} from '@/hooks/useLeague';
import { useLeaguePermissions } from '@/hooks/useLeaguePermissions';
import { useTeamAccess } from '@/contexts/TeamAccessContext';
import { League, Team, Player, DraftPick } from '@/lib/types';
import { PlayerSearch } from './PlayerSearch';
import { ErrorModal } from './ErrorModal';
import { PositionBadge } from './PositionBadge';
import { ResetDraftDialog } from './ResetDraftDialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Play, Pause, RotateCcw, Clock, Star, Columns3, FlaskConical, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';

interface DraftBoardProps {
  league: League;
  teams: Team[];
}

interface ClockState {
  pickId: string;
  endsAt: number | null;
  remainingSeconds: number;
  isRunning: boolean;
}

type DraftStatus = League['draft_status'];

const ROUND_COL_WIDTH = 80;
const DEFAULT_COL_WIDTH = 140;
const MIN_COL_WIDTH = 80;
const MAX_COL_WIDTH = 320;
const COL_GAP = 4; // gap-1

function clockStorageKey(leagueId: string, mock = false) {
  return mock ? `draft-clock-mock-${leagueId}` : `draft-clock-${leagueId}`;
}

function colWidthsStorageKey(leagueId: string) {
  return `draft-col-widths-${leagueId}`;
}

function clampColWidth(width: number) {
  return Math.min(MAX_COL_WIDTH, Math.max(MIN_COL_WIDTH, Math.round(width)));
}

function loadClock(leagueId: string, mock = false): ClockState | null {
  try {
    const raw = localStorage.getItem(clockStorageKey(leagueId, mock));
    return raw ? (JSON.parse(raw) as ClockState) : null;
  } catch {
    return null;
  }
}

function saveClock(leagueId: string, state: ClockState, mock = false) {
  localStorage.setItem(clockStorageKey(leagueId, mock), JSON.stringify(state));
}

function clearClock(leagueId: string, mock = false) {
  localStorage.removeItem(clockStorageKey(leagueId, mock));
}

function loadColumnWidths(leagueId: string, teams: Team[]): Record<string, number> {
  try {
    const raw = localStorage.getItem(colWidthsStorageKey(leagueId));
    const saved = raw ? (JSON.parse(raw) as Record<string, number>) : {};
    return Object.fromEntries(
      teams.map(team => [team.id, clampColWidth(saved[team.id] ?? DEFAULT_COL_WIDTH)])
    );
  } catch {
    return Object.fromEntries(teams.map(team => [team.id, DEFAULT_COL_WIDTH]));
  }
}

export function DraftBoard({ league, teams }: DraftBoardProps) {
  const currentYear = new Date().getFullYear();
  const { isAdmin, canStartDraft, accessedTeamId } = useLeaguePermissions(league);
  const { getAccessCode } = useTeamAccess();

  const [mockMode, setMockMode] = useState(false);
  const [mockDraftStatus, setMockDraftStatus] = useState<DraftStatus>('not_started');

  const { data: livePicks = [], refetch: refetchLive } = useDraftPicks(league.id, currentYear);
  const { data: mockPicks = [], refetch: refetchMock } = useMockDraftPicks(league.id, currentYear, {
    enabled: isAdmin && mockMode,
  });
  const { data: keepers = [] } = useAllKeepers(league.id);
  const makePick = useMakePick();
  const makeMockPick = useMakeMockPick();
  const updateLeague = useUpdateLeague();
  const initializeMock = useInitializeMockDraft();
  const clearMock = useClearMockDraft();

  const picks = mockMode ? mockPicks : livePicks;
  const draftStatus = mockMode ? mockDraftStatus : league.draft_status;
  const refetch = mockMode ? refetchMock : refetchLive;

  const [timeLeft, setTimeLeft] = useState(league.draft_time_seconds);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const endsAtRef = useRef<number | null>(null);
  const trackedPickIdRef = useRef<string | null>(null);
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(() =>
    loadColumnWidths(league.id, teams)
  );
  const [errorModal, setErrorModal] = useState<{ open: boolean; title: string; message: string }>({
    open: false,
    title: '',
    message: '',
  });

  const teamIdsKey = teams.map(t => t.id).join(',');

  // Persist and reconcile column widths per league / roster
  useEffect(() => {
    setColumnWidths(prev => {
      const saved = loadColumnWidths(league.id, teams);
      const next: Record<string, number> = {};
      for (const team of teams) {
        next[team.id] = prev[team.id] ?? saved[team.id] ?? DEFAULT_COL_WIDTH;
      }
      const unchanged =
        Object.keys(prev).length === teams.length &&
        teams.every(team => prev[team.id] === next[team.id]);
      return unchanged ? prev : next;
    });
  }, [league.id, teamIdsKey, teams]);

  useEffect(() => {
    if (Object.keys(columnWidths).length === 0) return;
    localStorage.setItem(colWidthsStorageKey(league.id), JSON.stringify(columnWidths));
  }, [league.id, columnWidths]);

  const setAllColumnWidths = useCallback((width: number) => {
    const clamped = clampColWidth(width);
    setColumnWidths(Object.fromEntries(teams.map(team => [team.id, clamped])));
  }, [teams]);

  const startColumnResize = useCallback((teamId: string, startX: number) => {
    const startWidth = columnWidths[teamId] ?? DEFAULT_COL_WIDTH;

    const onMove = (event: MouseEvent) => {
      const nextWidth = clampColWidth(startWidth + (event.clientX - startX));
      setColumnWidths(prev => ({ ...prev, [teamId]: nextWidth }));
    };

    const onUp = () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [columnWidths]);

  // Get current pick info
  const currentPick = picks.find(p => !p.player_id && !p.is_keeper);
  const draftedPlayerIds = picks.filter(p => p.player_id).map(p => p.player_id!);
  const keeperPlayerIds = keepers.map(k => k.player_id);

  // Subscribe to realtime updates for the active board
  useEffect(() => {
    const table = mockMode ? 'mock_draft_picks' : 'draft_picks';
    const channel = supabase
      .channel(`${table}-${league.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table,
          filter: `league_id=eq.${league.id}`,
        },
        () => {
          refetch();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [league.id, mockMode, refetch]);

  // Restore or start the clock when the current pick changes (survives refresh)
  useEffect(() => {
    if (draftStatus !== 'in_progress' || !currentPick) {
      trackedPickIdRef.current = null;
      endsAtRef.current = null;
      setIsTimerRunning(false);
      return;
    }

    if (trackedPickIdRef.current === currentPick.id) {
      return;
    }
    trackedPickIdRef.current = currentPick.id;

    const saved = loadClock(league.id, mockMode);
    if (saved?.pickId === currentPick.id) {
      if (saved.isRunning && saved.endsAt) {
        const remaining = Math.max(0, Math.ceil((saved.endsAt - Date.now()) / 1000));
        endsAtRef.current = saved.endsAt;
        setTimeLeft(remaining);
        setIsTimerRunning(remaining > 0);
        if (remaining <= 0) {
          saveClock(league.id, {
            pickId: currentPick.id,
            endsAt: null,
            remainingSeconds: league.draft_time_seconds,
            isRunning: false,
          }, mockMode);
          setTimeLeft(league.draft_time_seconds);
        }
      } else {
        endsAtRef.current = null;
        setTimeLeft(saved.remainingSeconds);
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
    }, mockMode);
  }, [currentPick?.id, draftStatus, league.draft_time_seconds, league.id, mockMode]);

  // Tick from absolute deadline so refresh doesn't lose elapsed time
  useEffect(() => {
    if (!isTimerRunning || draftStatus !== 'in_progress' || !currentPick) return;

    const interval = setInterval(() => {
      const endsAt = endsAtRef.current;
      if (!endsAt) return;

      const remaining = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
      setTimeLeft(remaining);

      if (remaining <= 0) {
        setIsTimerRunning(false);
        endsAtRef.current = null;
        setTimeLeft(league.draft_time_seconds);
        saveClock(league.id, {
          pickId: currentPick.id,
          endsAt: null,
          remainingSeconds: league.draft_time_seconds,
          isRunning: false,
        }, mockMode);
      }
    }, 250);

    return () => clearInterval(interval);
  }, [isTimerRunning, draftStatus, league.draft_time_seconds, league.id, currentPick?.id, mockMode]);

  const getPositionCounts = (teamId: string) => {
    const teamPicks = picks.filter(p => p.current_team_id === teamId && p.player_id);
    const counts: Record<string, number> = { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DEF: 0 };
    
    teamPicks.forEach(pick => {
      const pos = pick.player?.position;
      if (pos && counts[pos] !== undefined) {
        counts[pos]++;
      }
    });

    // Add keepers
    keepers.filter(k => {
      const team = teams.find(t => t.id === k.team_id);
      return team?.id === teamId;
    }).forEach(k => {
      const pos = k.player?.position;
      if (pos && counts[pos] !== undefined) {
        counts[pos]++;
      }
    });

    return counts;
  };

  const getPositionLimit = (position: string): number => {
    const slotKey = `${position.toLowerCase()}_slots` as keyof League;
    const slots = league[slotKey] as number;
    return slots + league.bench_slots; // Can fill position slots + bench
  };

  const handleDraft = async (player: Player) => {
    if (!currentPick) return;

    const canPickForTeam =
      mockMode || isAdmin || accessedTeamId === currentPick.current_team_id;
    if (!canPickForTeam) {
      setErrorModal({
        open: true,
        title: 'NOT YOUR PICK',
        message: 'Only the team on the clock (or the league admin) can make this selection.',
      });
      return;
    }

    // Check if already drafted
    if (draftedPlayerIds.includes(player.id)) {
      setErrorModal({
        open: true,
        title: "ALREADY DRAFTED!",
        message: `${player.full_name} has already been drafted. Pay attention to what's happening, you absolute walnut.`,
      });
      return;
    }

    // Check if player is a keeper
    if (keeperPlayerIds.includes(player.id)) {
      setErrorModal({
        open: true,
        title: "THAT'S A KEEPER!",
        message: `${player.full_name} is already someone's keeper. You can't draft them, genius.`,
      });
      return;
    }

    // Check position limits
    if (player.position) {
      const counts = getPositionCounts(currentPick.current_team_id);
      const limit = getPositionLimit(player.position);
      
      if (counts[player.position] >= limit) {
        setErrorModal({
          open: true,
          title: "TOO MANY AT THAT POSITION!",
          message: `You already have ${counts[player.position]} ${player.position}s and the limit is ${limit}. What are you even doing?`,
        });
        return;
      }
    }

    if (mockMode) {
      await makeMockPick.mutateAsync({
        pickId: currentPick.id,
        playerId: player.id,
        leagueId: league.id,
        year: currentYear,
      });
      return;
    }

    await makePick.mutateAsync({
      pickId: currentPick.id,
      playerId: player.id,
      leagueId: league.id,
      year: currentYear,
      asAdmin: isAdmin,
      access_code: getAccessCode(league.id),
    });
  };

  const enterMockMode = async () => {
    if (!isAdmin || teams.length < 2) return;
    await initializeMock.mutateAsync({ leagueId: league.id, year: currentYear });
    clearClock(league.id, true);
    trackedPickIdRef.current = null;
    endsAtRef.current = null;
    setIsTimerRunning(false);
    setTimeLeft(league.draft_time_seconds);
    setMockDraftStatus('not_started');
    setMockMode(true);
  };

  const exitMockMode = async () => {
    clearClock(league.id, true);
    trackedPickIdRef.current = null;
    endsAtRef.current = null;
    setIsTimerRunning(false);
    setMockDraftStatus('not_started');
    setMockMode(false);
    await clearMock.mutateAsync({ leagueId: league.id, year: currentYear });
  };

  const restartMockDraft = async () => {
    await initializeMock.mutateAsync({ leagueId: league.id, year: currentYear });
    clearClock(league.id, true);
    trackedPickIdRef.current = null;
    endsAtRef.current = null;
    setIsTimerRunning(false);
    setTimeLeft(league.draft_time_seconds);
    setMockDraftStatus('not_started');
  };

  const startDraft = async () => {
    if (mockMode) {
      setMockDraftStatus('in_progress');
      return;
    }
    await updateLeague.mutateAsync({
      id: league.id,
      draft_status: 'in_progress',
      current_pick: 1,
      current_round: 1,
    });
  };

  const pauseDraft = () => {
    setIsTimerRunning(false);
    endsAtRef.current = null;
    if (currentPick) {
      saveClock(league.id, {
        pickId: currentPick.id,
        endsAt: null,
        remainingSeconds: timeLeft,
        isRunning: false,
      }, mockMode);
    }
  };

  const resumeDraft = () => {
    const endsAt = Date.now() + timeLeft * 1000;
    endsAtRef.current = endsAt;
    setIsTimerRunning(true);
    if (currentPick) {
      saveClock(league.id, {
        pickId: currentPick.id,
        endsAt,
        remainingSeconds: timeLeft,
        isRunning: true,
      }, mockMode);
    }
  };

  const resetTimer = () => {
    setTimeLeft(league.draft_time_seconds);
    if (!currentPick) return;

    if (isTimerRunning) {
      const endsAt = Date.now() + league.draft_time_seconds * 1000;
      endsAtRef.current = endsAt;
      saveClock(league.id, {
        pickId: currentPick.id,
        endsAt,
        remainingSeconds: league.draft_time_seconds,
        isRunning: true,
      }, mockMode);
    } else {
      endsAtRef.current = null;
      saveClock(league.id, {
        pickId: currentPick.id,
        endsAt: null,
        remainingSeconds: league.draft_time_seconds,
        isRunning: false,
      }, mockMode);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Group picks by round
  const picksByRound: Record<number, DraftPick[]> = {};
  picks.forEach(pick => {
    if (!picksByRound[pick.round]) {
      picksByRound[pick.round] = [];
    }
    picksByRound[pick.round].push(pick);
  });

  // Sort picks within each round by their actual position in snake order
  Object.keys(picksByRound).forEach(round => {
    const roundNum = parseInt(round);
    picksByRound[roundNum].sort((a, b) => {
      const aTeam = teams.find(t => t.id === a.original_team_id);
      const bTeam = teams.find(t => t.id === b.original_team_id);
      if (!aTeam || !bTeam) return 0;
      
      // Snake: odd rounds ascending, even rounds descending
      return roundNum % 2 === 1 
        ? aTeam.draft_position - bTeam.draft_position
        : bTeam.draft_position - aTeam.draft_position;
    });
  });

  const currentTeam = currentPick ? teams.find(t => t.id === currentPick.current_team_id) : null;
  const boardColumns = `${ROUND_COL_WIDTH}px ${teams
    .map(team => `${columnWidths[team.id] ?? DEFAULT_COL_WIDTH}px`)
    .join(' ')}`;
  const boardWidth =
    ROUND_COL_WIDTH +
    teams.reduce((sum, team) => sum + (columnWidths[team.id] ?? DEFAULT_COL_WIDTH), 0) +
    COL_GAP * teams.length;
  const uniformColumnWidth = teams.length
    ? Math.round(
        teams.reduce((sum, team) => sum + (columnWidths[team.id] ?? DEFAULT_COL_WIDTH), 0) / teams.length
      )
    : DEFAULT_COL_WIDTH;

  const keepersByTeam = Object.fromEntries(
    teams.map(team => [
      team.id,
      keepers
        .filter(k => k.team_id === team.id)
        .sort((a, b) => (a.player?.search_rank ?? 9999) - (b.player?.search_rank ?? 9999)),
    ])
  );
  const maxKeepers = teams.length
    ? Math.max(...teams.map(t => keepersByTeam[t.id]?.length ?? 0), 0)
    : 0;

  const liveBoardReady = livePicks.length > 0;
  const boardReady = picks.length > 0;

  if (!boardReady && !mockMode) {
    return (
      <div className="glass rounded-lg p-12 text-center space-y-4">
        <Columns3 className="h-16 w-16 mx-auto text-muted-foreground" />
        <h3 className="text-xl font-semibold">Draft Not Initialized</h3>
        <p className="text-muted-foreground max-w-md mx-auto">
          {teams.length < 2
            ? `Add at least 2 teams to set up the draft (currently ${teams.length}).`
            : isAdmin
              ? 'Initialize the live draft board, or run a private mock draft teams cannot see.'
              : 'Waiting for the league admin to initialize the draft.'}
        </p>
        {isAdmin && teams.length >= 2 && (
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <Button
              onClick={enterMockMode}
              disabled={initializeMock.isPending}
              variant="secondary"
              size="lg"
            >
              <FlaskConical className="h-4 w-4 mr-2" />
              {initializeMock.isPending ? 'Starting mock...' : 'Run Mock Draft'}
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {mockMode && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-accent/40 bg-accent/10 px-4 py-3">
          <div className="flex items-center gap-2 text-sm">
            <EyeOff className="h-4 w-4 text-accent shrink-0" />
            <span>
              <Badge variant="secondary" className="mr-2 gap-1">
                <FlaskConical className="h-3 w-3" />
                Mock Draft
              </Badge>
              Private practice board — teams cannot see these picks.
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={restartMockDraft}
              disabled={initializeMock.isPending}
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              Restart mock
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={exitMockMode}
              disabled={clearMock.isPending}
            >
              Exit mock
            </Button>
          </div>
        </div>
      )}

      {/* Draft Controls — z-index so player search results stack above the board */}
      <Card className="glass p-6 relative z-20">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            {draftStatus === 'not_started' && (canStartDraft || mockMode) && (
              <Button onClick={startDraft} size="lg" className="glow-primary">
                <Play className="mr-2 h-5 w-5" />
                {mockMode ? 'Start Mock Draft' : 'Start Draft'}
              </Button>
            )}
            {draftStatus === 'not_started' && !canStartDraft && !mockMode && (
              <p className="text-sm text-muted-foreground">
                Waiting for the league admin to start the draft.
              </p>
            )}

            {draftStatus === 'in_progress' && (isAdmin || mockMode) && (
              <>
                {isTimerRunning ? (
                  <Button onClick={pauseDraft} variant="secondary" size="lg">
                    <Pause className="mr-2 h-5 w-5" />
                    Pause
                  </Button>
                ) : (
                  <Button onClick={resumeDraft} size="lg" className="glow-primary">
                    <Play className="mr-2 h-5 w-5" />
                    Resume
                  </Button>
                )}
                <Button onClick={resetTimer} variant="outline" size="lg">
                  <RotateCcw className="mr-2 h-5 w-5" />
                  Reset Timer
                </Button>
              </>
            )}

            {isAdmin && !mockMode && (
              <>
                <Button
                  type="button"
                  variant="secondary"
                  size="lg"
                  onClick={enterMockMode}
                  disabled={initializeMock.isPending || teams.length < 2}
                >
                  <FlaskConical className="mr-2 h-5 w-5" />
                  {initializeMock.isPending ? 'Starting mock...' : 'Mock Draft'}
                </Button>
                {liveBoardReady && (
                  <ResetDraftDialog
                    league={league}
                    year={currentYear}
                    triggerVariant="outline"
                    triggerLabel="Reset Board"
                  />
                )}
              </>
            )}
          </div>

          {draftStatus === 'in_progress' && currentPick && (
            <div className="flex items-center gap-6">
              <div className="text-center">
                <div className="text-sm text-muted-foreground">On the Clock</div>
                <div className="text-2xl font-display text-primary">
                  {currentTeam?.name || 'Unknown'}
                </div>
                <div className="text-sm text-muted-foreground">
                  Round {currentPick.round}, Pick {currentPick.pick_number}
                </div>
              </div>

              <div className={cn(
                "flex items-center gap-2 px-6 py-3 rounded-lg font-display text-4xl",
                timeLeft <= 30 ? "bg-destructive/20 text-destructive animate-pulse" : "bg-primary/20 text-primary"
              )}>
                <Clock className="h-8 w-8" />
                {formatTime(timeLeft)}
              </div>
            </div>
          )}
        </div>

        {/* Player Search — admin, mock mode, or the team on the clock */}
        {draftStatus === 'in_progress' && currentPick && (
          <div className="mt-6 max-w-xl">
            {mockMode || isAdmin || accessedTeamId === currentPick.current_team_id ? (
              <PlayerSearch
                onSelect={handleDraft}
                placeholder={`Search for a player for ${currentTeam?.name}...`}
                autoFocus
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                {accessedTeamId
                  ? `Waiting on ${currentTeam?.name || 'the next team'} to pick.`
                  : `Enter ${currentTeam?.name || 'the on-clock team'}'s access code to draft, or wait for the admin.`}
              </p>
            )}
          </div>
        )}
      </Card>

      {/* Column width controls */}
      <div className="flex flex-wrap items-center gap-4 rounded-lg border border-border bg-card/50 px-4 py-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground shrink-0">
          <Columns3 className="h-4 w-4" />
          <span>All columns</span>
        </div>
        <Slider
          className="w-48 sm:w-64"
          min={MIN_COL_WIDTH}
          max={MAX_COL_WIDTH}
          step={4}
          value={[uniformColumnWidth]}
          onValueChange={([value]) => setAllColumnWidths(value)}
        />
        <span className="text-sm tabular-nums text-muted-foreground w-12">{uniformColumnWidth}px</span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setAllColumnWidths(DEFAULT_COL_WIDTH)}
        >
          Reset
        </Button>
        <span className="text-xs text-muted-foreground hidden sm:inline">
          Drag column edges to resize individually
        </span>
      </div>

      {/* Draft Board Grid */}
      <div className="overflow-x-auto">
        <div style={{ width: boardWidth, minWidth: boardWidth }}>
          {/* Team Headers */}
          <div className="grid gap-1 mb-2" style={{ gridTemplateColumns: boardColumns }}>
            <div className="p-2 text-sm font-semibold text-muted-foreground">Round</div>
            {teams.map(team => (
              <div 
                key={team.id} 
                className={cn(
                  "relative min-w-0 p-3 rounded-t-lg text-center font-display text-lg truncate select-none",
                  currentTeam?.id === team.id && draftStatus === 'in_progress'
                    ? "bg-primary text-primary-foreground glow-primary"
                    : "bg-secondary"
                )}
              >
                {team.name}
                <button
                  type="button"
                  aria-label={`Resize ${team.name} column`}
                  className="absolute inset-y-0 right-0 w-2 cursor-col-resize touch-none group"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    startColumnResize(team.id, event.clientX);
                  }}
                >
                  <span className="absolute inset-y-2 right-0 w-0.5 rounded-full bg-border group-hover:bg-primary group-active:bg-primary transition-colors" />
                </button>
              </div>
            ))}
          </div>

          {/* Draft Picks Grid */}
          {Object.entries(picksByRound).map(([round, roundPicks]) => (
              <div 
                key={round} 
                className="grid gap-1 mb-1" 
                style={{ gridTemplateColumns: boardColumns }}
              >
                <div className="flex items-center justify-center p-2 bg-muted/50 rounded-l-lg font-display text-lg">
                  {round}
                </div>
                
                {teams.map(team => {
                  // Find the pick for this team in this round
                  const pick = roundPicks.find(p => p.original_team_id === team.id);
                  if (!pick) return <div key={team.id} className="min-w-0 p-2 bg-muted/20 border-2 border-transparent" />;

                  const isCurrent = currentPick?.id === pick.id;
                  const isTraded = pick.current_team_id !== pick.original_team_id;
                  const draftedByTeam = isTraded ? teams.find(t => t.id === pick.current_team_id) : null;

                  return (
                    <div
                      key={team.id}
                      className={cn(
                        "min-w-0 p-2 rounded transition-all duration-300 min-h-[60px] flex flex-col justify-center border-2",
                        isCurrent && "bg-primary/30 border-primary animate-pulse-glow",
                        !isCurrent && pick.player_id && "bg-secondary/80 border-transparent",
                        !isCurrent && !pick.player_id && "bg-muted/20 border-transparent",
                        isTraded && !isCurrent && "border-accent/40"
                      )}
                    >
                      {pick.player ? (
                        <div className="space-y-1 min-w-0">
                          <div className="flex items-center gap-1">
                            <PositionBadge position={pick.player.position} className="text-[10px]" />
                          </div>
                          <div className="text-sm font-semibold truncate">
                            {pick.player.full_name}
                          </div>
                          <div className="text-xs text-muted-foreground truncate">
                            {pick.player.team || 'FA'}
                          </div>
                          {draftedByTeam && (
                            <div className="text-xs text-accent truncate">
                              → {draftedByTeam.name}
                            </div>
                          )}
                        </div>
                      ) : draftedByTeam ? (
                        <div className="text-xs text-accent text-center truncate">
                          → {draftedByTeam.name}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
          ))}

          {/* Keepers — roster players in rows below all draft rounds */}
          {maxKeepers > 0 && (
            <div className="mt-4 pt-3 border-t border-accent/30">
              <div className="flex items-center gap-2 px-2 pb-2 text-sm font-semibold text-accent">
                <Star className="h-4 w-4" />
                Keepers
              </div>

              {Array.from({ length: maxKeepers }, (_, slot) => (
                <div
                  key={`keeper-row-${slot}`}
                  className="grid gap-1 mb-1"
                  style={{ gridTemplateColumns: boardColumns }}
                >
                  <div className="flex items-center justify-center p-2 bg-accent/20 rounded-l-lg font-display text-sm text-accent">
                    K{slot + 1}
                  </div>
                  {teams.map(team => {
                    const keeper = keepersByTeam[team.id]?.[slot];

                    return (
                      <div
                        key={team.id}
                        className={cn(
                          "min-w-0 p-2 rounded min-h-[60px] flex flex-col justify-center border-2",
                          keeper ? "bg-accent/10 border-accent/30" : "bg-muted/10 border-transparent"
                        )}
                      >
                        {keeper?.player && (
                          <div className="space-y-1 min-w-0">
                            <div className="flex items-center gap-1">
                              <Star className="h-3 w-3 text-accent shrink-0" />
                              <PositionBadge position={keeper.player.position} className="text-[10px]" />
                            </div>
                            <div className="text-sm font-semibold truncate">
                              {keeper.player.full_name}
                            </div>
                            <div className="text-xs text-muted-foreground truncate">
                              {keeper.player.team || 'FA'}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <ErrorModal
        open={errorModal.open}
        onClose={() => setErrorModal({ ...errorModal, open: false })}
        title={errorModal.title}
        message={errorModal.message}
      />
    </div>
  );
}
