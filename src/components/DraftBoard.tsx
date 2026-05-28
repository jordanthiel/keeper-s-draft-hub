import { useState, useEffect, useRef, useMemo } from 'react';
import { useDraftPicks, useMakePick, useUpdateLeague, useAllKeepers, useUpdateTeamDraftPosition, useResetDraft, useTeamDraftPositions, useUpdateDraftOrderForYear, useDraftState, useUpdateDraftState, useLeagueSettings } from '@/hooks/useLeague';
import { League, Team, Player, DraftPick, Position, POSITION_COLORS } from '@/lib/types';
import { PlayerSearch } from './PlayerSearch';
import { ErrorModal } from './ErrorModal';
import { PositionBadge } from './PositionBadge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Play, Pause, RotateCcw, Clock, GripVertical, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  horizontalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface DraftBoardProps {
  league: League;
  teams: Team[];
  year: number;
}

interface SortableTeamHeaderProps {
  team: Team;
  isCurrent: boolean;
  draftStatus: string;
}

function SortableTeamHeader({ team, isCurrent, draftStatus }: SortableTeamHeaderProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: team.id, disabled: draftStatus !== 'not_started' });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const canDrag = draftStatus === 'not_started';

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "p-3 rounded-t-lg text-center font-display text-lg truncate relative min-w-0",
        isCurrent && draftStatus === 'in_progress'
          ? "bg-primary text-primary-foreground glow-primary"
          : "bg-secondary",
        canDrag && "cursor-grab active:cursor-grabbing"
      )}
    >
      {canDrag && (
        <div
          {...attributes}
          {...listeners}
          className="absolute left-1 top-1/2 -translate-y-1/2 text-muted-foreground opacity-50 hover:opacity-100"
        >
          <GripVertical className="h-4 w-4" />
        </div>
      )}
      {team.name}
    </div>
  );
}

