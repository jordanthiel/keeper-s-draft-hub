import { useState } from 'react';
import { User } from 'lucide-react';
import { Player, POSITION_COLORS, Position } from '@/lib/types';
import { playerHeadshotUrl } from '@/lib/playerImages';
import { cn } from '@/lib/utils';

interface PlayerHeadshotProps {
  player: Player;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const SIZE_CLASS = {
  sm: 'h-8 w-8 text-[10px]',
  md: 'h-11 w-11 text-xs',
  lg: 'h-16 w-16 text-sm',
  xl: 'h-28 w-28 text-xl',
};

export function PlayerHeadshot({ player, size = 'md', className }: PlayerHeadshotProps) {
  const [failed, setFailed] = useState(false);
  const src = playerHeadshotUrl(player, 'thumb');
  const posClass =
    player.position && POSITION_COLORS[player.position as Position]
      ? POSITION_COLORS[player.position as Position]
      : 'bg-muted text-muted-foreground';

  if (failed) {
    return (
      <div
        className={cn(
          'flex shrink-0 items-center justify-center overflow-hidden rounded-full font-bold',
          SIZE_CLASS[size],
          posClass,
          className
        )}
      >
        {player.position || <User className="h-1/2 w-1/2" />}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt=""
      onError={() => setFailed(true)}
      className={cn(
        'shrink-0 rounded-full object-cover object-top bg-secondary',
        SIZE_CLASS[size],
        className
      )}
    />
  );
}
