import { League } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Users, Clock, Layers } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

interface LeagueCardProps {
  league: League;
}

const statusColors = {
  not_started: 'bg-muted text-muted-foreground',
  in_progress: 'bg-primary text-primary-foreground animate-pulse',
  completed: 'bg-accent text-accent-foreground',
};

const statusLabels = {
  not_started: 'Not Started',
  in_progress: 'In Progress',
  completed: 'Completed',
};

export function LeagueCard({ league }: LeagueCardProps) {
  return (
    <Link to={`/league/${league.id}`}>
      <Card className="glass hover:border-primary/50 transition-all duration-300 hover:scale-[1.02] cursor-pointer group">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between">
            <CardTitle className="text-xl font-display group-hover:text-primary transition-colors">
              {league.name}
            </CardTitle>
            <Badge className={cn(statusColors[league.draft_status])}>
              {statusLabels[league.draft_status]}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-6 text-muted-foreground">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              <span>{league.num_teams} Teams</span>
            </div>
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4" />
              <span>{league.num_rounds} Rounds</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              <span>{league.draft_time_seconds}s</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