export function DraftBoard({ league, teams, year }: DraftBoardProps) {
  const { data: picks = [], refetch } = useDraftPicks(league.id, year);
  const { data: keepers = [] } = useAllKeepers(league.id);
  const { data: yearPositions = new Map() } = useTeamDraftPositions(league.id, year);
  const { data: draftState } = useDraftState(league.id, year);
  const { data: settings } = useLeagueSettings(league.id, year);
  const makePick = useMakePick();
  const updateDraftState = useUpdateDraftState();
  
  // Use year-specific draft state, fallback to league defaults
  const draftStatus = draftState?.draft_status ?? 'not_started';
  const currentPickNumber = draftState?.current_pick ?? 1;
  const currentRoundNumber = draftState?.current_round ?? 1;
  
  // Use year-specific settings, fallback to league defaults
  const draftTimeSeconds = settings?.draft_time_seconds ?? league.draft_time_seconds;
  const numRounds = settings?.num_rounds ?? league.num_rounds;
  
  // Create teams with year-specific positions for display
  const teamsWithYearPositions = useMemo(() => {
    return teams.map(team => ({
      ...team,
      draft_position: yearPositions.get(team.id) ?? team.draft_position,
    })).sort((a, b) => a.draft_position - b.draft_position);
  }, [teams, yearPositions]);
  const updateLeague = useUpdateLeague();
  const updateDraftOrderForYear = useUpdateDraftOrderForYear();
  const resetDraft = useResetDraft();
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [showStartDialog, setShowStartDialog] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Get current pick info
  const currentPick = picks.find(p => !p.player_id && !p.is_keeper);
  const draftedPlayerIds = picks.filter(p => p.player_id).map(p => p.player_id!);
  const keeperPlayerIds = keepers.map(k => k.player_id);
  // Only exclude keepers from search - allow duplicate drafts as penalty
  const excludedPlayerIds = [...keeperPlayerIds];

  // Timer state with localStorage persistence
  const getTimerStorageKey = (pickId: string) => `draft_timer_${league.id}_${pickId}`;
  const timeLeftRef = useRef<number>(draftTimeSeconds);
  
  const [timeLeft, setTimeLeft] = useState(() => {
    if (!currentPick) {
      timeLeftRef.current = draftTimeSeconds;
      return draftTimeSeconds;
    }
    
    // Try to restore from localStorage
    const stored = localStorage.getItem(getTimerStorageKey(currentPick.id));
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        const elapsed = Math.floor((Date.now() - parsed.timestamp) / 1000);
        const remaining = Math.max(0, parsed.timeLeft - elapsed);
        timeLeftRef.current = remaining;
        return remaining;
      } catch {
        timeLeftRef.current = draftTimeSeconds;
        return draftTimeSeconds;
      }
    }
    timeLeftRef.current = league.draft_time_seconds;
    return league.draft_time_seconds;
  });
  
  // Keep ref in sync with state
  useEffect(() => {
    timeLeftRef.current = timeLeft;
  }, [timeLeft]);

  const [isTimerRunning, setIsTimerRunning] = useState(() => {
    if (!currentPick || draftStatus !== 'in_progress') return false;
    
    // Try to restore running state from localStorage
    const stored = localStorage.getItem(getTimerStorageKey(currentPick.id));
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        return parsed.isRunning && draftStatus === 'in_progress';
      } catch {
        return false;
      }
    }
    return draftStatus === 'in_progress';
  });

  const [errorModal, setErrorModal] = useState<{ open: boolean; title: string; message: string }>({
    open: false,
    title: '',
    message: '',
  });

  // Subscribe to realtime updates
  useEffect(() => {
    const channel = supabase
      .channel('draft-picks')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'draft_picks',
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
  }, [league.id, refetch]);

  // Timer logic
  useEffect(() => {
    if (!isTimerRunning || draftStatus !== 'in_progress' || !currentPick) return;

    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          setIsTimerRunning(false);
          // Clear storage when timer expires
          if (currentPick) {
            localStorage.removeItem(getTimerStorageKey(currentPick.id));
          }
          return 0;
        }
        
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isTimerRunning, draftStatus, draftTimeSeconds, currentPick?.id]);

  // Reset timer when pick changes or restore from storage
  useEffect(() => {
    if (!currentPick) {
      timeLeftRef.current = draftTimeSeconds;
      setTimeLeft(league.draft_time_seconds);
      setIsTimerRunning(false);
      return;
    }

    const storageKey = getTimerStorageKey(currentPick.id);
    const stored = localStorage.getItem(storageKey);
    
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        let remaining: number;
        
        // If timer was running, calculate elapsed time since timestamp
        if (parsed.isRunning) {
          const elapsed = Math.floor((Date.now() - parsed.timestamp) / 1000);
          remaining = Math.max(0, parsed.timeLeft - elapsed);
        } else {
          // If paused, use stored timeLeft directly (already calculated when paused)
          remaining = parsed.timeLeft;
        }
        
        setTimeLeft(remaining);
        timeLeftRef.current = remaining;
        
        // Timer should be running only if it was running, remaining > 0, and draft is in progress
        const shouldRun = parsed.isRunning && remaining > 0 && draftStatus === 'in_progress';
        setIsTimerRunning(shouldRun);
        
        // Update storage with corrected time and timestamp
        if (remaining > 0) {
          localStorage.setItem(storageKey, JSON.stringify({
            timeLeft: remaining,
            isRunning: shouldRun,
            timestamp: shouldRun ? parsed.timestamp : Date.now(), // Keep original timestamp if running, update if not
          }));
        } else {
          // Timer expired, remove from storage
          localStorage.removeItem(storageKey);
        }
      } catch {
        // If parsing fails, reset to default
        timeLeftRef.current = draftTimeSeconds;
        setTimeLeft(league.draft_time_seconds);
        setIsTimerRunning(draftStatus === 'in_progress');
        localStorage.setItem(storageKey, JSON.stringify({
          timeLeft: league.draft_time_seconds,
          isRunning: draftStatus === 'in_progress',
          timestamp: Date.now(),
        }));
      }
    } else {
      // New pick, reset timer
      timeLeftRef.current = draftTimeSeconds;
      setTimeLeft(league.draft_time_seconds);
      setIsTimerRunning(draftStatus === 'in_progress');
      localStorage.setItem(storageKey, JSON.stringify({
        timeLeft: league.draft_time_seconds,
        isRunning: league.draft_status === 'in_progress',
        timestamp: Date.now(),
      }));
    }
  }, [currentPick?.id, draftStatus, draftTimeSeconds]);

  const getPositionCounts = (teamId: string) => {
    const teamPicks = picks.filter(p => p.current_team_id === teamId && p.player_id);
    const counts: Record<string, number> = { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DEF: 0, DP: 0 };
    
    teamPicks.forEach(pick => {
      const pos = pick.player?.position;
      if (pos) {
        // Map IDP positions (DL, LB, DB) to DP
        if (pos === 'DL' || pos === 'LB' || pos === 'DB') {
          counts['DP']++;
        } else if (counts[pos] !== undefined) {
          counts[pos]++;
        }
      }
    });

    // Add keepers
    keepers.filter(k => {
      const team = teamsWithYearPositions.find(t => t.id === k.team_id);
      return team?.id === teamId;
    }).forEach(k => {
      const pos = k.player?.position;
      if (pos) {
        // Map IDP positions (DL, LB, DB) to DP
        if (pos === 'DL' || pos === 'LB' || pos === 'DB') {
          counts['DP']++;
        } else if (counts[pos] !== undefined) {
          counts[pos]++;
        }
      }
    });

    return counts;
  };

  const getPositionLimit = (position: string): number => {
    // Map IDP positions (DL, LB, DB) to DP for slot lookup
    const mappedPosition = (position === 'DL' || position === 'LB' || position === 'DB') ? 'DP' : position;
    const slotKey = `${mappedPosition.toLowerCase()}_slots` as keyof League;
    const slots = league[slotKey] as number;
    return slots;
  };

  const handleDraft = async (player: Player) => {
    if (!currentPick) return;

    // Check if already drafted (duplicate drafts are allowed as penalty, but warn user)
    if (draftedPlayerIds.includes(player.id)) {
      const funnyRemarks = [
        `${player.full_name} has already been drafted. Pay attention to what's happening, you absolute walnut.`,
        `${player.full_name}? Really? They're already off the board. Nice try, though.`,
        `Someone already snagged ${player.full_name}. Maybe check the draft board next time? Just a thought.`,
        `${player.full_name} was drafted earlier. Do you even draft, bro?`,
        `Plot twist: ${player.full_name} is already drafted. This isn't Pokémon - you can't catch 'em all twice.`,
        `${player.full_name} has been claimed. Time to draft a new favorite player, champ.`,
        `News flash: ${player.full_name} is off the board. Maybe read the room before your next pick?`,
      ];
      const randomRemark = funnyRemarks[Math.floor(Math.random() * funnyRemarks.length)];
      setErrorModal({
        open: true,
        title: "ALREADY DRAFTED!",
        message: randomRemark,
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

    // Calculate next pick number and round
    const totalPicks = picks.length;
    const currentPickIndex = picks.findIndex(p => p.id === currentPick.id);
    const nextPick = picks[currentPickIndex + 1];
    const nextPickNumber = nextPick ? nextPick.pick_number : null;
    const nextRound = nextPick ? nextPick.round : null;
    
    await makePick.mutateAsync({
      pickId: currentPick.id,
      playerId: player.id,
      leagueId: league.id,
      year: year,
      nextPickNumber: nextPickNumber ?? undefined,
      nextRound: nextRound ?? undefined,
    });

    // Clear timer storage for this pick since it's now completed
    if (currentPick) {
      localStorage.removeItem(getTimerStorageKey(currentPick.id));
    }
    setTimeLeft(league.draft_time_seconds);
  };

  const startDraft = async () => {
    await updateDraftState.mutateAsync({
      leagueId: league.id,
      year: year,
      draft_status: 'in_progress',
      current_pick: 1,
      current_round: 1,
    });
    setIsTimerRunning(true);
    setShowStartDialog(false);
  };

  const pauseDraft = () => {
    setIsTimerRunning(false);
    // Update localStorage with current timeLeft
    if (currentPick) {
      const storageKey = getTimerStorageKey(currentPick.id);
      localStorage.setItem(storageKey, JSON.stringify({
        timeLeft: timeLeftRef.current,
        isRunning: false,
        timestamp: Date.now(),
      }));
    }
  };

  const resumeDraft = () => {
    if (!currentPick) return;
    
    const storageKey = getTimerStorageKey(currentPick.id);
    const stored = localStorage.getItem(storageKey);
    
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        // Use stored timeLeft (which was updated when paused)
        const remaining = parsed.timeLeft;
        
        localStorage.setItem(storageKey, JSON.stringify({
          timeLeft: remaining,
          isRunning: true,
          timestamp: Date.now(), // New timestamp for resumed countdown
        }));
        setTimeLeft(remaining);
      } catch {
        // If parse fails, create new entry
        localStorage.setItem(storageKey, JSON.stringify({
          timeLeft: league.draft_time_seconds,
          isRunning: true,
          timestamp: Date.now(),
        }));
        setTimeLeft(league.draft_time_seconds);
      }
    } else {
      // No stored data, create new entry
      localStorage.setItem(storageKey, JSON.stringify({
        timeLeft: league.draft_time_seconds,
        isRunning: true,
        timestamp: Date.now(),
      }));
      setTimeLeft(league.draft_time_seconds);
    }
    
    setIsTimerRunning(true);
  };

  const resetTimer = () => {
    setTimeLeft(league.draft_time_seconds);
    // Update localStorage
    if (currentPick) {
      localStorage.setItem(getTimerStorageKey(currentPick.id), JSON.stringify({
        timeLeft: league.draft_time_seconds,
        isRunning: isTimerRunning,
        timestamp: Date.now(),
      }));
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Use teams with year-specific positions (already sorted)
  const sortedTeams = teamsWithYearPositions;

  // Group picks by round
  const picksByRound: Record<number, DraftPick[]> = {};
  picks.forEach(pick => {
    if (!picksByRound[pick.round]) {
      picksByRound[pick.round] = [];
    }
    picksByRound[pick.round].push(pick);
  });

  // Don't sort picks - we'll find them directly by current_team_id when displaying
  // Sorting was causing issues with finding the correct pick for each column

  const currentTeam = currentPick ? teamsWithYearPositions.find(t => t.id === currentPick.current_team_id) : null;

  const handleHeaderDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over || active.id === over.id || draftStatus !== 'not_started') {
      return;
    }

    const activeTeam = teamsWithYearPositions.find(t => t.id === active.id);
    const overTeam = teamsWithYearPositions.find(t => t.id === over.id);

    if (!activeTeam || !overTeam) {
      return;
    }

    // Delay mutation slightly to let drag animation complete smoothly
    // This prevents the jolt when the query updates during the animation
    setTimeout(() => {
      updateDraftOrderForYear.mutate({
        teamId: activeTeam.id,
        leagueId: league.id,
        year: year,
        newPosition: overTeam.draft_position,
        currentTeams: teamsWithYearPositions,
      });
    }, 150); // Small delay to let dnd-kit animation complete
  };

  const handleResetDraft = async () => {
    // Clear all timer localStorage entries for this league
    const keys = Object.keys(localStorage);
    keys.forEach(key => {
      if (key.startsWith(`draft_timer_${league.id}_`)) {
        localStorage.removeItem(key);
      }
    });

    await resetDraft.mutateAsync({
      leagueId: league.id,
      year: year,
      teams: teamsWithYearPositions,
      // numRounds will be fetched from year-specific settings
    });

    setShowResetDialog(false);
    setIsTimerRunning(false);
    setTimeLeft(draftTimeSeconds);
  };

  return (
    <div className="space-y-6">
      {/* Draft Controls */}
      <Card className="glass p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            {draftStatus === 'not_started' && (
              <AlertDialog open={showStartDialog} onOpenChange={setShowStartDialog}>
                <AlertDialogTrigger asChild>
                  <Button size="lg" className="glow-primary">
                    <Play className="mr-2 h-5 w-5" />
                    Start Draft
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Start Draft for {year}?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will start the draft for <strong>{year}</strong>. The draft will begin with Round 1, Pick 1.
                      <br />
                      <br />
                      Make sure all teams are set up and the draft order is correct before starting.
                      <br />
                      <br />
                      Are you ready to begin the draft?
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={startDraft}
                      className="bg-primary text-primary-foreground hover:bg-primary/90"
                      disabled={updateDraftState.isPending}
                    >
                      {updateDraftState.isPending ? 'Starting...' : 'Yes, Start Draft'}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}

            {draftStatus === 'in_progress' && (
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

            {(draftStatus === 'in_progress' || draftStatus === 'completed') && (
              <AlertDialog open={showResetDialog} onOpenChange={setShowResetDialog}>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="lg">
                    <Trash2 className="mr-2 h-5 w-5" />
                    Reset Draft
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Reset Draft?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete all draft picks for this year. Trade history will be preserved. This action cannot be undone.
                      <br />
                      <br />
                      Are you sure you want to reset the draft? All draft picks will be lost.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleResetDraft}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      disabled={resetDraft.isPending}
                    >
                      {resetDraft.isPending ? 'Resetting...' : 'Yes, Reset Draft'}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
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
      </Card>

      {/* Player Search - Show at top when it's the current pick */}
      {draftStatus === 'in_progress' && currentPick && !currentPick.player_id && (
        <Card className="glass p-4 relative z-30">
          <div className="space-y-2">
            <div className="text-sm font-semibold text-muted-foreground">
              Select Player for {currentTeam?.name || 'Current Team'} - Round {currentPick.round}, Pick {currentPick.pick_number}
            </div>
            <PlayerSearch
              onSelect={handleDraft}
              excludePlayerIds={excludedPlayerIds}
              placeholder="Search player..."
              autoFocus
            />
          </div>
        </Card>
      )}

      {/* Draft Board Grid */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleHeaderDragEnd}
      >
        <div className="overflow-x-auto overflow-y-visible">
          <div className="min-w-[1800px] relative">
            {/* Team Headers */}
            <div className="grid gap-1 mb-2" style={{ gridTemplateColumns: `80px repeat(${sortedTeams.length}, minmax(0, 1fr))` }}>
              <div className="p-2 text-sm font-semibold text-muted-foreground">Round</div>
              <SortableContext
                items={sortedTeams.map(t => t.id)}
                strategy={horizontalListSortingStrategy}
              >
                {sortedTeams.map(team => (
                  <SortableTeamHeader
                    key={team.id}
                    team={team}
                    isCurrent={currentTeam?.id === team.id}
                    draftStatus={draftStatus}
                  />
                ))}
              </SortableContext>
            </div>

          {/* Draft Picks Grid */}
          {Object.entries(picksByRound).map(([round, roundPicks]) => {
            const roundNum = parseInt(round);
            
            return (
              <div 
                key={round} 
                className="grid gap-1 mb-1" 
                style={{ gridTemplateColumns: `80px repeat(${sortedTeams.length}, minmax(0, 1fr))` }}
              >
                <div className="flex items-center justify-center p-2 bg-muted/50 rounded-l-lg font-display text-lg">
                  {round}
                </div>
                
                {sortedTeams.map((team, teamIndex) => {
                  // For snake draft, determine which team should pick at this column position in this round
                  // The columns represent teams in their draft order
                  // For each round, we need to find which pick belongs to the team in this column
                  // 
                  // In a snake draft:
                  // Round 1 (odd): Team 1 picks at column 0, Team 2 at column 1, Team 3 at column 2
                  // Round 2 (even): Team 3 picks at column 0, Team 2 at column 1, Team 1 at column 2
                  const isOddRound = roundNum % 2 === 1;
                  
                  // Calculate which team picks at this column position
                  // In odd rounds: column index directly maps to team index (forward)
                  // In even rounds: column index maps to reverse team index (reverse)
                  const pickingTeamIndex = isOddRound ? teamIndex : sortedTeams.length - 1 - teamIndex;
                  const pickingTeam = sortedTeams[pickingTeamIndex];
                  
                  if (!pickingTeam) return <div key={team.id} className="p-2 bg-muted/20" />;
                  
                  // Find the pick that belongs to the team picking at this position
                  // Use current_team_id so traded picks show in the column of the team that owns them
                  // In snake draft, each team picks at a specific position in each round
                  // We need to find the pick where current_team_id matches the team picking at this position
                  const pick = roundPicks.find(p => p.current_team_id === pickingTeam.id);
                  
                  if (!pick) return <div key={team.id} className="p-2 bg-muted/20" />;

                  const isCurrent = currentPick?.id === pick.id;
                  const isTraded = pick.current_team_id !== pick.original_team_id;
                  const tradedToTeam = isTraded ? teamsWithYearPositions.find(t => t.id === pick.current_team_id) : null;
                  const draftedByTeam = pick.player_id && isTraded ? tradedToTeam : null;

                  const displayPlayer = pick.player;

                  return (
                    <div
                      key={team.id}
                      className={cn(
                        "p-2 rounded transition-all duration-300 min-h-[60px] flex flex-col justify-center relative min-w-0",
                        isCurrent && "bg-primary/20 border-2 border-primary animate-pulse-glow z-20",
                        !isCurrent && pick.player_id && "bg-secondary",
                        !isCurrent && !pick.player_id && "bg-muted/30",
                        isTraded && pick.player_id && "ring-2 ring-accent/60 border-accent/30"
                      )}
                      style={isCurrent ? { overflow: 'visible', zIndex: 20, minWidth: 0, maxWidth: '100%' } : { minWidth: 0, maxWidth: '100%' }}
                    >
                      {isCurrent && !displayPlayer && draftStatus === 'in_progress' ? (
                        <div className="text-center text-sm text-muted-foreground py-2">
                          Select player above
                        </div>
                      ) : displayPlayer ? (
                        <div className="space-y-1">
                          <div className="flex items-center gap-1 flex-wrap">
                            <PositionBadge position={displayPlayer.position} className="text-[10px]" />
                            {isTraded && (
                              <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 bg-accent/20 text-accent border-accent/50">
                                TRADED
                              </Badge>
                            )}
                          </div>
                          <div className="text-sm font-semibold truncate">
                            {displayPlayer.full_name}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {displayPlayer.team || 'FA'}
                          </div>
                          {draftedByTeam && (
                            <div className="text-xs font-medium text-accent pt-0.5 border-t border-accent/20 mt-1">
                              Drafted by: {draftedByTeam.name}
                            </div>
                          )}
                        </div>
                      ) : isTraded && tradedToTeam ? (
                        <div className="text-xs text-accent text-center">
                          → {tradedToTeam.name}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            );
          })}
          </div>
        </div>
      </DndContext>

      {/* Keepers Section */}
      {keepers.length > 0 && (
        <div className="overflow-x-auto">
          <div className="min-w-[1800px]">
            {/* Keepers Header */}
            <div className="grid gap-1 mb-2 mt-6" style={{ gridTemplateColumns: `80px repeat(${sortedTeams.length}, minmax(0, 1fr))` }}>
              <div className="p-2 text-sm font-semibold text-muted-foreground">Keepers</div>
              {sortedTeams.map(team => (
                <div 
                  key={team.id} 
                  className="p-3 rounded-t-lg text-center font-display text-lg truncate bg-secondary min-w-0"
                >
                  {team.name}
                </div>
              ))}
            </div>

            {/* Keepers Grid */}
            <div className="grid gap-1 mb-1" style={{ gridTemplateColumns: `80px repeat(${sortedTeams.length}, minmax(0, 1fr))` }}>
              <div className="flex items-center justify-center p-2 bg-muted/50 rounded-l-lg font-display text-lg">
                K
              </div>
              
              {sortedTeams.map(team => {
                const teamKeepers = keepers.filter(k => k.team_id === team.id);
                
                return (
                  <div
                    key={team.id}
                    className="p-2 bg-secondary/80 rounded min-h-[60px] flex flex-col gap-2"
                  >
                    {teamKeepers.length > 0 ? (
                      teamKeepers.map((keeper, idx) => (
                        keeper.player ? (
                          <div key={keeper.id} className={cn("space-y-1", idx > 0 && "pt-2 border-t border-border/50")}>
                            <div className="flex items-center gap-1">
                              <PositionBadge position={keeper.player.position} className="text-[10px]" />
                            </div>
                            <div className="text-sm font-semibold truncate">
                              {keeper.player.full_name}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {keeper.player.team || 'FA'}
                            </div>
                          </div>
                        ) : null
                      ))
                    ) : (
                      <div className="text-xs text-muted-foreground text-center py-2">
                        No keepers
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <ErrorModal
        open={errorModal.open}
        onClose={() => setErrorModal({ ...errorModal, open: false })}
        title={errorModal.title}
        message={errorModal.message}
      />
    </div>
  );
}
