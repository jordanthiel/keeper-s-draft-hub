import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  useDraftPicks,
  useMakePick,
  useUpdateLeague,
  useAllKeepers,
  useMockDraftPicks,
  useInitializeMockDraft,
  useMakeMockPick,
  useClearMockDraft,
  useInitializeDraftPicks,
  usePickSwaps,
  useAdminEditPick,
  buildSlotOwnershipMap,
} from '@/hooks/useLeague';
import { useLeaguePermissions } from '@/hooks/useLeaguePermissions';
import { useTeamAccess } from '@/contexts/TeamAccessContext';
import { League, Team, Player, DraftPick } from '@/lib/types';
import { PlayerSearch } from './PlayerSearch';
import { ErrorModal } from './ErrorModal';
import { PositionBadge } from './PositionBadge';
import { ResetDraftDialog } from './ResetDraftDialog';
import { DraftOrderEditor } from './DraftOrderEditor';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Play, Pause, RotateCcw, Clock, Star, Columns3, FlaskConical, EyeOff, ArrowLeftRight, Bot, Flag, Square, Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { DraftViewSwitch } from '@/components/DraftViewSwitch';
import { loadClock, saveClock, clearClock } from '@/lib/draftClock';

interface DraftBoardProps {
  league: League;
  teams: Team[];
  /** Fill the parent viewport (used in the full-screen draft shell). */
  fill?: boolean;
  hideViewSwitch?: boolean;
}

type DraftStatus = League['draft_status'];

const ROUND_COL_WIDTH = 80;
const DEFAULT_COL_WIDTH = 140;
const MIN_COL_WIDTH = 80;
const MAX_COL_WIDTH = 320;
const COL_GAP = 4; // gap-1
const AUTO_DRAFT_DELAY_MS = 450;

function normalizePosition(position: string | null | undefined): string | null {
  if (!position) return null;
  const normalized = position.trim().toUpperCase();
  if (normalized === 'D/ST' || normalized === 'DST') return 'DEF';
  if (normalized === 'PK') return 'K';
  return normalized;
}

function colWidthsStorageKey(leagueId: string) {
  return `draft-col-widths-${leagueId}`;
}

function clampColWidth(width: number) {
  return Math.min(MAX_COL_WIDTH, Math.max(MIN_COL_WIDTH, Math.round(width)));
}

function loadColumnWidths(leagueId: string, teams: Team[]): Record<string, number> {
  try {
    const raw = localStorage.getItem(colWidthsStorageKey(leagueId));
    const saved = raw ? (JSON.parse(raw) as Record<string, number>) : {};
    return Object.fromEntries(
      teams.map(team => [team.id, clampColWidth(saved[team.id] ?? DEFAULT_COL_WIDTH)])
    );
  } catch {
    return Object.fromEntries(teams.map(team => [team.id, DEFAULT_COL_WIDTH]));
  }
}

