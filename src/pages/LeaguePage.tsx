import { useState, useEffect } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import { useLeague, useTeams, useInitializeDraftPicks, useDraftPicks } from '@/hooks/useLeague';
import { useLeaguePermissions } from '@/hooks/useLeaguePermissions';
import { useAuth } from '@/contexts/AuthContext';
import { DraftBoard } from '@/components/DraftBoard';
import { TeamManager } from '@/components/TeamManager';
import { LeagueSettings } from '@/components/LeagueSettings';
import { PickTrader } from '@/components/PickTrader';
import { AuthDialog } from '@/components/AuthDialog';
import { TeamAccessDialog } from '@/components/TeamAccessDialog';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, LayoutGrid, Users, Settings, ArrowLeftRight, Play, Shield, UserRound } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

const LEAGUE_TABS = ['draft', 'teams', 'trades', 'settings'] as const;
type LeagueTab = (typeof LEAGUE_TABS)[number];

function tabStorageKey(leagueId: string) {
  return `league-tab-${leagueId}`;
}

function readStoredTab(leagueId: string | undefined): LeagueTab | null {
  if (!leagueId) return null;
  const stored = localStorage.getItem(tabStorageKey(leagueId));
  return LEAGUE_TABS.includes(stored as LeagueTab) ? (stored as LeagueTab) : null;
}

