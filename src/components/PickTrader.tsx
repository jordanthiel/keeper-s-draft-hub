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
import { TradeHistory } from '@/components/TradeHistory';

interface PickTraderProps {
  league: League;
  teams: Team[];
  year: number;
}

export function PickTrader({ league, teams, year }: PickTraderProps) {
  const [fromTeamId, setFromTeamId] = useState<string>('');
  const [toTeamId, setToTeamId] = useState<string>('');
  const [selectedPickId, setSelectedPickId] = useState<string>('');
  const [returnPickId, setReturnPickId] = useState<string>('');

  const { data: picks = [] } = useDraftPicks(league.id, year);
  const tradePick = useTradePick();

  // Filter picks owned by the "from" team that haven't been used yet
  const availablePicks = picks.filter(p => 
    p.current_team_id === fromTeamId && 
    !p.player_id &&
    p.id !== returnPickId
  );

  // Filter picks owned by the "to" team that haven't been used yet (for return pick)
  const availableReturnPicks = picks.filter(p => 
    p.current_team_id === toTeamId && 
    !p.player_id &&
    p.id !== selectedPickId
  );

  const handleTrade = async () => {
    if (!selectedPickId || !returnPickId || !fromTeamId || !toTeamId) return;

    await tradePick.mutateAsync({
      pickId: selectedPickId,
      returnPickId: returnPickId,
      fromTeamId,
      toTeamId,
      leagueId: league.id,
      year: year,
    });

    setSelectedPickId('');
    setReturnPickId('');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <ArrowLeftRight className="h-6 w-6 text-primary" />
        <h2 className="text-2xl font-display">Trade Picks</h2>
      </div>

      <Card className="glass">
        <CardHeader>
          <CardTitle>Execute Trade ({year})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">

          <div className="grid gap-4 md:grid-cols-[1fr,auto,1fr]">
            <div className="space-y-2">
              <Label>From Team</Label>
              <Select value={fromTeamId} onValueChange={(value) => {
                setFromTeamId(value);
                setSelectedPickId('');
                setReturnPickId('');
              }}>
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
              <Select value={toTeamId} onValueChange={(value) => {
                setToTeamId(value);
                setSelectedPickId('');
                setReturnPickId('');
              }}>
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
            <div className="space-y-4">
              <div className="text-sm text-muted-foreground">
                Each team must give a pick to keep the number of picks even.
              </div>
              <div className="grid gap-4 md:grid-cols-[1fr,auto,1fr]">
                <div className="space-y-2">
                  <Label>{teams.find(t => t.id === fromTeamId)?.name || 'From Team'} gives</Label>
                  <Select value={selectedPickId} onValueChange={setSelectedPickId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select pick to trade..." />
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

                <div className="flex items-center justify-center">
                  <ArrowLeftRight className="h-6 w-6 text-muted-foreground" />
                </div>

                <div className="space-y-2">
                  <Label>{teams.find(t => t.id === toTeamId)?.name || 'To Team'} gives</Label>
                  <Select value={returnPickId} onValueChange={setReturnPickId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select return pick..." />
                    </SelectTrigger>
                    <SelectContent>
                      {availableReturnPicks.length === 0 ? (
                        <SelectItem value="none" disabled>
                          No available picks
                        </SelectItem>
                      ) : (
                        availableReturnPicks.map(pick => {
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
              </div>
            </div>
          )}

          <Button 
            onClick={handleTrade} 
            disabled={!selectedPickId || !returnPickId || tradePick.isPending}
            className="w-full"
          >
            <ArrowLeftRight className="h-4 w-4 mr-2" />
            {tradePick.isPending ? 'Trading...' : 'Execute Trade'}
          </Button>
        </CardContent>
      </Card>

      <TradeHistory leagueId={league.id} teams={teams} />
    </div>
  );
}
