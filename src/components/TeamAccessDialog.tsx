import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTeamAccess } from '@/contexts/TeamAccessContext';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from '@/components/ui/input-otp';
import { KeyRound, X, UserRound } from 'lucide-react';
import { Link } from 'react-router-dom';

interface TeamAccessDialogProps {
  leagueId: string;
}

export function TeamAccessDialog({ leagueId }: TeamAccessDialogProps) {
  const navigate = useNavigate();
  const { getAccess, accessTeam, clearAccess } = useTeamAccess();
  const access = getAccess(leagueId);
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (access) {
    return (
      <div className="flex items-center gap-2">
        <Link to={`/league/${leagueId}/team/${access.teamId}`}>
          <Button variant="outline" size="sm">
            <UserRound className="h-4 w-4 mr-2" />
            {access.teamName}
          </Button>
        </Link>
        <Button variant="ghost" size="sm" onClick={() => clearAccess(leagueId)}>
          <X className="h-4 w-4 mr-1" />
          Leave
        </Button>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const team = await accessTeam(leagueId, code);
      if (team) {
        setOpen(false);
        setCode('');
        navigate(`/league/${leagueId}/team/${team.id}`);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm">
          <KeyRound className="h-4 w-4 mr-2" />
          Enter team code
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Access your team</DialogTitle>
          <DialogDescription>
            Enter the 6-digit code from your league admin to open your team page.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-6 mt-2">
          <div className="space-y-2">
            <Label>Access code</Label>
            <InputOTP maxLength={6} value={code} onChange={setCode}>
              <InputOTPGroup>
                <InputOTPSlot index={0} />
                <InputOTPSlot index={1} />
                <InputOTPSlot index={2} />
                <InputOTPSlot index={3} />
                <InputOTPSlot index={4} />
                <InputOTPSlot index={5} />
              </InputOTPGroup>
            </InputOTP>
          </div>
          <Button type="submit" className="w-full" disabled={code.length !== 6 || submitting}>
            {submitting ? 'Verifying...' : 'Go to my team'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
