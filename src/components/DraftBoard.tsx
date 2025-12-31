import { useState, useEffect } from 'react';
import { useDraftPicks, useMakePick, useUpdateLeague, useAllKeepers } from '@/hooks/useLeague';
import { League, Team, Player, DraftPick, Position, POSITION_COLORS } from '@/lib/types';
import { PlayerSearch } from './PlayerSearch';
import { ErrorModal } from './ErrorModal';
import { PositionBadge } from './PositionBadge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Play, Pause, RotateCcw, Clock, Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';

interface DraftBoardProps {
  league: League;
  teams: Team[];
}

export function DraftBoard({ league, teams }: DraftBoardProps) {
  const currentYear = new Date().getFullYear();
  const { data: picks = [], refetch } = useDraftPicks(league.id, currentYear);
  const { data: keepers = [] } = useAllKeepers(league.id);
  const makePick = useMakePick();
  const updateLeague = useUpdateLeague();

  const [timeLeft, setTimeLeft] = useState(league.draft_time_seconds);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [errorModal, setErrorModal] = useState<{ open: boolean; title: string; message: string }>({
    open: false,
    title: '',
    message: '',
  });

  // Get current pick info
  const currentPick = picks.find(p => !p.player_id && !p.is_keeper);
  const draftedPlayerIds = picks.filter(p => p.player_id).map(p => p.player_id!);
  const keeperPlayerIds = keepers.map(k => k.player_id);
  const excludedPlayerIds = [...draftedPlayerIds, ...keeperPlayerIds];

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
    if (!isTimerRunning || league.draft_status !== 'in_progress') return;

    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          setIsTimerRunning(false);
          return league.draft_time_seconds;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isTimerRunning, league.draft_status, league.draft_time_seconds]);

  // Reset timer when pick changes
  useEffect(() => {
    setTimeLeft(league.draft_time_seconds);
    if (league.draft_status === 'in_progress' && currentPick) {
      setIsTimerRunning(true);
    }
  }, [currentPick?.id, league.draft_time_seconds, league.draft_status]);

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

    await makePick.mutateAsync({
      pickId: currentPick.id,
      playerId: player.id,
      leagueId: league.id,
      year: currentYear,
    });

    setTimeLeft(league.draft_time_seconds);
  };

  const startDraft = async () => {
    await updateLeague.mutateAsync({
      id: league.id,
      draft_status: 'in_progress',
      current_pick: 1,
      current_round: 1,
    });
    setIsTimerRunning(true);
  };

  const pauseDraft = () => {
    setIsTimerRunning(false);
  };

  const resumeDraft = () => {
    setIsTimerRunning(true);
  };

  const resetTimer = () => {
    setTimeLeft(league.draft_time_seconds);
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

  return (
    <div className="space-y-6">
      {/* Draft Controls */}
      <Card className="glass p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            {league.draft_status === 'not_started' && (
              <Button onClick={startDraft} size="lg" className="glow-primary">
                <Play className="mr-2 h-5 w-5" />
                Start Draft
              </Button>
            )}

            {league.draft_status === 'in_progress' && (
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
          </div>

          {league.draft_status === 'in_progress' && currentPick && (
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

        {/* Player Search */}
        {league.draft_status === 'in_progress' && currentPick && (
          <div className="mt-6 max-w-xl">
            <PlayerSearch
              onSelect={handleDraft}
              excludePlayerIds={excludedPlayerIds}
              placeholder={`Search for a player for ${currentTeam?.name}...`}
              autoFocus
            />
          </div>
        )}
      </Card>

      {/* Draft Board Grid */}
      <div className="overflow-x-auto">
        <div className="min-w-[1200px]">
          {/* Team Headers */}
          <div className="grid gap-1 mb-2" style={{ gridTemplateColumns: `80px repeat(${teams.length}, 1fr)` }}>
            <div className="p-2 text-sm font-semibold text-muted-foreground">Round</div>
            {teams.map(team => (
              <div 
                key={team.id} 
                className={cn(
                  "p-3 rounded-t-lg text-center font-display text-lg truncate",
                  currentTeam?.id === team.id && league.draft_status === 'in_progress'
                    ? "bg-primary text-primary-foreground glow-primary"
                    : "bg-secondary"
                )}
              >
                {team.name}
              </div>
            ))}
          </div>

          {/* Draft Picks Grid */}
          {Object.entries(picksByRound).map(([round, roundPicks]) => {
            const roundNum = parseInt(round);
            
            return (
              <div 
                key={round} 
                className="grid gap-1 mb-1" 
                style={{ gridTemplateColumns: `80px repeat(${teams.length}, 1fr)` }}
              >
                <div className="flex items-center justify-center p-2 bg-muted/50 rounded-l-lg font-display text-lg">
                  {round}
                </div>
                
                {teams.map(team => {
                  // Find the pick for this team in this round
                  const pick = roundPicks.find(p => p.original_team_id === team.id);
                  if (!pick) return <div key={team.id} className="p-2 bg-muted/20" />;

                  const isCurrent = currentPick?.id === pick.id;
                  const isTraded = pick.current_team_id !== pick.original_team_id;
                  const tradedToTeam = isTraded ? teams.find(t => t.id === pick.current_team_id) : null;

                  // Check for keeper in this round
                  const keeper = keepers.find(k => 
                    k.team_id === pick.current_team_id && 
                    k.round_cost === roundNum
                  );

                  const displayPlayer = pick.player || keeper?.player;

                  return (
                    <div
                      key={team.id}
                      className={cn(
                        "p-2 rounded transition-all duration-300 min-h-[60px] flex flex-col justify-center",
                        isCurrent && "bg-primary/30 border-2 border-primary animate-pulse-glow",
                        !isCurrent && pick.player_id && "bg-secondary/80",
                        !isCurrent && keeper && "bg-accent/20 border border-accent/50",
                        !isCurrent && !pick.player_id && !keeper && "bg-muted/20",
                        isTraded && "ring-1 ring-accent/50"
                      )}
                    >
                      {displayPlayer ? (
                        <div className="space-y-1">
                          <div className="flex items-center gap-1">
                            {keeper && <Star className="h-3 w-3 text-accent" />}
                            <PositionBadge position={displayPlayer.position} className="text-[10px]" />
                          </div>
                          <div className="text-sm font-semibold truncate">
                            {displayPlayer.full_name}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {displayPlayer.team || 'FA'}
                          </div>
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

      <ErrorModal
        open={errorModal.open}
        onClose={() => setErrorModal({ ...errorModal, open: false })}
        title={errorModal.title}
        message={errorModal.message}
      />
    </div>
  );
}
