import { useState, useRef, useEffect } from 'react';
import { Search, User } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { usePlayers } from '@/hooks/usePlayers';
import { Player, POSITION_COLORS, Position } from '@/lib/types';
import { cn } from '@/lib/utils';

interface PlayerSearchProps {
  onSelect: (player: Player) => void;
  excludePlayerIds?: string[];
  placeholder?: string;
  autoFocus?: boolean;
  /** Render results in-flow (needed inside dialogs so the list isn't clipped). */
  inline?: boolean;
}

export function PlayerSearch({
  onSelect,
  excludePlayerIds = [],
  placeholder = 'Search players...',
  autoFocus = false,
  inline = false,
}: PlayerSearchProps) {
  const [search, setSearch] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const { data: players = [], isLoading, isError, error, isFetching } = usePlayers(search);

  const filteredPlayers = players.filter(p => !excludePlayerIds.includes(p.id));
  const showResults = isOpen && search.trim().length > 0;

  useEffect(() => {
    setSelectedIndex(0);
  }, [search]);

  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
    }
  }, [autoFocus]);

  useEffect(() => {
    if (inline) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [inline]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showResults || filteredPlayers.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev => Math.min(prev + 1, filteredPlayers.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => Math.max(prev - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (filteredPlayers[selectedIndex]) {
          handleSelect(filteredPlayers[selectedIndex]);
        }
        break;
      case 'Escape':
        setIsOpen(false);
        break;
    }
  };

  const handleSelect = (player: Player) => {
    onSelect(player);
    setSearch('');
    setIsOpen(false);
  };

  const results = (
    <div
      className={cn(
        'max-h-64 overflow-auto rounded-lg border border-border bg-card shadow-xl',
        !inline && 'absolute z-[60] w-full mt-1 animate-slide-in',
        inline && 'mt-2'
      )}
    >
      {isLoading || isFetching ? (
        <div className="p-4 text-center text-muted-foreground">Loading players...</div>
      ) : isError ? (
        <div className="p-4 text-center text-destructive text-sm">
          {error instanceof Error ? error.message : 'Failed to search players'}
        </div>
      ) : filteredPlayers.length === 0 ? (
        <div className="p-4 text-center text-muted-foreground">No players found</div>
      ) : (
        filteredPlayers.slice(0, 20).map((player, index) => (
          <button
            key={player.id}
            type="button"
            onMouseDown={e => e.preventDefault()}
            onClick={() => handleSelect(player)}
            className={cn(
              'w-full flex items-center gap-3 p-3 text-left transition-colors',
              index === selectedIndex ? 'bg-primary/20' : 'hover:bg-secondary'
            )}
          >
            <div
              className={cn(
                'flex items-center justify-center w-10 h-10 rounded-full text-xs font-bold shrink-0',
                player.position && POSITION_COLORS[player.position as Position]
                  ? POSITION_COLORS[player.position as Position]
                  : 'bg-muted text-muted-foreground'
              )}
            >
              {player.position || <User className="h-4 w-4" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold truncate">{player.full_name}</div>
              <div className="text-sm text-muted-foreground">
                {player.team || 'FA'} • {player.position}
              </div>
            </div>
          </button>
        ))
      )}
    </div>
  );

  return (
    <div
      ref={containerRef}
      className={cn('relative w-full', showResults && !inline && 'z-50')}
    >
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          ref={inputRef}
          value={search}
          onChange={e => {
            setSearch(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="pl-10 bg-secondary border-border focus:ring-primary"
          autoComplete="off"
        />
      </div>

      {showResults && results}
    </div>
  );
}
