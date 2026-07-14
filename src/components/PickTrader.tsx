import { useState } from 'react';
import { Team, League } from '@/lib/types';
import { useDraftPicks, useTradePick, usePickTrades } from '@/hooks/useLeague';
import { useLeaguePermissions } from '@/hooks/useLeaguePermissions';
import { AuthDialog } from '@/components/AuthDialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { ArrowLeftRight, ArrowRight, Shield } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface PickTraderProps {
  league: League;
  teams: Team[];
}

export function PickTrader({ league, teams }: PickTraderProps) {
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [fromTeamId, setFromTeamId] = useState<string>('');
  const [toTeamId, setToTeamId] = useState<string>('');
  const [selectedPickId, setSelectedPickId] = useState<string>('');

  const { data: picks = [] } = useDraftPicks(league.id, selectedYear);
  const { data: trades = [], isLoading: tradesLoading } = usePickTrades(league.id);
  const tradePick = useTradePick();
  const { isAdmin } = useLeaguePermissions(league);

  const availablePicks = picks.filter(p =>
    p.current_team_id === fromTeamId &&
    !p.player_id &&
    p.current_team_id !== toTeamId
  );

  const handleTrade = async () => {
    if (!isAdmin || !selectedPickId || !fromTeamId || !toTeamId) return;

    await tradePick.mutateAsync({
      pickId: selectedPickId,
      fromTeamId,
      toTeamId,
      leagueId: league.id,
      year: selectedYear,
      asAdmin: true,
    });

    setSelectedPickId('');
  };

  const years = [currentYear, currentYear + 1, currentYear + 2];

  const teamName = (teamId: string, fallback?: Team) =>
    fallback?.name ?? teams.find(t => t.id === teamId)?.name ?? 'Unknown';

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <ArrowLeftRight className="h-6 w-6 text-primary" />
        <h2 className="text-2xl font-display">Trade Picks</h2>
      </div>

      {isAdmin ? (
        <Card className="glass">
          <CardHeader>
            <CardTitle>Execute Trade</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label>Year</Label>
              <Select value={selectedYear.toString()} onValueChange={(v) => setSelectedYear(parseInt(v))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {years.map(year => (
                    <SelectItem key={year} value={year.toString()}>
                      {year}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-4 md:grid-cols-[1fr,auto,1fr]">
              <div className="space-y-2">
                <Label>From Team</Label>
                <Select value={fromTeamId} onValueChange={setFromTeamId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select team..." />
                  </SelectTrigger>
                  <SelectContent>
                    {teams.map(team => (
                      <SelectItem key={team.id} value={team.id}>
                        {team.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-end justify-center pb-2">
                <ArrowRight className="h-6 w-6 text-muted-foreground" />
              </div>

              <div className="space-y-2">
                <Label>To Team</Label>
                <Select value={toTeamId} onValueChange={setToTeamId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select team..." />
                  </SelectTrigger>
                  <SelectContent>
                    {teams.filter(t => t.id !== fromTeamId).map(team => (
                      <SelectItem key={team.id} value={team.id}>
                        {team.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {fromTeamId && toTeamId && (
              <div className="space-y-2">
                <Label>Select Pick to Trade</Label>
                <Select value={selectedPickId} onValueChange={setSelectedPickId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select pick..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availablePicks.length === 0 ? (
                      <SelectItem value="none" disabled>
                        No available picks
                      </SelectItem>
                    ) : (
                      availablePicks.map(pick => {
                        const originalTeam = teams.find(t => t.id === pick.original_team_id);
                        return (
                          <SelectItem key={pick.id} value={pick.id}>
                            Round {pick.round} - Originally {originalTeam?.name || 'Unknown'}
                          </SelectItem>
                        );
                      })
                    )}
                  </SelectContent>
                </Select>
              </div>
            )}

            <Button
              onClick={handleTrade}
              disabled={!selectedPickId || tradePick.isPending}
              className="w-full"
            >
              <ArrowLeftRight className="h-4 w-4 mr-2" />
              {tradePick.isPending ? 'Trading...' : 'Execute Trade'}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="glass p-8 text-center space-y-4">
          <Shield className="h-10 w-10 mx-auto text-muted-foreground" />
          <p className="text-muted-foreground">
            Only the league admin can execute pick trades.
          </p>
          <div className="flex justify-center">
            <AuthDialog triggerLabel="Sign in as admin" />
          </div>
        </Card>
      )}

      <Card className="glass">
        <CardHeader>
          <CardTitle>Trade History</CardTitle>
        </CardHeader>
        <CardContent>
          {tradesLoading ? (
            <p className="text-sm text-muted-foreground">Loading trades...</p>
          ) : trades.length === 0 ? (
            <p className="text-sm text-muted-foreground">No trades yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {trades.map(trade => {
                const pick = trade.draft_pick;
                return (
                  <li
                    key={trade.id}
                    className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-0 space-y-0.5">
                      <p className="font-medium">
                        {teamName(trade.from_team_id, trade.from_team)}
                        <ArrowRight className="inline h-3.5 w-3.5 mx-1.5 text-muted-foreground align-[-2px]" />
                        {teamName(trade.to_team_id, trade.to_team)}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {pick
                          ? `${pick.year} Round ${pick.round}${pick.pick_number != null ? ` (pick ${pick.pick_number})` : ''}`
                          : 'Draft pick'}
                      </p>
                    </div>
                    <p className="text-xs text-muted-foreground shrink-0 pt-0.5">
                      {formatDistanceToNow(new Date(trade.traded_at), { addSuffix: true })}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
