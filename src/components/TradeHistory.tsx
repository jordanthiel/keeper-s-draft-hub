import { Team, PickTrade } from '@/lib/types';
import { useTrades, useCancelTrade } from '@/hooks/useLeague';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Trash2, XCircle } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

interface TradeHistoryProps {
  leagueId: string;
  teams: Team[];
}

interface GroupedTrade {
  traded_at: string;
  trade1Id: string;
  trade2Id: string;
  pick1Id: string | null;
  pick2Id: string | null;
  year: number | null;
  isCancelled: boolean;
  picks: Array<{
    from_team: Team;
    to_team: Team;
    round: number | null;
    year: number | null;
    original_team: Team | null;
  }>;
}

export function TradeHistory({ leagueId, teams }: TradeHistoryProps) {
  const { data: trades = [], isLoading } = useTrades(leagueId);
  const cancelTrade = useCancelTrade();

  // Group trades by traded_at timestamp (trades happen in pairs)
  const groupedTrades: GroupedTrade[] = [];
  if (trades && trades.length > 0) {
    const processedIds = new Set<string>();
    
    trades.forEach((trade: any) => {
      if (processedIds.has(trade.id)) return;
      
      // Find the matching trade (same traded_at, opposite teams)
      const matchingTrade = trades.find((t: any) => 
        t.id !== trade.id &&
        !processedIds.has(t.id) &&
        Math.abs(new Date(t.traded_at).getTime() - new Date(trade.traded_at).getTime()) < 1000 &&
        t.from_team_id === trade.to_team_id &&
        t.to_team_id === trade.from_team_id
      );

      const draftPick = trade.draft_pick;
      const fromTeam = trade.from_team || teams.find(t => t.id === trade.from_team_id);
      const toTeam = trade.to_team || teams.find(t => t.id === trade.to_team_id);
      // Use original_team from trade record (more reliable) or fall back to draft_pick
      const originalTeam = trade.original_team || draftPick?.original_team || (trade.original_team_id ? teams.find(t => t.id === trade.original_team_id) : null) || (draftPick?.original_team_id ? teams.find(t => t.id === draftPick.original_team_id) : null);
      // Use round and year from trade record (more reliable) or fall back to draft_pick
      const round = trade.round ?? draftPick?.round ?? null;
      const year = trade.year ?? draftPick?.year ?? null;

      // Process trades even if draftPick is null (cancelled trades)
      if (fromTeam && toTeam) {
        const isCancelled = !draftPick;
        const picks = [{
          from_team: fromTeam,
          to_team: toTeam,
          round: round,
          year: year,
          original_team: originalTeam,
        }];

        let trade1Id = trade.id;
        let trade2Id = '';
        let pick1Id = draftPick?.id ?? null;
        let pick2Id: string | null = null;

        if (matchingTrade) {
          const matchingDraftPick = matchingTrade.draft_pick;
          const matchingFromTeam = matchingTrade.from_team || teams.find(t => t.id === matchingTrade.from_team_id);
          const matchingToTeam = matchingTrade.to_team || teams.find(t => t.id === matchingTrade.to_team_id);
          const matchingOriginalTeam = matchingTrade.original_team || matchingDraftPick?.original_team || (matchingTrade.original_team_id ? teams.find(t => t.id === matchingTrade.original_team_id) : null) || (matchingDraftPick?.original_team_id ? teams.find(t => t.id === matchingDraftPick.original_team_id) : null);
          const matchingRound = matchingTrade.round ?? matchingDraftPick?.round ?? null;
          const matchingYear = matchingTrade.year ?? matchingDraftPick?.year ?? null;
          
          if (matchingFromTeam && matchingToTeam) {
            picks.push({
              from_team: matchingFromTeam,
              to_team: matchingToTeam,
              round: matchingRound,
              year: matchingYear,
              original_team: matchingOriginalTeam,
            });
            trade2Id = matchingTrade.id;
            pick2Id = matchingDraftPick?.id ?? null;
          }
          processedIds.add(matchingTrade.id);
        }

        // Only add if we have both trades (complete trade pair)
        if (trade2Id) {
          groupedTrades.push({
            traded_at: trade.traded_at,
            trade1Id,
            trade2Id,
            pick1Id,
            pick2Id,
            year,
            isCancelled: isCancelled || !pick1Id || !pick2Id,
            picks,
          });
        }
      }

      processedIds.add(trade.id);
    });
  }

  if (isLoading) {
    return (
      <Card className="glass">
        <CardHeader>
          <CardTitle>Trade History</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (groupedTrades.length === 0) {
    return (
      <Card className="glass">
        <CardHeader>
          <CardTitle>Trade History</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-center py-8">No trades have been made yet.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="glass">
      <CardHeader>
        <CardTitle>Trade History</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Team A</TableHead>
                <TableHead>Gives</TableHead>
                <TableHead className="text-center">↔</TableHead>
                <TableHead>Team B</TableHead>
                <TableHead>Gives</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {groupedTrades.map((trade, idx) => {
                const [pick1, pick2] = trade.picks;
                if (!pick1 || !pick2) return null;

                const handleCancel = () => {
                  if (!trade.pick1Id || !trade.pick2Id) return;
                  cancelTrade.mutate({
                    trade1Id: trade.trade1Id,
                    trade2Id: trade.trade2Id,
                    pick1Id: trade.pick1Id,
                    pick2Id: trade.pick2Id,
                    leagueId,
                    year: trade.year ?? new Date().getFullYear(),
                  });
                };

                return (
                  <TableRow key={idx} className={cn(trade.isCancelled && "opacity-60")}>
                    <TableCell className="whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        {format(new Date(trade.traded_at), 'MMM d, yyyy h:mm a')}
                        {trade.isCancelled && (
                          <Badge variant="outline" className="text-xs bg-muted text-muted-foreground border-muted-foreground/30">
                            <XCircle className="h-3 w-3 mr-1" />
                            Cancelled
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className={cn("font-medium", trade.isCancelled && "line-through")}>
                      {pick1.from_team.name}
                    </TableCell>
                    <TableCell>
                      {pick1.round && pick1.year ? (
                        <>
                          {pick1.year} Round {pick1.round}
                          {pick1.original_team && (
                            <span className="text-muted-foreground text-xs ml-1">
                              (Originally {pick1.original_team.name})
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-muted-foreground italic">Pick details unavailable</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">↔</TableCell>
                    <TableCell className={cn("font-medium", trade.isCancelled && "line-through")}>
                      {pick2.from_team.name}
                    </TableCell>
                    <TableCell>
                      {pick2.round && pick2.year ? (
                        <>
                          {pick2.year} Round {pick2.round}
                          {pick2.original_team && (
                            <span className="text-muted-foreground text-xs ml-1">
                              (Originally {pick2.original_team.name})
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-muted-foreground italic">Pick details unavailable</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {trade.isCancelled ? (
                        <span className="text-xs text-muted-foreground">Cancelled</span>
                      ) : (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0"
                              disabled={cancelTrade.isPending || !trade.pick1Id || !trade.pick2Id}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Cancel Trade?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will reverse the trade and return both picks to their original teams.
                                This action cannot be undone.
                                <br />
                                <br />
                                Are you sure you want to cancel this trade?
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>No, Keep Trade</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={handleCancel}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                disabled={cancelTrade.isPending}
                              >
                                {cancelTrade.isPending ? 'Cancelling...' : 'Yes, Cancel Trade'}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
