export interface ClockState {
  pickId: string;
  endsAt: number | null;
  remainingSeconds: number;
  isRunning: boolean;
}

export function clockStorageKey(leagueId: string, mock = false) {
  return mock ? `draft-clock-mock-${leagueId}` : `draft-clock-${leagueId}`;
}

export function loadClock(leagueId: string, mock = false): ClockState | null {
  try {
    const raw = localStorage.getItem(clockStorageKey(leagueId, mock));
    return raw ? (JSON.parse(raw) as ClockState) : null;
  } catch {
    return null;
  }
}

export function saveClock(leagueId: string, state: ClockState, mock = false) {
  localStorage.setItem(clockStorageKey(leagueId, mock), JSON.stringify(state));
}

export function clearClock(leagueId: string, mock = false) {
  localStorage.removeItem(clockStorageKey(leagueId, mock));
}

export function formatClock(seconds: number) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
