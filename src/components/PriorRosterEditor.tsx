import { Team, priorSeasonYear } from '@/lib/types';
import {
  useTeamRoster,
  useAddToRoster,
  useRemoveFromRoster,
} from '@/hooks/useLeague';
import { PlayerSearch } from '@/components/PlayerSearch';
import { PositionBadge } from '@/components/PositionBadge';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { ClipboardList, Trash2 } from 'lucide-react';

interface PriorRosterEditorProps {
  team: Team;
}

export function PriorRosterEditor({ team }: PriorRosterEditorProps) {
  const seasonYear = priorSeasonYear();
  const { data: roster = [], isLoading } = useTeamRoster(team.id, seasonYear);
  const addToRoster = useAddToRoster();
  const removeFromRoster = useRemoveFromRoster();

  const rosterPlayerIds = roster.map(r => r.player_id);

  return (
    <Card className="glass border-primary/30">
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2 text-lg font-display">
          <span className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-primary" />
            {seasonYear} roster
          </span>
          <Badge variant="outline">{roster.length} players</Badge>
        </CardTitle>
        <p className="text-sm text-muted-foreground font-normal">
          Admin only — set last year&apos;s ending roster. Managers can only keep players from this list.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Add player to roster</Label>
          <PlayerSearch
            onSelect={player =>
              addToRoster.mutate({ teamId: team.id, playerId: player.id, seasonYear })
            }
            excludePlayerIds={rosterPlayerIds}
            placeholder="Search players for last year's roster..."
            inline
          />
        </div>

        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : roster.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No roster yet. Add the players this team finished {seasonYear} with.
          </p>
        ) : (
          <ul className="space-y-2 max-h-72 overflow-auto">
            {roster.map(entry => (
              <li
                key={entry.id}
                className="flex items-center justify-between gap-3 p-2.5 rounded-lg border border-border bg-muted/20"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <PositionBadge position={entry.player?.position || null} />
                  <div className="min-w-0">
                    <p className="font-medium truncate">{entry.player?.full_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {entry.player?.team || 'FA'}
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                  disabled={removeFromRoster.isPending}
                  onClick={() =>
                    removeFromRoster.mutate({
                      id: entry.id,
                      teamId: team.id,
                      seasonYear,
                      playerId: entry.player_id,
                    })
                  }
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
