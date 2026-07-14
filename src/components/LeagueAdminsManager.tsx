import { useState } from 'react';
import { League } from '@/lib/types';
import { useAuth } from '@/contexts/AuthContext';
import {
  useAddLeagueAdmin,
  useLeagueAdmins,
  useRemoveLeagueAdmin,
} from '@/hooks/useLeague';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Shield, UserPlus, Trash2 } from 'lucide-react';

interface LeagueAdminsManagerProps {
  league: League;
}

export function LeagueAdminsManager({ league }: LeagueAdminsManagerProps) {
  const { user } = useAuth();
  const { data: admins = [], isLoading } = useLeagueAdmins(league.id, true);
  const addAdmin = useAddLeagueAdmin();
  const removeAdmin = useRemoveLeagueAdmin();
  const [email, setEmail] = useState('');

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    await addAdmin.mutateAsync({ leagueId: league.id, email: email.trim() });
    setEmail('');
  };

  return (
    <Card className="glass">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" />
          League admins
        </CardTitle>
        <CardDescription>
          Admins can manage teams, settings, and the draft. Add someone by the email they use to sign in —
          they need an account first.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={handleAdd} className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 space-y-2">
            <Label htmlFor="admin-email">Admin email</Label>
            <Input
              id="admin-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="commissioner@example.com"
              autoComplete="off"
            />
          </div>
          <div className="flex items-end">
            <Button type="submit" disabled={addAdmin.isPending || !email.trim()}>
              <UserPlus className="h-4 w-4 mr-2" />
              {addAdmin.isPending ? 'Adding...' : 'Add admin'}
            </Button>
          </div>
        </form>

        <div className="space-y-2">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading admins…</p>
          ) : admins.length === 0 ? (
            <p className="text-sm text-muted-foreground">No admins listed yet.</p>
          ) : (
            admins.map((admin) => {
              const isYou = user?.id === admin.user_id;
              const canRemove = admins.length > 1;
              return (
                <div
                  key={admin.user_id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium truncate">{admin.email}</span>
                      {admin.is_primary && <Badge variant="secondary">Primary</Badge>}
                      {isYou && <Badge variant="outline">You</Badge>}
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={!canRemove || removeAdmin.isPending}
                    title={
                      canRemove
                        ? isYou
                          ? 'Leave as admin'
                          : 'Remove admin'
                        : 'Cannot remove the last admin'
                    }
                    onClick={() =>
                      removeAdmin.mutate({ leagueId: league.id, userId: admin.user_id })
                    }
                  >
                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </div>
              );
            })
          )}
        </div>
      </CardContent>
    </Card>
  );
}
