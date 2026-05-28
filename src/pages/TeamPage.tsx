import { useParams, Link } from 'react-router-dom';
import { useLeague, useTeams, useKeepers, useAddKeeper, useRemoveKeeper, useLeagueSettings, useDraftPicks, useDraftState } from '@/hooks/useLeague';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PlayerSearch } from '@/components/PlayerSearch';
import { PositionBadge } from '@/components/PositionBadge';
import { ArrowLeft, Star, Trash2, Users } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { useState, useMemo } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';

export default function TeamPage() {
  const { leagueId, teamId } = useParams<{ leagueId: string; teamId: string }>();
  const currentYearValue = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYearValue);
  
  const { data: league, isLoading: leagueLoading } = useLeague(leagueId);
  const { data: teams = [], isLoading: teamsLoading } = useTeams(leagueId);
  const { data: keepers = [], isLoading: keepersLoading } = useKeepers(teamId);
  const { data: settings } = useLeagueSettings(leagueId, selectedYear);
  const { data: draftPicks = [], isLoading: draftPicksLoading } = useDraftPicks(leagueId, selectedYear);
  const { data: draftState } = useDraftState(leagueId, selectedYear);
  const addKeeper = useAddKeeper();
  const removeKeeper = useRemoveKeeper();
  const { toast } = useToast();

  const isLoading = leagueLoading || teamsLoading || keepersLoading || draftPicksLoading;
  
  // Check if draft is completed
  const isDraftComplete = draftState?.draft_status === 'completed';
  
  // Get roster (draft picks for this team that have been picked)
  const roster = useMemo(() => {
    if (!isDraftComplete || !teamId) return [];
    return draftPicks.filter(pick => 
      pick.current_team_id === teamId && 
      pick.player_id !== null &&
      pick.picked_at !== null
    );
  }, [draftPicks, teamId, isDraftComplete]);

  const team = teams.find(t => t.id === teamId);
  const maxKeepers = settings?.num_keepers ?? 0;
  const canAddKeepers = maxKeepers === 0 || keepers.length < maxKeepers;

  // Get position slot limits from settings or league defaults
  const positionLimits = useMemo(() => {
    if (settings) {
      return {
        QB: settings.qb_slots ?? league?.qb_slots ?? 1,
        RB: settings.rb_slots ?? league?.rb_slots ?? 2,
        WR: settings.wr_slots ?? league?.wr_slots ?? 2,
        TE: settings.te_slots ?? league?.te_slots ?? 1,
        K: settings.k_slots ?? league?.k_slots ?? 1,
        DEF: settings.def_slots ?? league?.def_slots ?? 1,
        DP: settings.dp_slots ?? league?.dp_slots ?? 0,
      };
    }
    return {
      QB: league?.qb_slots ?? 1,
      RB: league?.rb_slots ?? 2,
      WR: league?.wr_slots ?? 2,
      TE: league?.te_slots ?? 1,
      K: league?.k_slots ?? 1,
      DEF: league?.def_slots ?? 1,
      DP: league?.dp_slots ?? 0,
    };
  }, [settings, league]);

  // Count players by position (from keepers or roster)
  const playersByPosition = useMemo(() => {
    const counts: Record<string, number> = {
      QB: 0,
      RB: 0,
      WR: 0,
      TE: 0,
      K: 0,
      DEF: 0,
      DP: 0,
    };
    
    if (isDraftComplete) {
      // Count from roster
      roster.forEach(pick => {
        const position = pick.player?.position;
        if (position) {
          // Map IDP positions (DL, LB, DB) to DP
          if (position === 'DL' || position === 'LB' || position === 'DB') {
            counts['DP']++;
          } else if (position in counts) {
            counts[position]++;
          }
        }
      });
    } else {
      // Count from keepers
      keepers.forEach(keeper => {
        const position = keeper.player?.position;
        if (position) {
          // Map IDP positions (DL, LB, DB) to DP
          if (position === 'DL' || position === 'LB' || position === 'DB') {
            counts['DP']++;
          } else if (position in counts) {
            counts[position]++;
          }
        }
      });
    }
    
    return counts;
  }, [keepers, roster, isDraftComplete]);

  // Generate year options (current year and 5 years before/after)
  const yearOptions = [];
  for (let i = currentYearValue - 5; i <= currentYearValue + 5; i++) {
    yearOptions.push(i);
  }

  const handleAddKeeper = async (player: any) => {
    if (!teamId) return;
    
    // Check total keeper limit
    if (maxKeepers > 0 && keepers.length >= maxKeepers) {
      toast({
        title: 'Maximum keepers reached',
        description: `You have reached the maximum number of keepers (${maxKeepers}) for ${selectedYear}.`,
        variant: 'destructive',
      });
      return;
    }
    
    // Check position limit
    const playerPosition = player.position;
    if (playerPosition && playerPosition in positionLimits) {
      const currentCount = playersByPosition[playerPosition] || 0;
      const maxForPosition = positionLimits[playerPosition as keyof typeof positionLimits];
      
      if (currentCount >= maxForPosition) {
        toast({
          title: 'Position limit exceeded',
          description: `You already have ${currentCount} ${playerPosition} keeper${currentCount !== 1 ? 's' : ''}. The maximum allowed is ${maxForPosition} ${playerPosition} slot${maxForPosition !== 1 ? 's' : ''}.`,
          variant: 'destructive',
        });
        return;
      }
    }
    
    try {
      await addKeeper.mutateAsync({
        team_id: teamId,
        player_id: player.id,
      });
    } catch (error: any) {
      toast({
        title: 'Error adding keeper',
        description: error.message || 'Failed to add keeper',
        variant: 'destructive',
      });
    }
  };

  const handleRemoveKeeper = async (keeperId: string) => {
    if (!teamId) return;
    await removeKeeper.mutateAsync({ id: keeperId, teamId });
  };

  const keeperPlayerIds = keepers.map(k => k.player_id);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container py-8 space-y-6">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-[400px] w-full" />
        </div>
      </div>
    );
  }

  if (!league || !team) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <h1 className="text-2xl font-display">Team Not Found</h1>
          <Link to={leagueId ? `/league/${leagueId}` : '/'}>
            <Button>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border sticky top-0 z-40 bg-background/95 backdrop-blur">
        <div className="container py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link to={`/league/${leagueId}`}>
                <Button variant="ghost" size="icon">
                  <ArrowLeft className="h-5 w-5" />
                </Button>
              </Link>
              <div>
                <h1 className="text-2xl font-display">{team.name}</h1>
                <p className="text-sm text-muted-foreground">
                  {league.name}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                <Select value={selectedYear.toString()} onValueChange={(value) => setSelectedYear(parseInt(value, 10))}>
                  <SelectTrigger className="w-[100px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {yearOptions.map(year => (
                      <SelectItem key={year} value={year.toString()}>
                        {year}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container py-6">
        <div className="space-y-6">
          {/* Position Status */}
          <Card className="glass">
            <CardHeader>
              <CardTitle>Position Status</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                {Object.entries(positionLimits).map(([position, max]) => {
                  const current = playersByPosition[position] || 0;
                  const isFull = current >= max;
                  return (
                    <div key={position} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm">{position}</span>
                        <span className={`text-sm ${isFull ? 'text-muted-foreground' : 'text-primary'}`}>
                          {current}/{max}
                        </span>
                      </div>
                      <div className="w-full bg-muted rounded-full h-2">
                        <div
                          className={`h-2 rounded-full transition-all ${
                            isFull ? 'bg-primary' : current > 0 ? 'bg-primary/60' : 'bg-muted'
                          }`}
                          style={{ width: `${Math.min((current / max) * 100, 100)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Star className="h-6 w-6 text-primary" />
              <h2 className="text-2xl font-display">
                {isDraftComplete ? `Roster for ${selectedYear}` : `Keepers for ${selectedYear}`}
                {!isDraftComplete && maxKeepers > 0 && (
                  <span className="text-lg text-muted-foreground ml-2">
                    ({keepers.length}/{maxKeepers})
                  </span>
                )}
              </h2>
            </div>
          </div>

          {!isDraftComplete && (
            <Card className="glass relative z-10">
              <CardHeader>
                <CardTitle>Add Keeper</CardTitle>
              </CardHeader>
              <CardContent>
                {!canAddKeepers ? (
                  <p className="text-sm text-muted-foreground">
                    Maximum number of keepers ({maxKeepers}) reached for {selectedYear}.
                  </p>
                ) : (
                  <PlayerSearch
                    onSelect={handleAddKeeper}
                    excludePlayerIds={keeperPlayerIds}
                    placeholder="Search for a player to add as keeper..."
                    autoFocus
                  />
                )}
              </CardContent>
            </Card>
          )}

          <Card className="glass">
            <CardHeader>
              <CardTitle>{isDraftComplete ? 'Roster' : 'Current Keepers'}</CardTitle>
            </CardHeader>
            <CardContent>
              {isDraftComplete ? (
                roster.length === 0 ? (
                  <div className="text-center py-12">
                    <Star className="h-12 w-12 mx-auto text-muted-foreground mb-4 opacity-50" />
                    <p className="text-muted-foreground">No players on roster for {selectedYear}</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Position</TableHead>
                          <TableHead>Player Name</TableHead>
                          <TableHead>Team</TableHead>
                          <TableHead>Round</TableHead>
                          <TableHead>Pick</TableHead>
                          {roster.some(p => p.is_keeper) && <TableHead>Keeper</TableHead>}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {roster
                          .sort((a, b) => {
                            // Sort by round, then pick number
                            if (a.round !== b.round) return a.round - b.round;
                            return (a.pick_number || 0) - (b.pick_number || 0);
                          })
                          .map(pick => (
                            <TableRow key={pick.id}>
                              <TableCell>
                                <PositionBadge position={pick.player?.position || null} />
                              </TableCell>
                              <TableCell className="font-medium">
                                {pick.player?.full_name || 'Unknown Player'}
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline">
                                  {pick.player?.team || 'FA'}
                                </Badge>
                              </TableCell>
                              <TableCell>Round {pick.round}</TableCell>
                              <TableCell>#{pick.pick_number || '-'}</TableCell>
                              {roster.some(p => p.is_keeper) && (
                                <TableCell>
                                  {pick.is_keeper && (
                                    <Badge variant="secondary" className="gap-1">
                                      <Star className="h-3 w-3" />
                                      Keeper
                                    </Badge>
                                  )}
                                </TableCell>
                              )}
                            </TableRow>
                          ))}
                      </TableBody>
                    </Table>
                  </div>
                )
              ) : (
                keepers.length === 0 ? (
                  <div className="text-center py-12">
                    <Star className="h-12 w-12 mx-auto text-muted-foreground mb-4 opacity-50" />
                    <p className="text-muted-foreground">No keepers set for {selectedYear}</p>
                    <p className="text-sm text-muted-foreground mt-2">
                      Use the search above to add keepers
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Position</TableHead>
                          <TableHead>Player Name</TableHead>
                          <TableHead>Team</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {keepers.map(keeper => (
                          <TableRow key={keeper.id}>
                            <TableCell>
                              <PositionBadge position={keeper.player?.position || null} />
                            </TableCell>
                            <TableCell className="font-medium">
                              {keeper.player?.full_name || 'Unknown Player'}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">
                                {keeper.player?.team || 'FA'}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleRemoveKeeper(keeper.id)}
                                className="text-muted-foreground hover:text-destructive"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}

