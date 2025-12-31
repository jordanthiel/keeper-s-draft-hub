import { useState } from 'react';
import { Team, League, Keeper } from '@/lib/types';
import { useCreateTeam, useDeleteTeam, useKeepers, useAddKeeper, useRemoveKeeper } from '@/hooks/useLeague';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PlayerSearch } from './PlayerSearch';
import { PositionBadge } from './PositionBadge';
import { Plus, Trash2, Star, Users } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';

interface TeamManagerProps {
  league: League;
  teams: Team[];
}

function TeamCard({ team, league }: { team: Team; league: League }) {
  const deleteTeam = useDeleteTeam();
  const { data: keepers = [] } = useKeepers(team.id);
  const addKeeper = useAddKeeper();
  const removeKeeper = useRemoveKeeper();
  const [keeperRound, setKeeperRound] = useState(1);
  const [showKeeperSearch, setShowKeeperSearch] = useState(false);

  const keeperPlayerIds = keepers.map(k => k.player_id);

  const handleAddKeeper = async (player: any) => {
    await addKeeper.mutateAsync({
      team_id: team.id,
      player_id: player.id,
      round_cost: keeperRound,
    });
    setShowKeeperSearch(false);
    setKeeperRound(1);
  };

  const handleRemoveKeeper = async (keeper: Keeper) => {
    await removeKeeper.mutateAsync({ id: keeper.id, teamId: team.id });
  };

  return (
    <Card className="glass">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="font-display text-lg px-3 py-1">
              #{team.draft_position}
            </Badge>
            <CardTitle className="text-xl">{team.name}</CardTitle>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => deleteTeam.mutate({ id: team.id, leagueId: league.id })}
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Keepers Section */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
              <Star className="h-4 w-4 text-accent" />
              Keepers
            </div>
            <Dialog open={showKeeperSearch} onOpenChange={setShowKeeperSearch}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <Plus className="h-3 w-3 mr-1" />
                  Add Keeper
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Keeper for {team.name}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 mt-4">
                  <div className="space-y-2">
                    <Label>Round Cost</Label>
                    <Input
                      type="number"
                      min={1}
                      max={league.num_rounds}
                      value={keeperRound}
                      onChange={(e) => setKeeperRound(parseInt(e.target.value))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Player</Label>
                    <PlayerSearch
                      onSelect={handleAddKeeper}
                      excludePlayerIds={keeperPlayerIds}
                      placeholder="Search for keeper..."
                    />
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {keepers.length === 0 ? (
            <p className="text-sm text-muted-foreground">No keepers set</p>
          ) : (
            <div className="space-y-2">
              {keepers.map(keeper => (
                <div 
                  key={keeper.id} 
                  className="flex items-center justify-between p-2 bg-accent/10 rounded-lg border border-accent/20"
                >
                  <div className="flex items-center gap-2">
                    <PositionBadge position={keeper.player?.position || null} />
                    <span className="font-medium">{keeper.player?.full_name}</span>
                    <span className="text-sm text-muted-foreground">
                      ({keeper.player?.team || 'FA'})
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">Rd {keeper.round_cost}</Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveKeeper(keeper)}
                      className="h-6 w-6 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function TeamManager({ league, teams }: TeamManagerProps) {
  const [newTeamName, setNewTeamName] = useState('');
  const [showAddTeam, setShowAddTeam] = useState(false);
  const createTeam = useCreateTeam();

  const handleAddTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTeamName.trim()) return;

    const nextPosition = teams.length > 0 
      ? Math.max(...teams.map(t => t.draft_position)) + 1 
      : 1;

    await createTeam.mutateAsync({
      league_id: league.id,
      name: newTeamName.trim(),
      draft_position: nextPosition,
    });

    setNewTeamName('');
    setShowAddTeam(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Users className="h-6 w-6 text-primary" />
          <h2 className="text-2xl font-display">Teams ({teams.length}/{league.num_teams})</h2>
        </div>

        <Dialog open={showAddTeam} onOpenChange={setShowAddTeam}>
          <DialogTrigger asChild>
            <Button disabled={teams.length >= league.num_teams}>
              <Plus className="h-4 w-4 mr-2" />
              Add Team
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Team</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleAddTeam} className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label>Team Name</Label>
                <Input
                  value={newTeamName}
                  onChange={(e) => setNewTeamName(e.target.value)}
                  placeholder="Team name..."
                  autoFocus
                />
              </div>
              <div className="text-sm text-muted-foreground">
                Draft Position: #{teams.length + 1}
              </div>
              <Button type="submit" className="w-full" disabled={createTeam.isPending}>
                Add Team
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {teams.length === 0 ? (
        <Card className="glass p-8 text-center">
          <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">No Teams Yet</h3>
          <p className="text-muted-foreground mb-4">Add teams to start setting up your draft</p>
          <Button onClick={() => setShowAddTeam(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add First Team
          </Button>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {teams.map(team => (
            <TeamCard key={team.id} team={team} league={league} />
          ))}
        </div>
      )}
    </div>
  );
}
