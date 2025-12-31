import { useParams, Link } from 'react-router-dom';
import { useLeague, useTeams, useInitializeDraftPicks, useDraftPicks } from '@/hooks/useLeague';
import { DraftBoard } from '@/components/DraftBoard';
import { TeamManager } from '@/components/TeamManager';
import { LeagueSettings } from '@/components/LeagueSettings';
import { PickTrader } from '@/components/PickTrader';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, LayoutGrid, Users, Settings, ArrowLeftRight, Play } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

export default function LeaguePage() {
  const { id } = useParams<{ id: string }>();
  const { data: league, isLoading: leagueLoading } = useLeague(id);
  const { data: teams = [], isLoading: teamsLoading } = useTeams(id);
  const currentYear = new Date().getFullYear();
  const { data: picks = [] } = useDraftPicks(id, currentYear);
  const initializePicks = useInitializeDraftPicks();

  const isLoading = leagueLoading || teamsLoading;

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

  const canInitializeDraft = teams.length >= 2 && picks.length === 0;
  const draftReady = picks.length > 0;

  const handleInitializeDraft = async () => {
    await initializePicks.mutateAsync({
      leagueId: league.id,
      teams,
      numRounds: league.num_rounds,
      year: currentYear,
    });
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border sticky top-0 z-40 bg-background/95 backdrop-blur">
        <div className="container py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link to="/">
                <Button variant="ghost" size="icon">
                  <ArrowLeft className="h-5 w-5" />
                </Button>
              </Link>
              <div>
                <h1 className="text-2xl font-display">{league.name}</h1>
                <p className="text-sm text-muted-foreground">
                  {teams.length}/{league.num_teams} teams • {league.num_rounds} rounds
                </p>
              </div>
            </div>

            {canInitializeDraft && (
              <Button 
                onClick={handleInitializeDraft}
                disabled={initializePicks.isPending}
                className="glow-primary"
              >
                <Play className="h-4 w-4 mr-2" />
                {initializePicks.isPending ? 'Initializing...' : 'Initialize Draft Picks'}
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container py-6">
        <Tabs defaultValue={draftReady ? "draft" : "teams"} className="space-y-6">
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
            <TabsTrigger value="settings" className="gap-2">
              <Settings className="h-4 w-4" />
              Settings
            </TabsTrigger>
          </TabsList>

          <TabsContent value="draft">
            {!draftReady ? (
              <div className="glass rounded-lg p-12 text-center">
                <LayoutGrid className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-xl font-semibold mb-2">Draft Not Initialized</h3>
                <p className="text-muted-foreground mb-6">
                  {teams.length < 2 
                    ? `Add at least 2 teams to initialize the draft (currently ${teams.length})`
                    : 'Click "Initialize Draft Picks" to set up the draft board'}
                </p>
                {teams.length < 2 && (
                  <Button onClick={() => (document.querySelector('[value="teams"]') as HTMLElement)?.click()}>
                    <Users className="h-4 w-4 mr-2" />
                    Add Teams
                  </Button>
                )}
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

          <TabsContent value="settings">
            <LeagueSettings league={league} />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
