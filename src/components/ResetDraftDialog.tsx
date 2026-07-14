import { useState } from 'react';
import { League } from '@/lib/types';
import { useResetDraftBoard } from '@/hooks/useLeague';
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
import { RotateCcw } from 'lucide-react';

const CONFIRM_PHRASE = 'RESET';

interface ResetDraftDialogProps {
  league: League;
  year: number;
  triggerVariant?: 'destructive' | 'outline';
  triggerLabel?: string;
}

export function ResetDraftDialog({
  league,
  year,
  triggerVariant = 'destructive',
  triggerLabel = 'Reset Draft Board',
}: ResetDraftDialogProps) {
  const resetDraft = useResetDraftBoard();
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  const canConfirm = confirmText.trim().toUpperCase() === CONFIRM_PHRASE;

  const handleReset = async () => {
    if (!canConfirm) return;
    await resetDraft.mutateAsync({ leagueId: league.id, year });
    setConfirmText('');
    setOpen(false);
  };

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setConfirmText('');
      }}
    >
      <AlertDialogTrigger asChild>
        <Button type="button" variant={triggerVariant} size="lg">
          <RotateCcw className="h-4 w-4 mr-2" />
          {triggerLabel}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Reset the draft board?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-sm text-muted-foreground">
              <p>
                This clears every player selection for <span className="font-medium text-foreground">{league.name}</span> ({year})
                and sets the draft back to not started.
              </p>
              <p>
                Pick trades/ownership and keepers stay in place. This cannot be undone.
              </p>
              <div className="space-y-2 pt-1">
                <Label htmlFor="reset-confirm">
                  Type <span className="font-mono font-semibold text-foreground">{CONFIRM_PHRASE}</span> to confirm
                </Label>
                <Input
                  id="reset-confirm"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder={CONFIRM_PHRASE}
                  autoComplete="off"
                  autoFocus
                />
              </div>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={resetDraft.isPending}>Cancel</AlertDialogCancel>
          <Button
            type="button"
            variant="destructive"
            disabled={!canConfirm || resetDraft.isPending}
            onClick={handleReset}
          >
            {resetDraft.isPending ? 'Resetting...' : 'Reset board'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
