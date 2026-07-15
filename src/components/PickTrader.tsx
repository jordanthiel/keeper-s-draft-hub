import { useEffect, useMemo, useState } from 'react';
import { Team, League, TradablePickSlot } from '@/lib/types';
import {
  useDraftPicks,
  usePickSwaps,
  useExecutePickSwap,
  useDeletePickSwap,
  buildTradableSlots,
  slotKey,
} from '@/hooks/useLeague';
import { useLeaguePermissions } from '@/hooks/useLeaguePermissions';
import { AuthDialog } from '@/components/AuthDialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { ArrowLeftRight, Shield, Trash2 } from 'lucide-react';
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

function formatSlotLabel(
  slot: { original_team_id: string; round: number },
  ownerTeamId: string,
  teams: Team[]
) {
  const original = teams.find((t) => t.id === slot.original_team_id);
  const isOwn = slot.original_team_id === ownerTeamId;
  return isOwn
    ? `Round ${slot.round}`
    : `Round ${slot.round} (via ${original?.name ?? 'another team'})`;
}

function ownedRoundsForTeam(args: {
  ownerTeamId: string;
  league: League;
  teams: Team[];
  year: number;
  picks: Parameters<typeof buildTradableSlots>[0]['picks'];
  swaps: Parameters<typeof buildTradableSlots>[0]['swaps'];
}): TradablePickSlot[] {
  const { ownerTeamId, league, teams, year, picks, swaps } = args;
  if (!ownerTeamId) return [];

  // Only rounds this team still owns, within league.num_rounds from settings.
  // Traded-away rounds are omitted (not shown greyed/disabled).
  return buildTradableSlots({
    teams,
    numRounds: league.num_rounds,
    year,
    ownerTeamId,
    picks,
    swaps,
  }).filter((slot) => slot.round >= 1 && slot.round <= league.num_rounds);
}

