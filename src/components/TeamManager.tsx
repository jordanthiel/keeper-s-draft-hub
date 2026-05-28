import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Team, League, Keeper } from '@/lib/types';
import { useCreateTeam, useDeleteTeam, useKeepers, useAddKeeper, useRemoveKeeper, useUpdateDraftOrderForYear, useUpdateTeamDraftPosition, useTeamDraftPositions, useLeagueSettings } from '@/hooks/useLeague';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PlayerSearch } from './PlayerSearch';
import { PositionBadge } from './PositionBadge';
import { Plus, Trash2, Star, Users, GripVertical } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Label } from '@/components/ui/label';
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
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface TeamManagerProps {
  league: League;
  teams: Team[];
  year: number;
}

interface SortableTeamItemProps {
  team: Team;
  league: League;
  onDelete: (teamId: string) => void;
}

function SortableTeamItem({ team, league, onDelete }: SortableTeamItemProps) {
  const deleteTeam = useDeleteTeam();
  const { data: keepers = [] } = useKeepers(team.id);
  const addKeeper = useAddKeeper();
  const removeKeeper = useRemoveKeeper();

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: team.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const keeperPlayerIds = keepers.map(k => k.player_id);

  const handleAddKeeper = async (player: any) => {
    await addKeeper.mutateAsync({
      team_id: team.id,
      player_id: player.id,
    });
  };

  const handleRemoveKeeper = async (keeperId: string) => {
    const keeper = keepers.find(k => k.id === keeperId);
    if (keeper) {
      await removeKeeper.mutateAsync({ id: keeper.id, teamId: team.id });
    }
  };

  const handleDelete = () => {
    onDelete(team.id);
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-4 p-4 border rounded-lg bg-card hover:bg-accent/50 transition-colors ${
        isDragging ? 'shadow-lg' : ''
      }`}
    >
      <div
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing touch-none flex-shrink-0"
      >
        <GripVertical className="h-5 w-5 text-muted-foreground" />
      </div>

      <Badge variant="outline" className="font-display text-lg px-3 py-1 flex-shrink-0">
        #{team.draft_position}
      </Badge>

      <div className="flex-1 min-w-0">
        <Link 
          to={`/league/${league.id}/team/${team.id}`}
          className="font-semibold text-lg truncate hover:text-primary transition-colors block"
        >
          {team.name}
        </Link>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="gap-2">
              <Star className="h-4 w-4 text-accent" />
              <span>{keepers.length} keeper{keepers.length !== 1 ? 's' : ''}</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80" align="end">
            <div className="space-y-4">
              <h4 className="font-semibold">Keepers</h4>
              
              <div className="space-y-2">
                <Label>Add Keeper</Label>
                <PlayerSearch
                  onSelect={handleAddKeeper}
                  excludePlayerIds={keeperPlayerIds}
                  placeholder="Search for keeper..."
                />
              </div>

              {keepers.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No keepers set
                </p>
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
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleRemoveKeeper(keeper.id)}
                        className="h-6 w-6 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </PopoverContent>
        </Popover>

        <Button
          variant="ghost"
          size="icon"
          onClick={handleDelete}
          className="text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export function TeamManager({ league, teams, year }: TeamManagerProps) {
  const [newTeamName, setNewTeamName] = useState('');
  const [showAddTeam, setShowAddTeam] = useState(false);
  const createTeam = useCreateTeam();
  const updateTeamDraftPosition = useUpdateTeamDraftPosition();
  const updateDraftOrderForYear = useUpdateDraftOrderForYear();
  const { data: yearPositions = new Map() } = useTeamDraftPositions(league.id, year);
  const { data: settings } = useLeagueSettings(league.id, year);
  
  // Use year-specific settings, fallback to league defaults
  const numTeams = settings?.num_teams ?? league.num_teams;
  
  // Create teams with year-specific positions for display
  const teamsWithYearPositions = useMemo(() => {
    return teams.map(team => ({
      ...team,
      draft_position: yearPositions.get(team.id) ?? team.draft_position,
    })).sort((a, b) => a.draft_position - b.draft_position);
  }, [teams, yearPositions]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

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

  const deleteTeam = useDeleteTeam();

  const handleDeleteTeam = (teamId: string) => {
    deleteTeam.mutate({ id: teamId, leagueId: league.id });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over || active.id === over.id) {
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Users className="h-6 w-6 text-primary" />
          <h2 className="text-2xl font-display">Teams ({teams.length}/{numTeams})</h2>
        </div>

        <Dialog open={showAddTeam} onOpenChange={setShowAddTeam}>
          <DialogTrigger asChild>
            <Button disabled={teams.length >= numTeams}>
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
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={teamsWithYearPositions.map(t => t.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-3">
              {teamsWithYearPositions.map(team => (
                <SortableTeamItem
                  key={team.id}
                  team={team}
                  league={league}
                  onDelete={handleDeleteTeam}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}