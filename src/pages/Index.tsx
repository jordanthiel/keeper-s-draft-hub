import { useLeagues } from '@/hooks/useLeague';
import { useAuth } from '@/contexts/AuthContext';
import { CreateLeagueDialog } from '@/components/CreateLeagueDialog';
import { LeagueCard } from '@/components/LeagueCard';
import { PlayerSync } from '@/components/PlayerSync';
import { AuthDialog } from '@/components/AuthDialog';
import { HomeTeamCodeEntry } from '@/components/HomeTeamCodeEntry';
import { Trophy } from 'lucide-react';

const Index = () => {
  const { user } = useAuth();
  const { data: leagues = [], isLoading } = useLeagues({ enabled: !!user });

  const adminLeagues = user
    ? leagues.filter(l => l.admin_user_id === user.id)
    : [];

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="container py-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Trophy className="h-8 w-8 text-primary" />
            <h1 className="text-2xl md:text-3xl font-display tracking-tight">
              DRAFT<span className="text-primary">BOARD</span>
            </h1>
          </div>
          <AuthDialog />
        </div>
      </header>

      <main className="container py-8 space-y-8 max-w-3xl">
        <HomeTeamCodeEntry />

        {user && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <h2 className="text-xl font-display">Your leagues</h2>
              <CreateLeagueDialog />
            </div>
            <PlayerSync />
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2].map(i => (
                  <div key={i} className="h-24 rounded-lg bg-card animate-pulse" />
                ))}
              </div>
            ) : adminLeagues.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No leagues yet. Create one to get started.
              </p>
            ) : (
              <div className="grid gap-4">
                {adminLeagues.map(league => (
                  <LeagueCard key={league.id} league={league} />
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
};

export default Index;
