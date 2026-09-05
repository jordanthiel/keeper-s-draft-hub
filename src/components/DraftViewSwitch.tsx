import { Link } from 'react-router-dom';
import { LayoutGrid, Tv } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DraftViewSwitchProps {
  leagueId: string;
  current: 'show' | 'board';
  size?: 'sm' | 'lg';
}

export function DraftViewSwitch({ leagueId, current, size = 'sm' }: DraftViewSwitchProps) {
  const itemClass = size === 'lg' ? 'h-10 px-4 text-sm' : 'h-8 px-3 text-xs';

  return (
    <div
      className="inline-flex rounded-lg border border-border bg-muted/70 p-0.5"
      role="tablist"
      aria-label="Draft view"
    >
      <Link
        to={`/league/${leagueId}/draft`}
        role="tab"
        aria-selected={current === 'show'}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-md font-semibold transition-colors',
          itemClass,
          current === 'show'
            ? 'bg-primary text-primary-foreground shadow-sm'
            : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
        )}
      >
        <Tv className="h-4 w-4" />
        Show
      </Link>
      <Link
        to={`/league/${leagueId}/draft?view=board`}
        role="tab"
        aria-selected={current === 'board'}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-md font-semibold transition-colors',
          itemClass,
          current === 'board'
            ? 'bg-primary text-primary-foreground shadow-sm'
            : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
        )}
      >
        <LayoutGrid className="h-4 w-4" />
        Board
      </Link>
    </div>
  );
}
