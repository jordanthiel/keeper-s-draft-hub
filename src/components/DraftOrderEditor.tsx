import { useEffect, useRef, useState, type DragEvent } from 'react';
import { League, Team } from '@/lib/types';
import { useSetDraftOrder } from '@/hooks/useLeague';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { GripVertical, ListOrdered, Shuffle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DraftOrderEditorProps {
  league: League;
  teams: Team[];
  className?: string;
}

function sameOrder(a: Team[], b: Team[]) {
  if (a.length !== b.length) return false;
  return a.every((team, i) => team.id === b[i]?.id);
}

function shuffleTeams(teams: Team[]) {
  const next = [...teams];
  for (let i = next.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

function sortByPosition(teams: Team[]) {
  return [...teams].sort((a, b) => a.draft_position - b.draft_position);
}

function orderKey(teams: Team[]) {
  return teams
    .map((t) => `${t.id}:${t.draft_position}`)
    .sort()
    .join('|');
}

function reorderList(list: Team[], fromIndex: number, toIndex: number) {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return list;
  const next = [...list];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

export function DraftOrderEditor({ league, teams, className }: DraftOrderEditorProps) {
  const setDraftOrder = useSetDraftOrder();
  const sortedTeams = sortByPosition(teams);
  const [ordered, setOrdered] = useState<Team[]>(sortedTeams);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const dragIdRef = useRef<string | null>(null);
  const teamsKey = orderKey(teams);

  useEffect(() => {
    setOrdered(sortByPosition(teams));
    setDraggingId(null);
    setOverId(null);
    dragIdRef.current = null;
    // teamsKey captures id+position changes without depending on array identity
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamsKey]);

  const dirty = !sameOrder(ordered, sortedTeams);

  const handleSave = async () => {
    await setDraftOrder.mutateAsync({
      leagueId: league.id,
      teamIds: ordered.map((t) => t.id),
    });
  };

  const handleReset = () => {
    setOrdered(sortedTeams);
  };

  const onDragStart = (teamId: string, event: DragEvent) => {
    dragIdRef.current = teamId;
    setDraggingId(teamId);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', teamId);
    // Improve drag image clarity in some browsers
    if (event.currentTarget instanceof HTMLElement) {
      event.dataTransfer.setDragImage(event.currentTarget, 24, 24);
    }
  };

  const onDragOver = (teamId: string, event: DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    if (overId !== teamId) setOverId(teamId);
  };

  const onDrop = (targetId: string, event: DragEvent) => {
    event.preventDefault();
    const sourceId = dragIdRef.current || event.dataTransfer.getData('text/plain');
    if (!sourceId || sourceId === targetId) {
      setDraggingId(null);
      setOverId(null);
      dragIdRef.current = null;
      return;
    }

    setOrdered((prev) => {
      const fromIndex = prev.findIndex((t) => t.id === sourceId);
      const toIndex = prev.findIndex((t) => t.id === targetId);
      return reorderList(prev, fromIndex, toIndex);
    });
    setDraggingId(null);
    setOverId(null);
    dragIdRef.current = null;
  };

  const onDragEnd = () => {
    setDraggingId(null);
    setOverId(null);
    dragIdRef.current = null;
  };

  if (teams.length < 2) {
    return null;
  }

  return (
    <Card className={cn('glass text-left', className)}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ListOrdered className="h-5 w-5 text-primary" />
          Draft order
        </CardTitle>
        <CardDescription>
          Drag teams to set the 1st-round order, then save. Even rounds reverse (snake).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setOrdered((prev) => shuffleTeams(prev))}
          >
            <Shuffle className="h-4 w-4 mr-2" />
            Randomize
          </Button>
          {dirty && (
            <>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleReset}
                disabled={setDraftOrder.isPending}
              >
                Discard
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleSave}
                disabled={setDraftOrder.isPending}
              >
                {setDraftOrder.isPending ? 'Saving...' : 'Save order'}
              </Button>
            </>
          )}
        </div>

        <ol className="space-y-2" onDragLeave={() => setOverId(null)}>
          {ordered.map((team, index) => {
            const isDragging = draggingId === team.id;
            const isOver = overId === team.id && draggingId !== team.id;

            return (
              <li
                key={team.id}
                draggable
                onDragStart={(e) => onDragStart(team.id, e)}
                onDragOver={(e) => onDragOver(team.id, e)}
                onDrop={(e) => onDrop(team.id, e)}
                onDragEnd={onDragEnd}
                className={cn(
                  'flex items-center gap-3 rounded-lg border border-border bg-background/40 px-3 py-2 cursor-grab active:cursor-grabbing select-none transition-colors',
                  isDragging && 'opacity-40',
                  isOver && 'border-primary bg-primary/10',
                  dirty &&
                    team.id !== sortedTeams[index]?.id &&
                    !isOver &&
                    'border-primary/40 bg-primary/5'
                )}
              >
                <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden />
                <Badge variant="outline" className="font-display text-base px-2.5 shrink-0">
                  #{index + 1}
                </Badge>
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">{team.name}</p>
                  {team.email && (
                    <p className="text-xs text-muted-foreground truncate">{team.email}</p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}
