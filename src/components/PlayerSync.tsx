import { RefreshCw, Database, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useSyncPlayers, usePlayerCount, useLastSync } from '@/hooks/usePlayers';
import { formatDistanceToNow } from 'date-fns';

export function PlayerSync() {
  const syncPlayers = useSyncPlayers();
  const { data: playerCount = 0 } = usePlayerCount();
  const { data: lastSync } = useLastSync();

  return (
    <Card className="glass">
      <CardContent className="flex flex-wrap items-center justify-between gap-4 p-6">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <Database className="h-5 w-5 text-primary" />
            <span className="font-semibold">{playerCount.toLocaleString()}</span>
            <span className="text-muted-foreground">players in database</span>
          </div>

          {lastSync && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Clock className="h-4 w-4" />
              <span>Last synced {formatDistanceToNow(lastSync, { addSuffix: true })}</span>
            </div>
          )}
        </div>

        <Button 
          onClick={() => syncPlayers.mutate()} 
          disabled={syncPlayers.isPending}
          variant="outline"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${syncPlayers.isPending ? 'animate-spin' : ''}`} />
          {syncPlayers.isPending ? 'Syncing...' : 'Sync from Sleeper'}
        </Button>
      </CardContent>
    </Card>
  );
}
