import { useLeagues } from '@/hooks/useLeague';
import { CreateLeagueDialog } from '@/components/CreateLeagueDialog';
import { LeagueCard } from '@/components/LeagueCard';
import { PlayerSync } from '@/components/PlayerSync';
import { Trophy, Zap } from 'lucide-react';

const Index = () => {
  const { data: leagues = [], isLoading } = useLeagues();

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <header className="relative overflow-hidden border-b border-border">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-accent/10" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,hsl(var(--primary)/0.15),transparent_50%)]" />
        
        <div className="container relative py-16 md:py-24">
          <div className="flex flex-col items-center text-center space-y-6">
            <div className="flex items-center gap-3">
              <Trophy className="h-12 w-12 md:h-16 md:w-16 text-primary" />
              <h1 className="text-5xl md:text-7xl font-display tracking-tight">
                DRAFT<span className="text-primary">BOARD</span>
              </h1>
            </div>
            <p className="text-xl text-muted-foreground max-w-2xl">
              The ultimate fantasy football draft experience for you and your league. 
              Keeper support, pick trading, and a snake draft that just works.
            </p>
            <CreateLeagueDialog />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container py-8 space-y-8">
        {/* Player Sync */}
        <PlayerSync />

        {/* Features */}
        <div className="grid gap-4 md:grid-cols-3">
          <div className="glass rounded-lg p-6 space-y-2">
            <Zap className="h-8 w-8 text-primary" />
            <h3 className="font-display text-xl">KEEPER SUPPORT</h3>
            <p className="text-sm text-muted-foreground">
              Mark players as keepers with customizable round costs
            </p>
          </div>
          <div className="glass rounded-lg p-6 space-y-2">
            <Zap className="h-8 w-8 text-accent" />
            <h3 className="font-display text-xl">PICK TRADING</h3>
            <p className="text-sm text-muted-foreground">
              Trade draft picks before or during the draft, even for future years
            </p>
          </div>
          <div className="glass rounded-lg p-6 space-y-2">
            <Zap className="h-8 w-8 text-position-wr" />
            <h3 className="font-display text-xl">SLEEPER SYNC</h3>
            <p className="text-sm text-muted-foreground">
              Player database synced directly from Sleeper's API
            </p>
          </div>
        </div>

        {/* Leagues */}
        <div className="space-y-4">
          <h2 className="text-2xl font-display">YOUR LEAGUES</h2>
          
          {isLoading ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-32 rounded-lg bg-card animate-pulse" />
              ))}
            </div>
          ) : leagues.length === 0 ? (
            <div className="glass rounded-lg p-12 text-center">
              <Trophy className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-xl font-semibold mb-2">No Leagues Yet</h3>
              <p className="text-muted-foreground mb-6">
                Create your first league to get started
              </p>
              <CreateLeagueDialog />
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {leagues.map(league => (
                <LeagueCard key={league.id} league={league} />
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border mt-16">
        <div className="container py-8 text-center text-sm text-muted-foreground">
          <p>Built for friends who take fantasy football way too seriously.</p>
        </div>
      </footer>
    </div>
  );
};

export default Index;
