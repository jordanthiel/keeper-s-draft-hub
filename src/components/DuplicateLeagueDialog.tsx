import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { League } from '@/lib/types';
import { useDuplicateLeague } from '@/hooks/useLeague';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Copy } from 'lucide-react';

interface DuplicateLeagueDialogProps {
  league: League;
}

export function DuplicateLeagueDialog({ league }: DuplicateLeagueDialogProps) {
  const navigate = useNavigate();
  const duplicateLeague = useDuplicateLeague();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(`${league.name} (copy)`);

  const handleDuplicate = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;

    const created = await duplicateLeague.mutateAsync({
      sourceLeagueId: league.id,
      newName: trimmed,
    });
    setOpen(false);
    navigate(`/league/${created.id}`);
  };

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setName(`${league.name} (copy)`);
      }}
    >
      <AlertDialogTrigger asChild>
        <Button type="button" variant="outline" size="lg">
          <Copy className="h-4 w-4 mr-2" />
          Duplicate league
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Duplicate this league?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-sm text-muted-foreground">
              <p>
                Creates a full copy of{' '}
                <span className="font-medium text-foreground">{league.name}</span>, including teams,
                draft order, rosters, keepers, pick trades, and draft board state.
              </p>
              <p>
                Team access codes are regenerated for the copy. Mock drafts are not copied.
              </p>
              <div className="space-y-2 pt-1">
                <Label htmlFor="duplicate-league-name">New league name</Label>
                <Input
                  id="duplicate-league-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="off"
                  autoFocus
                />
              </div>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={duplicateLeague.isPending}>Cancel</AlertDialogCancel>
          <Button
            type="button"
            disabled={!name.trim() || duplicateLeague.isPending}
            onClick={handleDuplicate}
          >
            {duplicateLeague.isPending ? 'Duplicating...' : 'Duplicate'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