function RoundPickSelect({
  teamId,
  slots,
  value,
  onChange,
  teams,
  numRounds,
}: {
  teamId: string;
  slots: TradablePickSlot[];
  value: string;
  onChange: (key: string) => void;
  teams: Team[];
  numRounds: number;
}) {
  const selectedStillOwned = slots.some((s) => slotKey(s) === value);

  return (
    <div className="space-y-2">
      <Label>Round (1–{numRounds})</Label>
      <Select
        value={selectedStillOwned ? value : undefined}
        onValueChange={onChange}
        disabled={!teamId || slots.length === 0}
      >
        <SelectTrigger>
          <SelectValue
            placeholder={
              !teamId
                ? 'Select a team first...'
                : slots.length === 0
                  ? 'No rounds left to trade'
                  : 'Select round...'
            }
          />
        </SelectTrigger>
        <SelectContent>
          {slots.map((slot) => (
            <SelectItem key={slotKey(slot)} value={slotKey(slot)}>
              {formatSlotLabel(slot, teamId, teams)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {teamId && slots.length === 0 && (
        <p className="text-xs text-muted-foreground">
          This team has no remaining picks to trade for this year.
        </p>
      )}
    </div>
  );
}

export function PickTrader({ league, teams }: PickTraderProps) {
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [teamAId, setTeamAId] = useState('');
  const [teamBId, setTeamBId] = useState('');
  const [slotAKey, setSlotAKey] = useState('');
  const [slotBKey, setSlotBKey] = useState('');

  const { data: picks = [] } = useDraftPicks(league.id, selectedYear);
  const { data: swaps = [], isLoading: swapsLoading } = usePickSwaps(league.id);
  const executeSwap = useExecutePickSwap();
  const deleteSwap = useDeletePickSwap();
  const { isAdmin } = useLeaguePermissions(league);

  const yearSwaps = useMemo(
    () => swaps.filter((s) => s.year === selectedYear),
    [swaps, selectedYear]
  );

  const teamASlots = useMemo(
    () =>
      ownedRoundsForTeam({
        ownerTeamId: teamAId,
        league,
        teams,
        year: selectedYear,
        picks,
        swaps,
      }),
    [teamAId, league, teams, selectedYear, picks, swaps]
  );

  const teamBSlots = useMemo(
    () =>
      ownedRoundsForTeam({
        ownerTeamId: teamBId,
        league,
        teams,
        year: selectedYear,
        picks,
        swaps,
      }),
    [teamBId, league, teams, selectedYear, picks, swaps]
  );

  useEffect(() => {
    if (slotAKey && !teamASlots.some((s) => slotKey(s) === slotAKey)) {
      setSlotAKey('');
    }
  }, [slotAKey, teamASlots]);

  useEffect(() => {
    if (slotBKey && !teamBSlots.some((s) => slotKey(s) === slotBKey)) {
      setSlotBKey('');
    }
  }, [slotBKey, teamBSlots]);

  const selectedSlotA = teamASlots.find((s) => slotKey(s) === slotAKey);
  const selectedSlotB = teamBSlots.find((s) => slotKey(s) === slotBKey);

  const boardReady = picks.length > 0;
  const years = [currentYear, currentYear + 1, currentYear + 2];

  const handleTeamAChange = (id: string) => {
    setTeamAId(id);
    setSlotAKey('');
    if (id === teamBId) {
      setTeamBId('');
      setSlotBKey('');
    }
  };

  const handleTeamBChange = (id: string) => {
    setTeamBId(id);
    setSlotBKey('');
  };

  const handleTrade = async () => {
    if (!isAdmin || !selectedSlotA || !selectedSlotB || !teamAId || !teamBId) return;

    await executeSwap.mutateAsync({
      leagueId: league.id,
      year: selectedYear,
      teamAId,
      slotAOriginalTeamId: selectedSlotA.original_team_id,
      slotARound: selectedSlotA.round,
      teamBId,
      slotBOriginalTeamId: selectedSlotB.original_team_id,
      slotBRound: selectedSlotB.round,
    });

    setSlotAKey('');
    setSlotBKey('');
  };

  const canSubmit =
    !!selectedSlotA &&
    !!selectedSlotB &&
    slotAKey !== slotBKey &&
    teamAId !== teamBId;

  const teamName = (teamId: string, fallback?: Team) =>
    fallback?.name ?? teams.find((t) => t.id === teamId)?.name ?? 'Unknown';

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <ArrowLeftRight className="h-6 w-6 text-primary" />
        <div>
          <h2 className="text-2xl font-display">Trade Picks</h2>
          <p className="text-sm text-muted-foreground">
            Even swaps only — each side gives a pick. Round options come from league settings
            ({league.num_rounds} rounds) and only include picks each team still owns.
          </p>
        </div>
      </div>

      {isAdmin ? (
        <Card className="glass">
          <CardHeader>
            <CardTitle>Execute even trade</CardTitle>
            <CardDescription>
              {boardReady
                ? `${selectedYear} board is initialized — this swap updates ownership now.`
                : `${selectedYear} board is not initialized yet — this swap is saved and applied when you initialize.`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label>Year</Label>
              <Select
                value={selectedYear.toString()}
                onValueChange={(v) => {
                  setSelectedYear(parseInt(v));
                  setSlotAKey('');
                  setSlotBKey('');
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {years.map((year) => (
                    <SelectItem key={year} value={year.toString()}>
                      {year}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-6 md:grid-cols-[1fr,auto,1fr] md:items-start">
              <div className="space-y-4 rounded-lg border border-border p-4">
                <p className="text-sm font-semibold">Team A gives</p>
                <div className="space-y-2">
                  <Label>Team</Label>
                  <Select value={teamAId} onValueChange={handleTeamAChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select team..." />
                    </SelectTrigger>
                    <SelectContent>
                      {teams.map((team) => (
                        <SelectItem key={team.id} value={team.id}>
                          {team.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <RoundPickSelect
                  teamId={teamAId}
                  slots={teamASlots}
                  value={slotAKey}
                  onChange={setSlotAKey}
                  teams={teams}
                  numRounds={league.num_rounds}
                />
              </div>

              <div className="flex items-center justify-center pt-2 md:pt-12">
                <ArrowLeftRight className="h-6 w-6 text-primary" />
              </div>

              <div className="space-y-4 rounded-lg border border-border p-4">
                <p className="text-sm font-semibold">Team B gives</p>
                <div className="space-y-2">
                  <Label>Team</Label>
                  <Select value={teamBId} onValueChange={handleTeamBChange} disabled={!teamAId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select team..." />
                    </SelectTrigger>
                    <SelectContent>
                      {teams
                        .filter((t) => t.id !== teamAId)
                        .map((team) => (
                          <SelectItem key={team.id} value={team.id}>
                            {team.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <RoundPickSelect
                  teamId={teamBId}
                  slots={teamBSlots}
                  value={slotBKey}
                  onChange={setSlotBKey}
                  teams={teams}
                  numRounds={league.num_rounds}
                />
              </div>
            </div>

            {selectedSlotA && selectedSlotB && (
              <p className="text-sm text-muted-foreground text-center">
                {teamName(teamAId)} sends {formatSlotLabel(selectedSlotA, teamAId, teams)}
                {' ↔ '}
                {teamName(teamBId)} sends {formatSlotLabel(selectedSlotB, teamBId, teams)}
              </p>
            )}

            <Button
              onClick={handleTrade}
              disabled={!canSubmit || executeSwap.isPending || teams.length < 2}
              className="w-full"
            >
              <ArrowLeftRight className="h-4 w-4 mr-2" />
              {executeSwap.isPending ? 'Recording trade...' : 'Execute even trade'}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="glass p-8 text-center space-y-4">
          <Shield className="h-10 w-10 mx-auto text-muted-foreground" />
          <p className="text-muted-foreground">
            Only league admins can execute pick trades.
          </p>
          <div className="flex justify-center">
            <AuthDialog triggerLabel="Sign in as admin" />
          </div>
        </Card>
      )}

      <Card className="glass">
        <CardHeader>
          <CardTitle>Trade history</CardTitle>
          <CardDescription>
            Even swaps for all years. Survives board reset and re-applies on initialize.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {swapsLoading ? (
            <p className="text-sm text-muted-foreground">Loading trades...</p>
          ) : swaps.length === 0 ? (
            <p className="text-sm text-muted-foreground">No trades yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {swaps.map((swap) => (
                <li
                  key={swap.id}
                  className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0 space-y-0.5">
                    <p className="font-medium">
                      {teamName(swap.team_a_id, swap.team_a)}
                      <ArrowLeftRight className="inline h-3.5 w-3.5 mx-1.5 text-primary align-[-2px]" />
                      {teamName(swap.team_b_id, swap.team_b)}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {swap.year}:{' '}
                      {formatSlotLabel(
                        {
                          original_team_id: swap.slot_a_original_team_id,
                          round: swap.slot_a_round,
                        },
                        swap.team_a_id,
                        teams
                      )}
                      {' ↔ '}
                      {formatSlotLabel(
                        {
                          original_team_id: swap.slot_b_original_team_id,
                          round: swap.slot_b_round,
                        },
                        swap.team_b_id,
                        teams
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <p className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(swap.created_at), { addSuffix: true })}
                    </p>
                    {isAdmin && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        disabled={deleteSwap.isPending}
                        title="Remove trade"
                        onClick={() =>
                          deleteSwap.mutate({
                            swapId: swap.id,
                            leagueId: league.id,
                            year: swap.year,
                          })
                        }
                      >
                        <Trash2 className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {yearSwaps.length > 0 && !boardReady && (
            <p className="text-xs text-muted-foreground mt-4">
              {yearSwaps.length} swap{yearSwaps.length === 1 ? '' : 's'} ready for {selectedYear} when
              you initialize the board.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
