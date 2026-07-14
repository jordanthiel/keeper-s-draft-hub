import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTeamAccess } from '@/contexts/TeamAccessContext';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from '@/components/ui/input-otp';
import { ArrowRight, KeyRound, X } from 'lucide-react';

export function HomeTeamCodeEntry() {
  const navigate = useNavigate();
  const { accessTeamByCode, sessions, clearAccess } = useTeamAccess();
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const session = await accessTeamByCode(code);
      if (session) {
        setCode('');
        navigate(`/league/${session.leagueId}/team/${session.teamId}`);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="glass rounded-lg p-6 md:p-8 space-y-6">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-display">Enter your team code</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          6-digit code from your league admin. Saved for next time.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6"
      >
        <div className="space-y-2">
          <Label className="sr-only">Team access code</Label>
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
        <Button
          type="submit"
          size="lg"
          disabled={code.length !== 6 || submitting}
          className="w-full sm:w-auto"
        >
          {submitting ? 'Checking...' : 'Go to my team'}
          <ArrowRight className="h-4 w-4 ml-2" />
        </Button>
      </form>

      {sessions.length > 0 && (
        <div className="space-y-3 border-t border-border pt-4">
          <p className="text-sm font-medium text-muted-foreground">Saved teams</p>
          <ul className="space-y-2">
            {sessions.map(session => (
              <li
                key={session.leagueId}
                className="flex items-center justify-between gap-3 rounded-md bg-muted/40 px-3 py-2"
              >
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left hover:text-primary transition-colors"
                  onClick={() =>
                    navigate(`/league/${session.leagueId}/team/${session.teamId}`)
                  }
                >
                  <span className="font-medium block truncate">{session.teamName}</span>
                  <span className="text-xs text-muted-foreground truncate block">
                    {session.leagueName || 'League'}
                  </span>
                </button>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      navigate(`/league/${session.leagueId}/team/${session.teamId}`)
                    }
                  >
                    Open
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    onClick={() => clearAccess(session.leagueId)}
                    aria-label={`Remove saved access for ${session.teamName}`}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
