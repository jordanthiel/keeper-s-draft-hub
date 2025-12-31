import { useState } from 'react';
import { Team, League, DraftPick } from '@/lib/types';
import { useDraftPicks, useTradePick } from '@/hooks/useLeague';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { ArrowLeftRight, ArrowRight } from 'lucide-react';
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
  const tradePick = useTradePick();

  // Filter picks owned by the "from" team that haven't been used yet
  const availablePicks = picks.filter(p => 
    p.current_team_id === fromTeamId && 
    !p.player_id &&
    p.current_team_id !== toTeamId
  );

  const handleTrade = async () => {
    if (!selectedPickId || !fromTeamId || !toTeamId) return;

    await tradePick.mutateAsync({
      pickId: selectedPickId,
      fromTeamId,
      toTeamId,
      leagueId: league.id,
      year: selectedYear,
    });

    setSelectedPickId('');
  };

  const years = [currentYear, currentYear + 1, currentYear + 2];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <ArrowLeftRight className="h-6 w-6 text-primary" />
        <h2 className="text-2xl font-display">Trade Picks</h2>
      </div>

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

      {/* Trade History would go here */}
    </div>
  );
}