export default function LeaguePage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: league, isLoading: leagueLoading } = useLeague(id);
  const { data: teams = [], isLoading: teamsLoading } = useTeams(id);
  const currentYear = new Date().getFullYear();
  const { data: picks = [] } = useDraftPicks(id, currentYear);
  const initializePicks = useInitializeDraftPicks();
  const tabFromUrl = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState<LeagueTab>(() => {
    if (LEAGUE_TABS.includes(tabFromUrl as LeagueTab)) return tabFromUrl as LeagueTab;
    return readStoredTab(id) ?? 'teams';
  });
  const { user } = useAuth();
  const {
    isAdmin,
    canInitializeDraft,
    accessedTeamId,
    teamAccess,
  } = useLeaguePermissions(league);

  const isLoading = leagueLoading || teamsLoading;

  useEffect(() => {
    const resolveTab = (tab: LeagueTab): LeagueTab =>
      tab === 'settings' && !isAdmin ? (picks.length > 0 ? 'draft' : 'teams') : tab;

    if (LEAGUE_TABS.includes(tabFromUrl as LeagueTab)) {
      setActiveTab(resolveTab(tabFromUrl as LeagueTab));
      return;
    }
    const stored = readStoredTab(id);
    if (stored) {
      setActiveTab(resolveTab(stored));
      return;
    }
    if (!isLoading) {
      setActiveTab(picks.length > 0 ? 'draft' : 'teams');
    }
  }, [id, isAdmin, isLoading, picks.length, tabFromUrl]);

  const handleTabChange = (value: string) => {
    const tab = value as LeagueTab;
    setActiveTab(tab);
    if (id) {
      localStorage.setItem(tabStorageKey(id), tab);
    }
    if (searchParams.has('tab')) {
      searchParams.delete('tab');
      setSearchParams(searchParams, { replace: true });
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container py-8 space-y-6">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-[400px] w-full" />
        </div>
      </div>
    );
  }

  if (!league) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <h1 className="text-2xl font-display">League Not Found</h1>
          <Link to="/">
            <Button>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Home
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const canInitialize = canInitializeDraft && teams.length >= 2 && picks.length === 0;
  const draftReady = picks.length > 0;
  const accessedTeam = accessedTeamId ? teams.find(t => t.id === accessedTeamId) : null;

  const handleInitializeDraft = async () => {
    const orderedTeams = [...teams].sort((a, b) => a.draft_position - b.draft_position);
    await initializePicks.mutateAsync({
      leagueId: league.id,
      teams: orderedTeams,
      numRounds: league.num_rounds,
      year: currentYear,
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border sticky top-0 z-40 bg-background/95 backdrop-blur">
        <div className="container py-4 space-y-3">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-4 min-w-0">
              <Link to="/">
                <Button variant="ghost" size="icon">
                  <ArrowLeft className="h-5 w-5" />
                </Button>
              </Link>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-2xl font-display truncate">{league.name}</h1>
                  {isAdmin && (
                    <Badge variant="secondary" className="gap-1">
                      <Shield className="h-3 w-3" />
                      Admin
                    </Badge>
                  )}
                  {teamAccess && !isAdmin && (
                    <Badge variant="outline">{teamAccess.teamName}</Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  {teams.length}/{league.num_teams} teams • {league.num_rounds} rounds
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {accessedTeamId && (
                <Link to={`/league/${league.id}/team/${accessedTeamId}`}>
                  <Button variant="secondary" size="sm">
                    <UserRound className="h-4 w-4 mr-2" />
                    My team
                  </Button>
                </Link>
              )}
              <TeamAccessDialog leagueId={league.id} />
              <AuthDialog />
              {canInitialize && (
                <Button
                  onClick={handleInitializeDraft}
                  disabled={initializePicks.isPending}
                  className="glow-primary"
                  title="Uses the draft order from the Teams tab"
                >
                  <Play className="h-4 w-4 mr-2" />
                  {initializePicks.isPending ? 'Initializing...' : 'Initialize Draft Picks'}
                </Button>
              )}
            </div>
          </div>

          {!isAdmin && !accessedTeam && (
            <p className="text-sm text-muted-foreground">
              {user
                ? 'You are signed in, but not an admin of this league. Enter a team access code to manage a team.'
                : 'Viewing as guest. Enter a team access code to edit your team, or sign in as a league admin.'}
            </p>
          )}
        </div>
      </header>

      <main className="container py-6">
        <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
          <TabsList className="bg-card border border-border">
            <TabsTrigger value="draft" className="gap-2">
              <LayoutGrid className="h-4 w-4" />
              Draft Board
            </TabsTrigger>
            <TabsTrigger value="teams" className="gap-2">
              <Users className="h-4 w-4" />
              Teams
            </TabsTrigger>
            <TabsTrigger value="trades" className="gap-2">
              <ArrowLeftRight className="h-4 w-4" />
              Trades
            </TabsTrigger>
            {isAdmin && (
              <TabsTrigger value="settings" className="gap-2">
                <Settings className="h-4 w-4" />
                Settings
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="draft">
            {!draftReady && !isAdmin ? (
              <div className="glass rounded-lg p-12 text-center">
                <LayoutGrid className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-xl font-semibold mb-2">Draft Not Initialized</h3>
                <p className="text-muted-foreground mb-6">
                  {teams.length < 2
                    ? `Add at least 2 teams to initialize the draft (currently ${teams.length})`
                    : 'Waiting for the league admin to initialize the draft'}
                </p>
              </div>
            ) : !draftReady && isAdmin && teams.length < 2 ? (
              <div className="glass rounded-lg p-12 text-center">
                <LayoutGrid className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-xl font-semibold mb-2">Draft Not Initialized</h3>
                <p className="text-muted-foreground mb-6">
                  Add at least 2 teams to initialize the draft or run a mock draft (currently {teams.length})
                </p>
                <Button onClick={() => handleTabChange('teams')}>
                  <Users className="h-4 w-4 mr-2" />
                  Add Teams
                </Button>
              </div>
            ) : (
              <DraftBoard league={league} teams={teams} />
            )}
          </TabsContent>

          <TabsContent value="teams">
            <TeamManager league={league} teams={teams} />
          </TabsContent>

          <TabsContent value="trades">
            <PickTrader league={league} teams={teams} />
          </TabsContent>

          {isAdmin && (
            <TabsContent value="settings">
              <LeagueSettings league={league} />
            </TabsContent>
          )}
        </Tabs>
      </main>
    </div>
  );
}
