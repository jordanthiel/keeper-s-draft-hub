import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Team } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';

export interface TeamAccessSession {
  teamId: string;
  accessCode: string;
  teamName: string;
  leagueId: string;
  leagueName?: string;
}

interface TeamAccessContextValue {
  accessByLeague: Record<string, TeamAccessSession>;
  sessions: TeamAccessSession[];
  getAccess: (leagueId: string) => TeamAccessSession | null;
  accessTeam: (leagueId: string, accessCode: string) => Promise<Team | null>;
  accessTeamByCode: (accessCode: string) => Promise<TeamAccessSession | null>;
  clearAccess: (leagueId: string) => void;
  getAccessCode: (leagueId: string) => string | null;
}

const STORAGE_KEY = 'team-access-sessions';

const TeamAccessContext = createContext<TeamAccessContextValue | undefined>(undefined);

function loadSessions(): Record<string, TeamAccessSession> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, TeamAccessSession>;
    // Normalize older sessions that may lack leagueId on the value
    return Object.fromEntries(
      Object.entries(parsed).map(([leagueId, session]) => [
        leagueId,
        { ...session, leagueId: session.leagueId || leagueId },
      ])
    );
  } catch {
    return {};
  }
}

export function TeamAccessProvider({ children }: { children: ReactNode }) {
  const [accessByLeague, setAccessByLeague] = useState<Record<string, TeamAccessSession>>(loadSessions);
  const { toast } = useToast();

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(accessByLeague));
  }, [accessByLeague]);

  const sessions = Object.values(accessByLeague);

  const getAccess = useCallback(
    (leagueId: string) => accessByLeague[leagueId] ?? null,
    [accessByLeague]
  );

  const getAccessCode = useCallback(
    (leagueId: string) => accessByLeague[leagueId]?.accessCode ?? null,
    [accessByLeague]
  );

  const saveSession = (session: TeamAccessSession) => {
    setAccessByLeague(prev => ({
      ...prev,
      [session.leagueId]: session,
    }));
  };

  const accessTeam = async (leagueId: string, accessCode: string) => {
    const code = accessCode.trim();
    if (!/^\d{6}$/.test(code)) {
      toast({ title: 'Enter a valid 6-digit code', variant: 'destructive' });
      return null;
    }

    const { data, error } = await supabase.rpc('verify_team_access', {
      p_league_id: leagueId,
      p_access_code: code,
    });

    if (error) {
      toast({ title: 'Could not verify code', description: error.message, variant: 'destructive' });
      return null;
    }

    const team = (data?.[0] ?? null) as Team | null;
    if (!team) {
      toast({ title: 'Invalid access code', description: 'No team matches that code for this league.', variant: 'destructive' });
      return null;
    }

    saveSession({
      teamId: team.id,
      accessCode: code,
      teamName: team.name,
      leagueId,
    });

    toast({ title: `Accessing ${team.name}` });
    return team;
  };

  const accessTeamByCode = async (accessCode: string) => {
    const code = accessCode.trim();
    if (!/^\d{6}$/.test(code)) {
      toast({ title: 'Enter a valid 6-digit code', variant: 'destructive' });
      return null;
    }

    const { data, error } = await supabase.rpc('verify_team_access_by_code', {
      p_access_code: code,
    });

    if (error) {
      toast({ title: 'Could not verify code', description: error.message, variant: 'destructive' });
      return null;
    }

    const row = data?.[0] as
      | (Team & { league_name: string })
      | undefined;

    if (!row) {
      toast({
        title: 'Invalid access code',
        description: 'No team matches that code.',
        variant: 'destructive',
      });
      return null;
    }

    const session: TeamAccessSession = {
      teamId: row.id,
      accessCode: code,
      teamName: row.name,
      leagueId: row.league_id,
      leagueName: row.league_name,
    };

    saveSession(session);
    toast({ title: `Accessing ${row.name}`, description: row.league_name });
    return session;
  };

  const clearAccess = (leagueId: string) => {
    setAccessByLeague(prev => {
      const next = { ...prev };
      delete next[leagueId];
      return next;
    });
  };

  return (
    <TeamAccessContext.Provider
      value={{
        accessByLeague,
        sessions,
        getAccess,
        accessTeam,
        accessTeamByCode,
        clearAccess,
        getAccessCode,
      }}
    >
      {children}
    </TeamAccessContext.Provider>
  );
}

export function useTeamAccess() {
  const ctx = useContext(TeamAccessContext);
  if (!ctx) throw new Error('useTeamAccess must be used within TeamAccessProvider');
  return ctx;
}