export function DraftBoard({ league, teams, fill = false, hideViewSwitch = false }: DraftBoardProps) {
  const currentYear = new Date().getFullYear();
  const { isAdmin, canStartDraft, canInitializeDraft, accessedTeamId } = useLeaguePermissions(league);
  const { getAccessCode } = useTeamAccess();

  const [mockMode, setMockMode] = useState(false);
  const [mockDraftStatus, setMockDraftStatus] = useState<DraftStatus>('not_started');

  const { data: livePicks = [], refetch: refetchLive } = useDraftPicks(league.id, currentYear);
  const { data: mockPicks = [], refetch: refetchMock } = useMockDraftPicks(
    league.id,
    currentYear,
    {
      enabled: isAdmin && mockMode,
    }
  );
  const { data: keepers = [] } = useAllKeepers(league.id);
  const { data: pickSwaps = [] } = usePickSwaps(league.id, currentYear);
  const makePick = useMakePick();
  const editPick = useAdminEditPick();
  const makeMockPick = useMakeMockPick();
  const updateLeague = useUpdateLeague();
  const initializeMock = useInitializeMockDraft();
  const initializePicks = useInitializeDraftPicks();
  const clearMock = useClearMockDraft();

  const picks = mockMode ? mockPicks : livePicks;
  const draftStatus = mockMode ? mockDraftStatus : league.draft_status;
  const refetch = mockMode ? refetchMock : refetchLive;
  const mockBoardReady = !mockMode || mockPicks.length > 0;

  const [timeLeft, setTimeLeft] = useState(league.draft_time_seconds);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const endsAtRef = useRef<number | null>(null);
  const trackedPickIdRef = useRef<string | null>(null);
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(() =>
    loadColumnWidths(league.id, teams)
  );
  const [errorModal, setErrorModal] = useState<{ open: boolean; title: string; message: string }>({
    open: false,
    title: '',
    message: '',
  });
  const [autoDraftRunning, setAutoDraftRunning] = useState(false);
  const autoDraftRef = useRef(false);
  const [editingPick, setEditingPick] = useState<DraftPick | null>(null);
  const [adminOverride, setAdminOverride] = useState<{
    pickId: string;
    player: Player;
    title: string;
    message: string;
    source: 'on_clock' | 'edit_pick';
  } | null>(null);

  const teamIdsKey = teams.map(t => t.id).join(',');

  // Persist and reconcile column widths per league / roster
  useEffect(() => {
    setColumnWidths(prev => {
      const saved = loadColumnWidths(league.id, teams);
      const next: Record<string, number> = {};
      for (const team of teams) {
        next[team.id] = prev[team.id] ?? saved[team.id] ?? DEFAULT_COL_WIDTH;
      }
      const unchanged =
        Object.keys(prev).length === teams.length &&
        teams.every(team => prev[team.id] === next[team.id]);
      return unchanged ? prev : next;
    });
  }, [league.id, teamIdsKey, teams]);

  useEffect(() => {
    if (Object.keys(columnWidths).length === 0) return;
    localStorage.setItem(colWidthsStorageKey(league.id), JSON.stringify(columnWidths));
  }, [league.id, columnWidths]);

  const setAllColumnWidths = useCallback((width: number) => {
    const clamped = clampColWidth(width);
    setColumnWidths(Object.fromEntries(teams.map(team => [team.id, clamped])));
  }, [teams]);

  const startColumnResize = useCallback((teamId: string, startX: number) => {
    const startWidth = columnWidths[teamId] ?? DEFAULT_COL_WIDTH;

    const onMove = (event: MouseEvent) => {
      const nextWidth = clampColWidth(startWidth + (event.clientX - startX));
      setColumnWidths(prev => ({ ...prev, [teamId]: nextWidth }));
    };

    const onUp = () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [columnWidths]);

  // Get current pick info
  const currentPick = picks.find(p => !p.player_id && !p.is_keeper);
  const draftedPlayerIds = picks.filter(p => p.player_id).map(p => p.player_id!);
  // Keepers stay searchable so selecting one surfaces the duplicate/keeper modal.
  const keeperPlayerIds = keepers.map(k => k.player_id).filter(Boolean);
  // Finalized drafts can still accept picks if anything remains
  const draftInteractive =
    draftStatus === 'in_progress' || (draftStatus === 'completed' && !!currentPick);
  const showTimer = draftStatus === 'in_progress' && !!currentPick;

  // Live board only — mock drafts use optimistic cache updates (realtime refetch was slow in prod)
  useEffect(() => {
    if (mockMode) return;

    const channel = supabase
      .channel(`draft_picks-${league.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'draft_picks',
          filter: `league_id=eq.${league.id}`,
        },
        () => {
          refetch();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [league.id, mockMode, refetch]);

  // Restore or start the clock when the current pick changes (survives refresh)
  useEffect(() => {
    if (draftStatus !== 'in_progress' || !currentPick) {
      trackedPickIdRef.current = null;
      endsAtRef.current = null;
      setIsTimerRunning(false);
      return;
    }

    if (trackedPickIdRef.current === currentPick.id) {
      return;
    }
    trackedPickIdRef.current = currentPick.id;

    const saved = loadClock(league.id, mockMode);
    if (saved?.pickId === currentPick.id) {
      if (saved.isRunning && saved.endsAt) {
        const remaining = Math.max(0, Math.ceil((saved.endsAt - Date.now()) / 1000));
        endsAtRef.current = remaining > 0 ? saved.endsAt : null;
        setTimeLeft(remaining);
        setIsTimerRunning(remaining > 0);
        if (remaining <= 0) {
          saveClock(league.id, {
            pickId: currentPick.id,
            endsAt: null,
            remainingSeconds: 0,
            isRunning: false,
          }, mockMode);
        }
      } else {
        endsAtRef.current = null;
        setTimeLeft(Math.max(0, saved.remainingSeconds));
        setIsTimerRunning(false);
      }
      return;
    }

    const endsAt = Date.now() + league.draft_time_seconds * 1000;
    endsAtRef.current = endsAt;
    setTimeLeft(league.draft_time_seconds);
    setIsTimerRunning(true);
    saveClock(league.id, {
      pickId: currentPick.id,
      endsAt,
      remainingSeconds: league.draft_time_seconds,
      isRunning: true,
    }, mockMode);
  }, [currentPick?.id, draftStatus, league.draft_time_seconds, league.id, mockMode]);

  // Tick from absolute deadline so refresh doesn't lose elapsed time
  useEffect(() => {
    if (!isTimerRunning || draftStatus !== 'in_progress' || !currentPick) return;

    const interval = setInterval(() => {
      const endsAt = endsAtRef.current;
      if (!endsAt) return;

      const remaining = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
      setTimeLeft(remaining);

      if (remaining <= 0) {
        setIsTimerRunning(false);
        endsAtRef.current = null;
        setTimeLeft(0);
        saveClock(league.id, {
          pickId: currentPick.id,
          endsAt: null,
          remainingSeconds: 0,
          isRunning: false,
        }, mockMode);
      }
    }, 250);

    return () => clearInterval(interval);
  }, [isTimerRunning, draftStatus, league.draft_time_seconds, league.id, currentPick?.id, mockMode]);

  const buildTeamPositionCounts = (teamId: string, board: DraftPick[]) => {
    const counts: Record<string, number> = {
      QB: 0,
      RB: 0,
      WR: 0,
      TE: 0,
      K: 0,
      DEF: 0,
      DL: 0,
      LB: 0,
      DB: 0,
    };

    // Prevent accidental double-counting if a keeper appears in both sources.
    const countedPlayerIds = new Set<string>();
    const addPosition = (playerId: string | null | undefined, pos: string | null | undefined) => {
      const normalizedPos = normalizePosition(pos);
      if (!playerId || !normalizedPos || counts[normalizedPos] === undefined || countedPlayerIds.has(playerId)) return;
      countedPlayerIds.add(playerId);
      counts[normalizedPos]++;
    };

    board
      .filter((p) => p.current_team_id === teamId && p.player_id)
      .forEach((pick) => addPosition(pick.player_id, pick.player?.position));

    keepers
      .filter((k) => k.team_id === teamId)
      .forEach((keeper) => addPosition(keeper.player_id, keeper.player?.position));

    return counts;
  };

  const getPositionCounts = (teamId: string) => buildTeamPositionCounts(teamId, picks);

  const getPositionLimit = (position: string): number => {
    const normalizedPos = normalizePosition(position);
    if (!normalizedPos) return league.bench_slots;
    const slotKey = `${normalizedPos.toLowerCase()}_slots` as keyof League;
    const slots = league[slotKey];
    // Position limit is the configured slot count for that position.
    // Unknown positions fall back to bench capacity to avoid false blocks.
    if (typeof slots === 'number') return slots;
    return league.bench_slots;
  };

  const handleDraft = async (player: Player) => {
    if (mockMode && makeMockPick.isPending) {
      console.log('[mock-draft]', 'handleDraft:ignored — pick already in flight');
      return;
    }

    if (!currentPick) {
      setErrorModal({
        open: true,
        title: 'NO PICK AVAILABLE',
        message: mockMode
          ? 'Start the mock draft first, then select a player.'
          : 'There is no pick currently on the clock.',
      });
      return;
    }

    const canPickForTeam =
      mockMode || isAdmin || accessedTeamId === currentPick.current_team_id;
    if (!canPickForTeam) {
      setErrorModal({
        open: true,
        title: 'NOT YOUR PICK',
        message: 'Only the team on the clock (or the league admin) can make this selection.',
      });
      return;
    }

    const queueAdminOverride = (title: string, message: string) => {
      if (!isAdmin) {
        setErrorModal({ open: true, title, message });
        return;
      }
      setAdminOverride({
        pickId: currentPick.id,
        player,
        title,
        message,
        source: 'on_clock',
      });
    };

    // Check if already drafted (on this board — live or mock)
    if (draftedPlayerIds.includes(player.id)) {
      queueAdminOverride(
        'ALREADY DRAFTED!',
        `${player.full_name} has already been drafted.${isAdmin ? ' Admin can override and assign anyway.' : ''}`
      );
      return;
    }

    // Keepers are already taken — block live and mock
    if (keeperPlayerIds.includes(player.id)) {
      queueAdminOverride(
        "THAT'S A KEEPER!",
        `${player.full_name} is already someone's keeper.${isAdmin ? ' Admin can override and assign anyway.' : ''}`
      );
      return;
    }

    // Position limit — same modal pattern as ALREADY DRAFTED
    const normalizedPos = normalizePosition(player.position);
    if (normalizedPos) {
      const counts = getPositionCounts(currentPick.current_team_id);
      const limit = getPositionLimit(normalizedPos);

      if ((counts[normalizedPos] ?? 0) >= limit) {
        queueAdminOverride(
          'TOO MANY AT THAT POSITION!',
          `You already have ${counts[normalizedPos] ?? 0} ${normalizedPos}s and the limit is ${limit}.${isAdmin ? ' Admin can override and pick anyway.' : ''}`
        );
        return;
      }
    }

    try {
      if (mockMode) {
        console.log('[mock-draft]', new Date().toISOString(), 'handleDraft:start', {
          pickId: currentPick.id,
          pickNumber: currentPick.pick_number,
          round: currentPick.round,
          playerId: player.id,
          player: player.full_name,
          cacheHasPick: mockPicks.some((p) => p.id === currentPick.id),
          cacheSize: mockPicks.length,
        });

        // Guard against stale pick IDs from a previous mock session still in memory
        if (!mockPicks.some((p) => p.id === currentPick.id)) {
          console.warn('[mock-draft]', 'stale pick id — refetching board');
          await refetchMock();
          setErrorModal({
            open: true,
            title: 'BOARD REFRESHED',
            message: 'The mock board was still loading. Please select the player again.',
          });
          return;
        }

        const t0 = performance.now();
        await makeMockPick.mutateAsync({
          pickId: currentPick.id,
          playerId: player.id,
          leagueId: league.id,
          year: currentYear,
          player,
        });
        console.log('[mock-draft]', new Date().toISOString(), 'handleDraft:done', {
          ms: Math.round(performance.now() - t0),
        });
        return;
      }

      await makePick.mutateAsync({
        pickId: currentPick.id,
        playerId: player.id,
        leagueId: league.id,
        year: currentYear,
        asAdmin: isAdmin,
        access_code: getAccessCode(league.id),
      });
    } catch (error) {
      console.error('[mock-draft]', 'handleDraft:error', error);
      const message = error instanceof Error ? error.message : 'Could not make this pick.';
      setErrorModal({
        open: true,
        title: 'PICK FAILED',
        message,
      });
    }
  };

  const confirmAdminOverridePick = async () => {
    try {
      if (adminOverride.source === 'edit_pick') {
        await editPick.mutateAsync({
          pickId: adminOverride.pickId,
          playerId: adminOverride.player.id,
          leagueId: league.id,
          year: currentYear,
          mock: mockMode,
          player: adminOverride.player,
        });
        setEditingPick(null);
      } else {
        if (!currentPick || currentPick.id !== adminOverride.pickId) {
          setAdminOverride(null);
          setErrorModal({
            open: true,
            title: 'PICK MOVED',
            message: 'The pick on the clock changed. Try selecting the player again.',
          });
          return;
        }

        if (mockMode) {
          await editPick.mutateAsync({
            pickId: currentPick.id,
            playerId: adminOverride.player.id,
            leagueId: league.id,
            year: currentYear,
            mock: true,
            player: adminOverride.player,
          });
        } else {
        await makePick.mutateAsync({
          pickId: currentPick.id,
          playerId: adminOverride.player.id,
          leagueId: league.id,
          year: currentYear,
          asAdmin: true,
        });
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not make this pick.';
      setErrorModal({
        open: true,
        title: 'OVERRIDE FAILED',
        message,
      });
    } finally {
      setAdminOverride(null);
    }
  };

  const enterMockMode = async () => {
    // Mock is only allowed before the real board is initialized
    if (!isAdmin || teams.length < 2) return;
    if (livePicks.length > 0) {
      setErrorModal({
        open: true,
        title: 'MOCK UNAVAILABLE',
        message: 'Reset the live draft board before running a mock draft.',
      });
      return;
    }
    console.log('[mock-draft]', new Date().toISOString(), 'enterMockMode:start', {
      leagueId: league.id,
    });
    const result = await initializeMock.mutateAsync({ leagueId: league.id, year: currentYear });
    console.log('[mock-draft]', new Date().toISOString(), 'enterMockMode:initialized', {
      count: result.count,
      firstPickId: result.picks[0]?.id,
    });
    clearClock(league.id, true);
    trackedPickIdRef.current = null;
    endsAtRef.current = null;
    setIsTimerRunning(false);
    setTimeLeft(league.draft_time_seconds);
    setMockDraftStatus('not_started');
    setMockMode(true);
  };

  const exitMockMode = async () => {
    clearClock(league.id, true);
    trackedPickIdRef.current = null;
    endsAtRef.current = null;
    setIsTimerRunning(false);
    setMockDraftStatus('not_started');
    setMockMode(false);
    await clearMock.mutateAsync({ leagueId: league.id, year: currentYear });
  };

  const restartMockDraft = async () => {
    await initializeMock.mutateAsync({ leagueId: league.id, year: currentYear });
    clearClock(league.id, true);
    trackedPickIdRef.current = null;
    endsAtRef.current = null;
    setIsTimerRunning(false);
    setTimeLeft(league.draft_time_seconds);
    setMockDraftStatus('not_started');
  };

  const startDraft = async () => {
    if (mockMode) {
      if (!mockBoardReady) {
        setErrorModal({
          open: true,
          title: 'MOCK BOARD LOADING',
          message: 'Wait a moment for the mock board to finish loading, then start again.',
        });
        return;
      }
      setMockDraftStatus('in_progress');
      return;
    }
    await updateLeague.mutateAsync({
      id: league.id,
      draft_status: 'in_progress',
      current_pick: 1,
      current_round: 1,
    });
  };

  const pauseDraft = () => {
    setIsTimerRunning(false);
    endsAtRef.current = null;
    if (currentPick) {
      saveClock(league.id, {
        pickId: currentPick.id,
        endsAt: null,
        remainingSeconds: timeLeft,
        isRunning: false,
      }, mockMode);
    }
  };

  const resumeDraft = () => {
    const seconds = timeLeft > 0 ? timeLeft : league.draft_time_seconds;
    const endsAt = Date.now() + seconds * 1000;
    endsAtRef.current = endsAt;
    setTimeLeft(seconds);
    setIsTimerRunning(true);
    if (currentPick) {
      saveClock(league.id, {
        pickId: currentPick.id,
        endsAt,
        remainingSeconds: seconds,
        isRunning: true,
      }, mockMode);
    }
  };

  const resetTimer = () => {
    setTimeLeft(league.draft_time_seconds);
    if (!currentPick) return;

    if (isTimerRunning) {
      const endsAt = Date.now() + league.draft_time_seconds * 1000;
      endsAtRef.current = endsAt;
      saveClock(league.id, {
        pickId: currentPick.id,
        endsAt,
        remainingSeconds: league.draft_time_seconds,
        isRunning: true,
      }, mockMode);
    } else {
      endsAtRef.current = null;
      saveClock(league.id, {
        pickId: currentPick.id,
        endsAt: null,
        remainingSeconds: league.draft_time_seconds,
        isRunning: false,
      }, mockMode);
    }
  };

  const stopAutoDraft = useCallback(() => {
    autoDraftRef.current = false;
    setAutoDraftRunning(false);
  }, []);

  useEffect(() => () => {
    autoDraftRef.current = false;
  }, []);

  const positionCountsForBoard = (teamId: string, board: DraftPick[]) =>
    buildTeamPositionCounts(teamId, board);

  const fetchBestAvailablePlayer = async (
    takenIds: Set<string>,
    teamId: string,
    board: DraftPick[]
  ): Promise<Player | null> => {
    const { data, error } = await supabase
      .from('players')
      .select('*')
      .order('search_rank', { ascending: true, nullsFirst: false })
      .limit(400);
    if (error) throw error;

    for (const player of (data ?? []) as Player[]) {
      if (takenIds.has(player.id)) continue;
      const normalizedPos = normalizePosition(player.position);
      if (normalizedPos) {
        const counts = positionCountsForBoard(teamId, board);
        const limit = getPositionLimit(normalizedPos);
        const have = counts[normalizedPos] ?? 0;
        if (have >= limit) continue;
      }
      return player;
    }
    return null;
  };

  const startAutoDraft = async () => {
    if ((!isAdmin && !mockMode) || autoDraftRef.current) return;
    if (!boardReady && !mockMode) return;

    autoDraftRef.current = true;
    setAutoDraftRunning(true);
    pauseDraft();

    try {
      if (draftStatus === 'not_started') {
        await startDraft();
      }

      while (autoDraftRef.current) {
        const result = await refetch();
        const board = (result.data ?? picks) as DraftPick[];
        const nextPick = board.find((p) => !p.player_id && !p.is_keeper);
        if (!nextPick) break;

        const taken = new Set<string>([
          ...board.filter((p) => p.player_id).map((p) => p.player_id!),
          ...keeperPlayerIds,
        ]);

        const player = await fetchBestAvailablePlayer(
          taken,
          nextPick.current_team_id,
          board
        );
        if (!player) {
          setErrorModal({
            open: true,
            title: 'AUTO-DRAFT STOPPED',
            message: 'No eligible players left to auto-pick.',
          });
          break;
        }

        if (mockMode) {
          await makeMockPick.mutateAsync({
            pickId: nextPick.id,
            playerId: player.id,
            leagueId: league.id,
            year: currentYear,
            player,
          });
        } else {
          await makePick.mutateAsync({
            pickId: nextPick.id,
            playerId: player.id,
            leagueId: league.id,
            year: currentYear,
            asAdmin: true,
            access_code: getAccessCode(league.id),
          });
        }

        await new Promise((resolve) => setTimeout(resolve, AUTO_DRAFT_DELAY_MS));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Auto-draft failed.';
      setErrorModal({
        open: true,
        title: 'AUTO-DRAFT ERROR',
        message,
      });
    } finally {
      autoDraftRef.current = false;
      setAutoDraftRunning(false);
    }
  };

  const finalizeDraft = async () => {
    if (mockMode) {
      setMockDraftStatus('completed');
      stopAutoDraft();
      pauseDraft();
      return;
    }
    stopAutoDraft();
    pauseDraft();
    await updateLeague.mutateAsync({
      id: league.id,
      draft_status: 'completed',
    });
  };

  const canEditPicks = (isAdmin || mockMode) && picks.length > 0 && !autoDraftRunning;

  const handleAdminEditSelect = async (player: Player) => {
    if (!editingPick) return;
    const queueAdminOverrideForEdit = (title: string, message: string) => {
      if (!isAdmin) {
        setErrorModal({ open: true, title, message });
        return;
      }
      setAdminOverride({
        pickId: editingPick.id,
        player,
        title,
        message,
        source: 'edit_pick',
      });
    };

    if (keeperPlayerIds.includes(player.id)) {
      queueAdminOverrideForEdit(
        "THAT'S A KEEPER!",
        `${player.full_name} is already someone's keeper. Admin can override and assign anyway.`
      );
      return;
    }

    const takenElsewhere = draftedPlayerIds.includes(player.id) && editingPick.player_id !== player.id;
    if (takenElsewhere) {
      queueAdminOverrideForEdit(
        'ALREADY DRAFTED!',
        `${player.full_name} is already on another pick. Admin can override and assign anyway.`
      );
      return;
    }

    // Position limit — same notice pattern as ALREADY DRAFTED
    const normalizedPos = normalizePosition(player.position);
    if (normalizedPos) {
      const counts = { ...getPositionCounts(editingPick.current_team_id) };
      // Don't double-count the player currently on the pick being edited
      const existingPos = normalizePosition(editingPick.player?.position);
      if (editingPick.player_id && existingPos && counts[existingPos] !== undefined) {
        counts[existingPos] = Math.max(0, counts[existingPos] - 1);
      }
      const limit = getPositionLimit(normalizedPos);
      if ((counts[normalizedPos] ?? 0) >= limit) {
        queueAdminOverrideForEdit(
          'TOO MANY AT THAT POSITION!',
          `You already have ${counts[normalizedPos] ?? 0} ${normalizedPos}s and the limit is ${limit}. Admin can override and assign anyway.`
        );
        return;
      }
    }

    await editPick.mutateAsync({
      pickId: editingPick.id,
      playerId: player.id,
      leagueId: league.id,
      year: currentYear,
      mock: mockMode,
      player,
    });
    setEditingPick(null);
  };

  const handleAdminClearPick = async () => {
    if (!editingPick) return;
    await editPick.mutateAsync({
      pickId: editingPick.id,
      playerId: null,
      leagueId: league.id,
      year: currentYear,
      mock: mockMode,
      player: null,
    });
    setEditingPick(null);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Group picks by round
  const picksByRound: Record<number, DraftPick[]> = {};
  picks.forEach(pick => {
    if (!picksByRound[pick.round]) {
      picksByRound[pick.round] = [];
    }
    picksByRound[pick.round].push(pick);
  });

  // Sort picks within each round by their actual position in snake order
  Object.keys(picksByRound).forEach(round => {
    const roundNum = parseInt(round);
    picksByRound[roundNum].sort((a, b) => {
      const aTeam = teams.find(t => t.id === a.original_team_id);
      const bTeam = teams.find(t => t.id === b.original_team_id);
      if (!aTeam || !bTeam) return 0;
      
      // Snake: odd rounds ascending, even rounds descending
      return roundNum % 2 === 1 
        ? aTeam.draft_position - bTeam.draft_position
        : bTeam.draft_position - aTeam.draft_position;
    });
  });

  const currentTeam = currentPick ? teams.find(t => t.id === currentPick.current_team_id) : null;
  const boardColumns = `${ROUND_COL_WIDTH}px ${teams
    .map(team => `${columnWidths[team.id] ?? DEFAULT_COL_WIDTH}px`)
    .join(' ')}`;
  const boardWidth =
    ROUND_COL_WIDTH +
    teams.reduce((sum, team) => sum + (columnWidths[team.id] ?? DEFAULT_COL_WIDTH), 0) +
    COL_GAP * teams.length;
  const uniformColumnWidth = teams.length
    ? Math.round(
        teams.reduce((sum, team) => sum + (columnWidths[team.id] ?? DEFAULT_COL_WIDTH), 0) / teams.length
      )
    : DEFAULT_COL_WIDTH;

  const keepersByTeam = Object.fromEntries(
    teams.map(team => [
      team.id,
      keepers
        .filter(k => k.team_id === team.id)
        .sort((a, b) => (a.player?.search_rank ?? 9999) - (b.player?.search_rank ?? 9999)),
    ])
  );
  const maxKeepers = teams.length
    ? Math.max(...teams.map(t => keepersByTeam[t.id]?.length ?? 0), 0)
    : 0;

  const previewOwnership = useMemo(
    () =>
      buildSlotOwnershipMap({
        teams,
        numRounds: league.num_rounds,
        year: currentYear,
        swaps: pickSwaps,
      }),
    [teams, league.num_rounds, currentYear, pickSwaps]
  );

  const yearSwaps = useMemo(
    () =>
      [...pickSwaps]
        .filter((s) => s.year === currentYear)
        .sort(
          (a, b) =>
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime() ||
            a.id.localeCompare(b.id)
        ),
    [pickSwaps, currentYear]
  );

  const liveBoardReady = livePicks.length > 0;
  const boardReady = picks.length > 0;

  // Leave mock mode if the real board gets initialized (e.g. another tab)
  useEffect(() => {
    if (!mockMode || !liveBoardReady) return;
    clearClock(league.id, true);
    trackedPickIdRef.current = null;
    endsAtRef.current = null;
    setIsTimerRunning(false);
    setMockDraftStatus('not_started');
    setMockMode(false);
  }, [mockMode, liveBoardReady, league.id]);

  const handleInitializeDraft = async () => {
    const orderedTeams = [...teams].sort((a, b) => a.draft_position - b.draft_position);
    await initializePicks.mutateAsync({
      leagueId: league.id,
      teams: orderedTeams,
      numRounds: league.num_rounds,
      year: currentYear,
    });
  };

  const rootClass = fill ? 'flex h-full min-h-0 flex-col gap-3' : 'space-y-6';
  const boardScrollClass = fill
    ? 'relative z-0 min-h-0 flex-1 overflow-auto rounded-lg border border-border'
    : 'relative z-0 overflow-auto max-h-[calc(100dvh-12rem)] rounded-lg border border-border';

  if (!boardReady && !mockMode) {
    return (
      <div className={rootClass}>
        {isAdmin && teams.length >= 2 && (
          <div className="flex flex-wrap items-center gap-3">
            <Button
              onClick={handleInitializeDraft}
              disabled={!canInitializeDraft || initializePicks.isPending}
              size="lg"
              className="glow-primary"
            >
              <Play className="h-4 w-4 mr-2" />
              {initializePicks.isPending ? 'Initializing...' : 'Initialize Draft'}
            </Button>
            <Button
              onClick={enterMockMode}
              disabled={initializeMock.isPending}
              variant="secondary"
              size="lg"
            >
              <FlaskConical className="h-4 w-4 mr-2" />
              {initializeMock.isPending ? 'Starting mock...' : 'Mock Draft'}
            </Button>
          </div>
        )}

        {isAdmin && teams.length >= 2 && (
          <DraftOrderEditor league={league} teams={teams} />
        )}

        {/* Preview board: positions, trade ownership, keepers */}
        <div className={boardScrollClass}>
          <div style={{ width: boardWidth, minWidth: boardWidth }}>
            <div
              className="grid gap-1 sticky top-0 z-20 bg-background pt-1 pb-2"
              style={{ gridTemplateColumns: boardColumns }}
            >
              <div className="sticky left-0 z-30 p-2 text-sm font-semibold text-muted-foreground bg-background">
                Round
              </div>
              {teams.map((team) => (
                <div
                  key={team.id}
                  className="relative min-w-0 p-3 rounded-t-lg text-center bg-secondary select-none"
                >
                  <div className="font-display text-lg truncate">{team.name}</div>
                  <div className="text-xs text-muted-foreground">#{team.draft_position}</div>
                  <button
                    type="button"
                    aria-label={`Resize ${team.name} column`}
                    className="absolute inset-y-0 right-0 w-2 cursor-col-resize touch-none group"
                    onMouseDown={(event) => {
                      event.preventDefault();
                      startColumnResize(team.id, event.clientX);
                    }}
                  >
                    <span className="absolute inset-y-2 right-0 w-0.5 rounded-full bg-border group-hover:bg-primary group-active:bg-primary transition-colors" />
                  </button>
                </div>
              ))}
            </div>

            {Array.from({ length: league.num_rounds }, (_, i) => i + 1).map((round) => (
              <div
                key={round}
                className="grid gap-1 mb-1"
                style={{ gridTemplateColumns: boardColumns }}
              >
                <div className="sticky left-0 z-10 flex items-center justify-center p-2 bg-muted rounded-l-lg font-display text-lg shadow-[2px_0_6px_rgba(0,0,0,0.25)]">
                  {round}
                </div>
                {teams.map((team) => {
                  const ownerId =
                    previewOwnership.get(`${team.id}:${round}`) ?? team.id;
                  const isTraded = ownerId !== team.id;
                  const ownerTeam = isTraded
                    ? teams.find((t) => t.id === ownerId)
                    : null;

                  return (
                    <div
                      key={team.id}
                      className={cn(
                        'min-w-0 p-2 rounded min-h-[60px] flex flex-col justify-center border-2 bg-muted/20',
                        isTraded ? 'border-accent/40' : 'border-transparent'
                      )}
                    >
                      {ownerTeam ? (
                        <div className="text-xs text-accent text-center truncate">
                          → {ownerTeam.name}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ))}

            {maxKeepers > 0 && (
              <div className="mt-4 pt-3 border-t border-accent/30">
                <div className="flex items-center gap-2 px-2 pb-2 text-sm font-semibold text-accent">
                  <Star className="h-4 w-4" />
                  Keepers
                </div>
                {Array.from({ length: maxKeepers }, (_, slot) => (
                  <div
                    key={`preview-keeper-${slot}`}
                    className="grid gap-1 mb-1"
                    style={{ gridTemplateColumns: boardColumns }}
                  >
                    <div className="sticky left-0 z-10 flex items-center justify-center p-2 bg-card rounded-l-lg font-display text-sm text-accent shadow-[2px_0_6px_rgba(0,0,0,0.25)]">
                      K{slot + 1}
                    </div>
                    {teams.map((team) => {
                      const keeper = keepersByTeam[team.id]?.[slot];
                      return (
                        <div
                          key={team.id}
                          className={cn(
                            'min-w-0 p-2 rounded min-h-[60px] flex flex-col justify-center border-2',
                            keeper
                              ? 'bg-accent/10 border-accent/30'
                              : 'bg-muted/10 border-transparent'
                          )}
                        >
                          {keeper?.player && (
                            <div className="space-y-1 min-w-0">
                              <div className="flex items-center gap-1">
                                <Star className="h-3 w-3 text-accent shrink-0" />
                                <PositionBadge
                                  position={keeper.player.position}
                                  className="text-[10px]"
                                />
                              </div>
                              <div className="text-sm font-semibold truncate">
                                {keeper.player.full_name}
                              </div>
                              <div className="text-xs text-muted-foreground truncate">
                                {keeper.player.team || 'FA'}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {yearSwaps.length > 0 && (
          <Card className="glass p-4">
            <div className="flex items-center gap-2 mb-3 text-sm font-semibold">
              <ArrowLeftRight className="h-4 w-4 text-primary" />
              Pick trades ({currentYear})
            </div>
            <ul className="space-y-2 text-sm text-muted-foreground">
              {yearSwaps.map((swap) => {
                const teamA = teams.find((t) => t.id === swap.team_a_id);
                const teamB = teams.find((t) => t.id === swap.team_b_id);
                const slotA = teams.find((t) => t.id === swap.slot_a_original_team_id);
                const slotB = teams.find((t) => t.id === swap.slot_b_original_team_id);
                return (
                  <li key={swap.id} className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                    <span className="font-medium text-foreground">{teamA?.name ?? 'Team'}</span>
                    <span>
                      R{swap.slot_a_round}
                      {slotA && slotA.id !== swap.team_a_id ? ` (${slotA.name})` : ''}
                    </span>
                    <ArrowLeftRight className="h-3.5 w-3.5 text-primary shrink-0" />
                    <span className="font-medium text-foreground">{teamB?.name ?? 'Team'}</span>
                    <span>
                      R{swap.slot_b_round}
                      {slotB && slotB.id !== swap.team_b_id ? ` (${slotB.name})` : ''}
                    </span>
                  </li>
                );
              })}
            </ul>
          </Card>
        )}
      </div>
    );
  }

  return (
    <div className={rootClass}>
      {mockMode && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-accent/40 bg-accent/10 px-4 py-3">
          <div className="flex items-center gap-2 text-sm">
            <EyeOff className="h-4 w-4 text-accent shrink-0" />
            <span>
              <Badge variant="secondary" className="mr-2 gap-1">
                <FlaskConical className="h-3 w-3" />
                Mock Draft
              </Badge>
              Private practice board — teams cannot see these picks.
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={restartMockDraft}
              disabled={initializeMock.isPending}
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              Restart mock
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={exitMockMode}
              disabled={clearMock.isPending}
            >
              Exit mock
            </Button>
          </div>
        </div>
      )}

      {/* Draft Controls — keep above sticky board headers so player search isn't covered */}
      <Card className={cn('glass relative z-50 isolate', fill ? 'p-3' : 'p-6')}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            {draftStatus === 'not_started' && (canStartDraft || mockMode) && (
              <Button
                onClick={startDraft}
                size="lg"
                className="glow-primary"
                disabled={mockMode && (!mockBoardReady || initializeMock.isPending)}
              >
                <Play className="mr-2 h-5 w-5" />
                {mockMode && !mockBoardReady
                  ? 'Loading mock board...'
                  : mockMode
                    ? 'Start Mock Draft'
                    : 'Start Draft'}
              </Button>
            )}
            {draftStatus === 'not_started' && !canStartDraft && !mockMode && (
              <p className="text-sm text-muted-foreground">
                Waiting for the league admin to start the draft.
              </p>
            )}

            {draftStatus === 'completed' && (
              <Badge variant="secondary" className="gap-1 text-sm py-1.5 px-3">
                <Flag className="h-3.5 w-3.5" />
                Draft finalized
                {currentPick ? ' — you can still make remaining picks' : ''}
              </Badge>
            )}

            {draftStatus === 'in_progress' && (isAdmin || mockMode) && (
              <>
                {isTimerRunning ? (
                  <Button onClick={pauseDraft} variant="secondary" size="lg" disabled={autoDraftRunning}>
                    <Pause className="mr-2 h-5 w-5" />
                    Pause
                  </Button>
                ) : (
                  <Button onClick={resumeDraft} size="lg" className="glow-primary" disabled={autoDraftRunning}>
                    <Play className="mr-2 h-5 w-5" />
                    {timeLeft <= 0 ? 'Start' : 'Resume'}
                  </Button>
                )}
                <Button onClick={resetTimer} variant="outline" size="lg" disabled={autoDraftRunning}>
                  <RotateCcw className="mr-2 h-5 w-5" />
                  Reset Timer
                </Button>
              </>
            )}

            {(isAdmin || mockMode) && boardReady && (
              autoDraftRunning ? (
                <Button onClick={stopAutoDraft} variant="destructive" size="lg">
                  <Square className="mr-2 h-5 w-5" />
                  Stop auto-draft
                </Button>
              ) : (
                <Button
                  onClick={startAutoDraft}
                  variant="secondary"
                  size="lg"
                  disabled={draftStatus !== 'not_started' && !currentPick}
                >
                  <Bot className="mr-2 h-5 w-5" />
                  Auto-draft (test)
                </Button>
              )
            )}

            {(isAdmin || mockMode) && boardReady && draftStatus === 'in_progress' && (
              <Button onClick={finalizeDraft} variant="outline" size="lg" disabled={autoDraftRunning}>
                <Flag className="mr-2 h-5 w-5" />
                Finalize draft
              </Button>
            )}

            {isAdmin && !mockMode && liveBoardReady && (
              <ResetDraftDialog
                league={league}
                year={currentYear}
                triggerVariant="outline"
                triggerLabel="Reset Board"
              />
            )}

            {!hideViewSwitch && !mockMode && liveBoardReady && (
              <DraftViewSwitch leagueId={league.id} current="board" size="lg" />
            )}
          </div>

          {showTimer && currentPick && (
            <div className="flex items-center gap-6">
              <div className="text-center">
                <div className="text-sm text-muted-foreground">On the Clock</div>
                <div className="text-2xl font-display text-primary">
                  {currentTeam?.name || 'Unknown'}
                </div>
                <div className="text-sm text-muted-foreground">
                  Round {currentPick.round}, Pick {currentPick.pick_number}
                </div>
              </div>

              <div className={cn(
                "flex items-center gap-2 px-6 py-3 rounded-lg font-display text-4xl",
                timeLeft <= 0
                  ? "bg-destructive/30 text-destructive"
                  : timeLeft <= 30
                    ? "bg-destructive/20 text-destructive animate-pulse"
                    : "bg-primary/20 text-primary"
              )}>
                <Clock className="h-8 w-8" />
                {formatTime(timeLeft)}
              </div>
            </div>
          )}

          {draftStatus === 'completed' && currentPick && (
            <div className="text-center">
              <div className="text-sm text-muted-foreground">Continuing — on the clock</div>
              <div className="text-2xl font-display text-primary">
                {currentTeam?.name || 'Unknown'}
              </div>
              <div className="text-sm text-muted-foreground">
                Round {currentPick.round}, Pick {currentPick.pick_number}
              </div>
            </div>
          )}
        </div>

        {/* Player Search — admin, mock mode, or the team on the clock */}
        {draftInteractive && currentPick && (
          <div className={cn('max-w-xl relative z-50', fill ? 'mt-3' : 'mt-6')}>
            {autoDraftRunning ? (
              <p className="text-sm text-muted-foreground flex items-center gap-2">
                <Bot className="h-4 w-4 animate-pulse" />
                Auto-drafting… picks are being made automatically.
              </p>
            ) : mockMode || isAdmin || accessedTeamId === currentPick.current_team_id ? (
              <PlayerSearch
                onSelect={handleDraft}
                excludePlayerIds={draftedPlayerIds}
                placeholder={`Search for a player for ${currentTeam?.name}...`}
                autoFocus
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                {accessedTeamId
                  ? `Waiting on ${currentTeam?.name || 'the next team'} to pick.`
                  : `Enter ${currentTeam?.name || 'the on-clock team'}'s access code to draft, or wait for the admin.`}
              </p>
            )}
          </div>
        )}

        {draftStatus === 'completed' && !currentPick && (
          <p className="mt-4 text-sm text-muted-foreground">
            All picks are filled. The draft is finalized.
          </p>
        )}
      </Card>

      {/* Column width controls */}
      <div className="relative z-0 flex shrink-0 flex-wrap items-center gap-4 rounded-lg border border-border bg-card/50 px-4 py-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground shrink-0">
          <Columns3 className="h-4 w-4" />
          <span>All columns</span>
        </div>
        <Slider
          className="w-48 sm:w-64"
          min={MIN_COL_WIDTH}
          max={MAX_COL_WIDTH}
          step={4}
          value={[uniformColumnWidth]}
          onValueChange={([value]) => setAllColumnWidths(value)}
        />
        <span className="text-sm tabular-nums text-muted-foreground w-12">{uniformColumnWidth}px</span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setAllColumnWidths(DEFAULT_COL_WIDTH)}
        >
          Reset
        </Button>
        <span className="text-xs text-muted-foreground hidden sm:inline">
          Drag column edges to resize individually
        </span>
      </div>

      {/* Draft Board Grid — single scrollport so sticky header + round column both work */}
      <div className={boardScrollClass}>
        <div style={{ width: boardWidth, minWidth: boardWidth }}>
          {/* Team Headers */}
          <div
            className="grid gap-1 sticky top-0 z-10 bg-background pt-1 pb-2"
            style={{ gridTemplateColumns: boardColumns }}
          >
            <div className="sticky left-0 z-20 p-2 text-sm font-semibold text-muted-foreground bg-background">
              Round
            </div>
            {teams.map(team => (
              <div 
                key={team.id} 
                className={cn(
                  "relative min-w-0 p-3 rounded-t-lg text-center font-display text-lg truncate select-none",
                  currentTeam?.id === team.id && draftStatus === 'in_progress'
                    ? "bg-primary text-primary-foreground glow-primary"
                    : "bg-secondary"
                )}
              >
                {team.name}
                <button
                  type="button"
                  aria-label={`Resize ${team.name} column`}
                  className="absolute inset-y-0 right-0 w-2 cursor-col-resize touch-none group"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    startColumnResize(team.id, event.clientX);
                  }}
                >
                  <span className="absolute inset-y-2 right-0 w-0.5 rounded-full bg-border group-hover:bg-primary group-active:bg-primary transition-colors" />
                </button>
              </div>
            ))}
          </div>

          {/* Draft Picks Grid */}
          {Object.entries(picksByRound).map(([round, roundPicks]) => (
              <div 
                key={round} 
                className="grid gap-1 mb-1" 
                style={{ gridTemplateColumns: boardColumns }}
              >
                <div className="sticky left-0 z-10 flex items-center justify-center p-2 bg-muted rounded-l-lg font-display text-lg shadow-[2px_0_6px_rgba(0,0,0,0.25)]">
                  {round}
                </div>
                
                {teams.map(team => {
                  // Find the pick for this team in this round
                  const pick = roundPicks.find(p => p.original_team_id === team.id);
                  if (!pick) return <div key={team.id} className="min-w-0 p-2 bg-muted/20 border-2 border-transparent" />;

                  const isCurrent = currentPick?.id === pick.id;
                  const isTraded = pick.current_team_id !== pick.original_team_id;
                  const draftedByTeam = isTraded ? teams.find(t => t.id === pick.current_team_id) : null;

                  return (
                    <div
                      key={team.id}
                      role={canEditPicks ? 'button' : undefined}
                      tabIndex={canEditPicks ? 0 : undefined}
                      onClick={() => {
                        if (canEditPicks) setEditingPick(pick);
                      }}
                      onKeyDown={(event) => {
                        if (!canEditPicks) return;
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          setEditingPick(pick);
                        }
                      }}
                      title={canEditPicks ? 'Click to edit this pick' : undefined}
                      className={cn(
                        "min-w-0 p-2 rounded transition-all duration-300 min-h-[60px] flex flex-col justify-center border-2",
                        isCurrent && "bg-primary/30 border-primary animate-pulse-glow",
                        !isCurrent && pick.player_id && "bg-secondary/80 border-transparent",
                        !isCurrent && !pick.player_id && "bg-muted/20 border-transparent",
                        isTraded && !isCurrent && "border-accent/40",
                        canEditPicks && "cursor-pointer hover:ring-2 hover:ring-primary/50"
                      )}
                    >
                      {pick.player ? (
                        <div className="space-y-1 min-w-0">
                          <div className="flex items-center gap-1">
                            <PositionBadge position={pick.player.position} className="text-[10px]" />
                            {canEditPicks && (
                              <Pencil className="h-3 w-3 text-muted-foreground ml-auto shrink-0 opacity-60" />
                            )}
                          </div>
                          <div className="text-sm font-semibold truncate">
                            {pick.player.full_name}
                          </div>
                          <div className="text-xs text-muted-foreground truncate">
                            {pick.player.team || 'FA'}
                          </div>
                          {draftedByTeam && (
                            <div className="text-xs text-accent truncate">
                              → {draftedByTeam.name}
                            </div>
                          )}
                        </div>
                      ) : draftedByTeam ? (
                        <div className="text-xs text-accent text-center truncate">
                          → {draftedByTeam.name}
                          {canEditPicks && (
                            <Pencil className="h-3 w-3 text-muted-foreground mx-auto mt-1 opacity-60" />
                          )}
                        </div>
                      ) : canEditPicks ? (
                        <div className="text-xs text-muted-foreground text-center flex flex-col items-center gap-1">
                          <Pencil className="h-3 w-3 opacity-60" />
                          Edit
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
          ))}

          {/* Keepers — roster players in rows below all draft rounds */}
          {maxKeepers > 0 && (
            <div className="mt-4 pt-3 border-t border-accent/30">
              <div className="flex items-center gap-2 px-2 pb-2 text-sm font-semibold text-accent">
                <Star className="h-4 w-4" />
                Keepers
              </div>

              {Array.from({ length: maxKeepers }, (_, slot) => (
                <div
                  key={`keeper-row-${slot}`}
                  className="grid gap-1 mb-1"
                  style={{ gridTemplateColumns: boardColumns }}
                >
                  <div className="sticky left-0 z-10 flex items-center justify-center p-2 bg-card rounded-l-lg font-display text-sm text-accent shadow-[2px_0_6px_rgba(0,0,0,0.25)]">
                    K{slot + 1}
                  </div>
                  {teams.map(team => {
                    const keeper = keepersByTeam[team.id]?.[slot];

                    return (
                      <div
                        key={team.id}
                        className={cn(
                          "min-w-0 p-2 rounded min-h-[60px] flex flex-col justify-center border-2",
                          keeper ? "bg-accent/10 border-accent/30" : "bg-muted/10 border-transparent"
                        )}
                      >
                        {keeper?.player && (
                          <div className="space-y-1 min-w-0">
                            <div className="flex items-center gap-1">
                              <Star className="h-3 w-3 text-accent shrink-0" />
                              <PositionBadge position={keeper.player.position} className="text-[10px]" />
                            </div>
                            <div className="text-sm font-semibold truncate">
                              {keeper.player.full_name}
                            </div>
                            <div className="text-xs text-muted-foreground truncate">
                              {keeper.player.team || 'FA'}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <ErrorModal
        open={errorModal.open}
        onClose={() => setErrorModal({ ...errorModal, open: false })}
        title={errorModal.title}
        message={errorModal.message}
      />
      <AlertDialog
        open={!!adminOverride}
        onOpenChange={(open) => {
          if (!open) setAdminOverride(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{adminOverride?.title ?? 'Admin override'}</AlertDialogTitle>
            <AlertDialogDescription>
              {adminOverride?.message}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={makePick.isPending || editPick.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={makePick.isPending || editPick.isPending}
              onClick={(event) => {
                event.preventDefault();
                void confirmAdminOverridePick();
              }}
            >
              {makePick.isPending || editPick.isPending ? 'Applying...' : 'Override and draft'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={!!editingPick}
        onOpenChange={(open) => {
          if (!open) setEditingPick(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-4 w-4" />
              Edit pick
            </DialogTitle>
            <DialogDescription>
              {editingPick
                ? `Round ${editingPick.round}${
                    editingPick.pick_number != null ? `, pick ${editingPick.pick_number}` : ''
                  } — ${
                    teams.find((t) => t.id === editingPick.current_team_id)?.name ?? 'team'
                  }`
                : 'Change or clear this draft pick.'}
            </DialogDescription>
          </DialogHeader>

          {editingPick?.player && (
            <div className="rounded-lg border border-border bg-secondary/50 p-3 text-sm">
              <div className="text-xs text-muted-foreground mb-1">Current</div>
              <div className="flex items-center gap-2">
                <PositionBadge position={editingPick.player.position} />
                <span className="font-semibold">{editingPick.player.full_name}</span>
                <span className="text-muted-foreground">
                  {editingPick.player.team || 'FA'}
                </span>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Search for a replacement player</p>
            <PlayerSearch
              onSelect={handleAdminEditSelect}
              excludePlayerIds={draftedPlayerIds.filter((id) => id !== editingPick?.player_id)}
              placeholder="Search players..."
              autoFocus
              inline
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            {editingPick?.player_id && (
              <Button
                type="button"
                variant="outline"
                disabled={editPick.isPending}
                onClick={handleAdminClearPick}
              >
                Clear pick
              </Button>
            )}
            <Button
              type="button"
              variant="secondary"
              onClick={() => setEditingPick(null)}
              disabled={editPick.isPending}
            >
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
