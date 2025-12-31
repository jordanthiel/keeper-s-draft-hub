import { cn } from '@/lib/utils';
import { Position, POSITION_COLORS } from '@/lib/types';

interface PositionBadgeProps {
  position: string | null;
  className?: string;
}

export function PositionBadge({ position, className }: PositionBadgeProps) {
  if (!position) return null;

  const colorClass = POSITION_COLORS[position as Position] || 'bg-muted text-muted-foreground';

  return (
    <span className={cn(
      "inline-flex items-center justify-center px-2 py-0.5 rounded text-xs font-bold uppercase",
      colorClass,
      className
    )}>
      {position}
    </span>
  );
}
