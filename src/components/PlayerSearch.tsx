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
}

export function PlayerSearch({ 
  onSelect, 
  excludePlayerIds = [], 
  placeholder = "Search players...",
  autoFocus = false
}: PlayerSearchProps) {
  const [search, setSearch] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const { data: players = [], isLoading } = usePlayers(search);

  const filteredPlayers = players.filter(p => !excludePlayerIds.includes(p.id));

  useEffect(() => {
    setSelectedIndex(0);
  }, [search]);

  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
    }
  }, [autoFocus]);

  // Scroll selected item into view
  useEffect(() => {
    if (isOpen && itemRefs.current[selectedIndex] && listRef.current) {
      const selectedItem = itemRefs.current[selectedIndex];
      const list = listRef.current;
      const itemTop = selectedItem.offsetTop;
      const itemBottom = itemTop + selectedItem.offsetHeight;
      const listTop = list.scrollTop;
      const listBottom = listTop + list.clientHeight;

      if (itemTop < listTop) {
        list.scrollTop = itemTop;
      } else if (itemBottom > listBottom) {
        list.scrollTop = itemBottom - list.clientHeight;
      }
    }
  }, [selectedIndex, isOpen]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen || filteredPlayers.length === 0) return;

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

  const handleMouseEnter = (index: number) => {
    setSelectedIndex(index);
  };

  return (
    <div className="relative w-full z-30">
      <div className="relative z-30">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground z-30" />
        <Input
          ref={inputRef}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onBlur={(e) => {
            // Don't close if clicking inside the dropdown
            const relatedTarget = e.relatedTarget as HTMLElement;
            const currentTarget = e.currentTarget;
            
            // Use requestAnimationFrame to check after DOM updates
            requestAnimationFrame(() => {
              if (!listRef.current?.contains(document.activeElement) && 
                  !currentTarget.contains(document.activeElement)) {
                setIsOpen(false);
              }
            });
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="pl-10 bg-secondary border-border focus:ring-primary"
        />
      </div>

      {isOpen && search.length > 0 && (
        <div 
          ref={listRef}
          className="absolute z-30 w-full mt-1 max-h-96 overflow-y-auto rounded-lg border border-border bg-background shadow-2xl"
          style={{ scrollBehavior: 'smooth' }}
        >
          {isLoading ? (
            <div className="p-4 text-center text-muted-foreground">
              Loading players...
            </div>
          ) : filteredPlayers.length === 0 ? (
            <div className="p-4 text-center text-muted-foreground">
              No players found
            </div>
          ) : (
            filteredPlayers.slice(0, 50).map((player, index) => (
              <button
                key={player.id}
                ref={(el) => {
                  itemRefs.current[index] = el;
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  handleSelect(player);
                }}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  // Keep focus on input to prevent blur
                  inputRef.current?.focus();
                }}
                onMouseEnter={() => handleMouseEnter(index)}
                className={cn(
                  "w-full flex items-center gap-3 p-3 text-left transition-colors relative z-10",
                  index === selectedIndex 
                    ? "bg-primary text-primary-foreground" 
                    : "hover:bg-accent/50"
                )}
              >
                <div className={cn(
                  "flex items-center justify-center w-10 h-10 rounded-full text-xs font-bold shrink-0",
                  player.position && POSITION_COLORS[player.position as Position]
                    ? POSITION_COLORS[player.position as Position]
                    : "bg-muted text-muted-foreground"
                )}>
                  {player.position || <User className="h-4 w-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className={cn("font-semibold truncate", index === selectedIndex && "text-primary-foreground")}>{player.full_name}</div>
                  <div className={cn("text-sm", index === selectedIndex ? "text-primary-foreground/80" : "text-muted-foreground")}>
                    {player.team || 'FA'} • {player.position}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
