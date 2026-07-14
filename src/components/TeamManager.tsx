import { useState } from 'react';
import { Team, League } from '@/lib/types';
import {
  useCreateTeam,
  useDeleteTeam,
  useKeepers,
  useTeamAccessCodes,
  useSendKeeperRequests,
} from '@/hooks/useLeague';
import { useLeaguePermissions } from '@/hooks/useLeaguePermissions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PositionBadge } from './PositionBadge';
import { Plus, Trash2, Star, Users, Copy, Mail, Send, ExternalLink } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Link } from 'react-router-dom';

interface TeamManagerProps {
  league: League;
  teams: Team[];
}

function TeamCard({
  team,
  league,
  accessCode,
}: {
  team: Team;
  league: League;
  accessCode?: string;
}) {
  const deleteTeam = useDeleteTeam();
  const { data: keepers = [] } = useKeepers(team.id);
  const sendKeeperRequests = useSendKeeperRequests();
  const { canEditTeam, canAddOrDeleteTeams, isAdmin } = useLeaguePermissions(league);
  const { toast } = useToast();
  const canEdit = canEditTeam(team.id);

  const copyCode = async () => {
    if (!accessCode) return;
    await navigator.clipboard.writeText(accessCode);
    toast({ title: 'Access code copied' });
  };

  return (
    <Card className={`glass ${canEdit ? 'ring-1 ring-primary/40' : ''}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <Badge variant="outline" className="font-display text-lg px-3 py-1 shrink-0">
              #{team.draft_position}
            </Badge>
            <div className="min-w-0">
              <CardTitle className="text-xl truncate">{team.name}</CardTitle>
              {team.email && (
                <p className="text-xs text-muted-foreground flex items-center gap-1 truncate mt-1">
                  <Mail className="h-3 w-3 shrink-0" />
                  {team.email}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Link to={`/league/${league.id}/team/${team.id}`}>
              <Button variant="ghost" size="icon" title="Open team page">
                <ExternalLink className="h-4 w-4" />
              </Button>
            </Link>
            {canAddOrDeleteTeams && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => deleteTeam.mutate({ id: team.id, leagueId: league.id })}
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
        {isAdmin && accessCode && (
          <div className="flex items-center gap-2 mt-3 p-2 rounded-md bg-muted/50">
            <span className="text-xs text-muted-foreground">Code</span>
            <code className="font-mono text-sm tracking-widest flex-1">{accessCode}</code>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={copyCode}>
              <Copy className="h-3.5 w-3.5" />
            </Button>
            {team.email && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                title="Email keeper request"
                disabled={sendKeeperRequests.isPending}
                onClick={() =>
                  sendKeeperRequests.mutate({ leagueId: league.id, teamId: team.id })
                }
              >
                <Send className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
              <Star className="h-4 w-4 text-accent" />
              Keepers ({keepers.length}/{league.num_keepers})
            </div>
            {canEdit && (
              <Link to={`/league/${league.id}/team/${team.id}`}>
                <Button variant="outline" size="sm">
                  Manage keepers
                </Button>
              </Link>
            )}
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
                </div>
              ))}
            </div>
          )}

          {!canEdit && (
            <p className="text-xs text-muted-foreground mt-3">
              Enter this team&apos;s access code to manage keepers from last year&apos;s roster.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function TeamManager({ league, teams }: TeamManagerProps) {
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamEmail, setNewTeamEmail] = useState('');
  const [showAddTeam, setShowAddTeam] = useState(false);
  const [createdCode, setCreatedCode] = useState<{ name: string; email: string; code: string } | null>(null);
  const createTeam = useCreateTeam();
  const sendKeeperRequests = useSendKeeperRequests();
  const { canAddOrDeleteTeams, isAdmin } = useLeaguePermissions(league);
  const { data: codes = [] } = useTeamAccessCodes(league.id, isAdmin);
  const codeByTeamId = Object.fromEntries(codes.map(c => [c.team_id, c.access_code]));
  const teamsWithEmail = teams.filter(t => !!t.email?.trim()).length;

  const handleAddTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTeamName.trim() || !newTeamEmail.trim()) return;

    const nextPosition = teams.length > 0
      ? Math.max(...teams.map(t => t.draft_position)) + 1
      : 1;

    const created = await createTeam.mutateAsync({
      league_id: league.id,
      name: newTeamName.trim(),
      email: newTeamEmail.trim(),
      draft_position: nextPosition,
    });

    setCreatedCode({
      name: created.name,
      email: created.email ?? newTeamEmail.trim(),
      code: created.access_code!,
    });
    setNewTeamName('');
    setNewTeamEmail('');
    setShowAddTeam(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Users className="h-6 w-6 text-primary" />
          <h2 className="text-2xl font-display">Teams ({teams.length}/{league.num_teams})</h2>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {isAdmin && teams.length > 0 && (
            <Button
              variant="outline"
              disabled={teamsWithEmail === 0 || sendKeeperRequests.isPending}
              onClick={() => sendKeeperRequests.mutate({ leagueId: league.id })}
            >
              <Send className="h-4 w-4 mr-2" />
              {sendKeeperRequests.isPending
                ? 'Sending...'
                : `Request keepers${teamsWithEmail > 0 ? ` (${teamsWithEmail})` : ''}`}
            </Button>
          )}
          {canAddOrDeleteTeams ? (
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
                  <DialogDescription>
                    Enter the manager&apos;s email. A 6-digit access code will be generated for them.
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleAddTeam} className="space-y-4 mt-4">
                  <div className="space-y-2">
                    <Label>Team Name</Label>
                    <Input
                      value={newTeamName}
                      onChange={(e) => setNewTeamName(e.target.value)}
                      placeholder="Team name..."
                      autoFocus
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Manager Email</Label>
                    <Input
                      type="email"
                      value={newTeamEmail}
                      onChange={(e) => setNewTeamEmail(e.target.value)}
                      placeholder="manager@example.com"
                      required
                    />
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Draft Position: #{teams.length + 1}
                  </div>
                  <Button type="submit" className="w-full" disabled={createTeam.isPending}>
                    {createTeam.isPending ? 'Adding...' : 'Add Team'}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          ) : (
            <p className="text-sm text-muted-foreground">Only the league admin can add or remove teams.</p>
          )}
        </div>
      </div>

      {createdCode && (
        <Card className="glass border-primary/40 p-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <p className="font-semibold">{createdCode.name} created</p>
              <p className="text-sm text-muted-foreground">
                Share this code with {createdCode.email}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <code className="font-mono text-2xl tracking-[0.3em] text-primary">{createdCode.code}</code>
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  await navigator.clipboard.writeText(createdCode.code);
                }}
              >
                <Copy className="h-4 w-4 mr-1" />
                Copy
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setCreatedCode(null)}>
                Dismiss
              </Button>
            </div>
          </div>
        </Card>
      )}

      {teams.length === 0 ? (
        <Card className="glass p-8 text-center">
          <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">No Teams Yet</h3>
          <p className="text-muted-foreground mb-4">
            {canAddOrDeleteTeams
              ? 'Add teams with manager emails to generate access codes'
              : 'Ask the league admin to add teams'}
          </p>
          {canAddOrDeleteTeams && (
            <Button onClick={() => setShowAddTeam(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add First Team
            </Button>
          )}
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {teams.map(team => (
            <TeamCard
              key={team.id}
              team={team}
              league={league}
              accessCode={codeByTeamId[team.id]}
            />
          ))}
        </div>
      )}
    </div>
  );
}
