import { useEffect } from 'react';
import { Player, Team } from '@/lib/types';
import { nflTeamColor, nflTeamLogoUrl, ordinal, playerDisplayName } from '@/lib/playerImages';
import { PlayerHeadshot } from './PlayerHeadshot';
import { PositionBadge } from './PositionBadge';

export interface DraftRevealPayload {
  player: Player;
  teamName: string;
  team?: Team | null;
  round: number;
  pickNumber: number | null;
  year: number;
}

interface DraftPickRevealProps {
  reveal: DraftRevealPayload;
  onDismiss: () => void;
}

export function DraftPickReveal({ reveal, onDismiss }: DraftPickRevealProps) {
  const { player, teamName, round, pickNumber, year } = reveal;
  const teamColor = nflTeamColor(player.team);
  const lastName = playerDisplayName(player);
  const firstName = player.first_name || player.full_name.replace(lastName, '').trim();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' || event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        onDismiss();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onDismiss]);

  return (
    <button
      type="button"
      onClick={onDismiss}
      className="absolute inset-0 z-[80] flex cursor-pointer flex-col items-center justify-center overflow-hidden text-left"
      aria-label="Dismiss pick announcement"
    >
      <div className="absolute inset-0 animate-draft-overlay bg-background/92 backdrop-blur-xl" />
      <div
        className="absolute inset-0 animate-draft-overlay opacity-40"
        style={{
          background: `radial-gradient(ellipse at 50% 40%, ${teamColor} 0%, transparent 62%)`,
        }}
      />
      <div className="pointer-events-none absolute inset-x-0 top-1/3 h-px animate-draft-sweep bg-gradient-to-r from-transparent via-accent to-transparent" />

      <div className="relative z-10 flex w-full max-w-5xl flex-col items-center px-6 text-center">
        <p className="animate-draft-kicker font-display text-2xl tracking-[0.35em] text-accent sm:text-4xl">
          THE PICK IS IN
        </p>
        {pickNumber != null && (
          <p className="animate-draft-sub mt-2 text-sm uppercase tracking-[0.2em] text-muted-foreground sm:text-base">
            With the {ordinal(pickNumber)} pick in the {year} draft
          </p>
        )}

        <div className="animate-draft-photo relative mt-8">
          <div
            className="absolute -inset-6 rounded-full blur-2xl"
            style={{ background: teamColor, opacity: 0.45 }}
          />
          <RevealPortrait player={player} teamColor={teamColor} />
        </div>

        <div className="animate-draft-name mt-6 space-y-1">
          {firstName && (
            <div className="text-lg font-semibold uppercase tracking-[0.25em] text-muted-foreground sm:text-2xl">
              {firstName}
            </div>
          )}
          <h2 className="font-display text-6xl leading-none text-foreground sm:text-8xl md:text-9xl">
            {lastName}
          </h2>
        </div>

        <div className="animate-draft-meta mt-4 flex flex-wrap items-center justify-center gap-3">
          <PositionBadge position={player.position} className="px-3 py-1 text-sm sm:text-base" />
          {player.team && (
            <span className="inline-flex items-center gap-2 rounded-full bg-secondary px-3 py-1 text-sm font-semibold sm:text-base">
              <img
                src={nflTeamLogoUrl(player.team)}
                alt=""
                className="h-5 w-5 object-contain"
              />
              {player.team}
            </span>
          )}
          {pickNumber != null && (
            <span className="text-sm text-muted-foreground sm:text-base">
              Round {round} · Pick {pickNumber}
            </span>
          )}
        </div>

        <p className="animate-draft-team mt-6 text-xs uppercase tracking-[0.3em] text-muted-foreground">
          Selected by
        </p>
        <p className="animate-draft-team font-display text-3xl text-primary sm:text-5xl">
          {teamName}
        </p>
      </div>
    </button>
  );
}

function RevealPortrait({ player, teamColor }: { player: Player; teamColor: string }) {
  return (
    <div
      className="relative overflow-hidden rounded-full border-4 bg-card shadow-[0_0_80px_rgba(0,0,0,0.45)]"
      style={{ borderColor: teamColor }}
    >
      <PlayerHeadshot
        player={player}
        size="md"
        className="h-48 w-48 sm:h-64 sm:w-64"
      />
    </div>
  );
}
