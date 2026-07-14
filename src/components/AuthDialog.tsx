import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { LogIn, LogOut, UserRound } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface AuthDialogProps {
  triggerLabel?: string;
  requireForAction?: boolean;
}

export function AuthDialog({ triggerLabel = 'Admin Login' }: AuthDialogProps) {
  const { user, signIn, signUp, signOut, loading } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (loading) return null;

  if (user) {
    return (
      <div className="flex items-center gap-2">
        <span className="hidden sm:inline text-sm text-muted-foreground truncate max-w-[180px]">
          {user.email}
        </span>
        <Button variant="outline" size="sm" onClick={() => signOut()}>
          <LogOut className="h-4 w-4 mr-2" />
          Sign out
        </Button>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (mode === 'signin') {
        await signIn(email, password);
        toast({ title: 'Signed in' });
      } else {
        await signUp(email, password);
        toast({
          title: 'Account created',
          description: 'You are signed in as a league admin when you create a league.',
        });
      }
      setOpen(false);
      setPassword('');
    } catch (err) {
      toast({
        title: mode === 'signin' ? 'Sign in failed' : 'Sign up failed',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <LogIn className="h-4 w-4 mr-2" />
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserRound className="h-5 w-5" />
            {mode === 'signin' ? 'Admin sign in' : 'Create admin account'}
          </DialogTitle>
          <DialogDescription>
            League admins must be signed in to manage settings, teams, and start the draft.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-2">
            <Label htmlFor="auth-email">Email</Label>
            <Input
              id="auth-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="auth-password">Password</Label>
            <Input
              id="auth-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            />
          </div>
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? 'Please wait...' : mode === 'signin' ? 'Sign in' : 'Create account'}
          </Button>
          <button
            type="button"
            className="w-full text-sm text-muted-foreground hover:text-foreground"
            onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
          >
            {mode === 'signin'
              ? 'Need an account? Sign up'
              : 'Already have an account? Sign in'}
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
