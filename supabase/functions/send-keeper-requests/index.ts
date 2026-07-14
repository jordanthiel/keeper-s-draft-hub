import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type TeamAccessRow = {
  team_id: string;
  team_name: string;
  email: string | null;
  access_code: string;
};

function buildEmailHtml(params: {
  leagueName: string;
  teamName: string;
  accessCode: string;
  appUrl: string;
  leagueUrl: string;
}) {
  const { leagueName, teamName, accessCode, appUrl, leagueUrl } = params;
  return `<!DOCTYPE html>
<html>
  <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.5; color: #111; max-width: 560px; margin: 0 auto; padding: 24px;">
    <h1 style="font-size: 22px; margin: 0 0 8px;">Select your keepers</h1>
    <p style="margin: 0 0 16px; color: #555;">
      Your league admin for <strong>${escapeHtml(leagueName)}</strong> is requesting keeper selections for <strong>${escapeHtml(teamName)}</strong>.
    </p>
    <p style="margin: 0 0 8px; font-size: 14px; color: #555;">Your team access code</p>
    <p style="font-size: 32px; letter-spacing: 0.35em; font-weight: 700; margin: 0 0 24px; font-family: ui-monospace, monospace;">
      ${escapeHtml(accessCode)}
    </p>
    <h2 style="font-size: 16px; margin: 0 0 8px;">How to submit keepers</h2>
    <ol style="margin: 0 0 24px; padding-left: 20px; color: #333;">
      <li>Open <a href="${escapeAttr(appUrl)}">${escapeHtml(appUrl)}</a></li>
      <li>Enter your 6-digit access code on the home page</li>
      <li>On your team page, choose keepers from last year&apos;s roster</li>
    </ol>
    <p style="margin: 0 0 24px;">
      <a href="${escapeAttr(leagueUrl)}" style="display: inline-block; background: #111; color: #fff; text-decoration: none; padding: 10px 16px; border-radius: 6px;">
        Open league
      </a>
    </p>
    <p style="font-size: 13px; color: #777; margin: 0;">
      Keep this code private — anyone with it can manage your team&apos;s keepers.
    </p>
  </body>
</html>`;
}

function buildEmailText(params: {
  leagueName: string;
  teamName: string;
  accessCode: string;
  appUrl: string;
  leagueUrl: string;
}) {
  const { leagueName, teamName, accessCode, appUrl, leagueUrl } = params;
  return [
    `Select your keepers for ${leagueName}`,
    '',
    `Your league admin is requesting keeper selections for ${teamName}.`,
    '',
    `Your team access code: ${accessCode}`,
    '',
    'How to submit keepers:',
    `1. Open ${appUrl}`,
    '2. Enter your 6-digit access code on the home page',
    `3. On your team page, choose keepers from last year's roster for ${teamName}`,
    '',
    `League link: ${leagueUrl}`,
    '',
    "Keep this code private — anyone with it can manage your team's keepers.",
  ].join('\n');
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(value: string) {
  return escapeHtml(value).replace(/'/g, '&#39;');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    if (!resendApiKey) {
      return jsonResponse(
        { success: false, error: 'RESEND_API_KEY is not configured on the server' },
        500
      );
    }

    const fromEmail =
      Deno.env.get('RESEND_FROM_EMAIL') || 'Draft Board <onboarding@resend.dev>';

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return jsonResponse({ success: false, error: 'Missing authorization' }, 401);
    }

    // Manual auth: platform verify_jwt breaks on local ES256 signing keys.
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return jsonResponse({ success: false, error: 'Unauthorized' }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const leagueId = body.league_id as string | undefined;
    const teamId = body.team_id as string | undefined;
    const appUrl = (body.app_url as string | undefined)?.replace(/\/$/, '');

    if (!leagueId || !appUrl) {
      return jsonResponse(
        { success: false, error: 'league_id and app_url are required' },
        400
      );
    }

    const { data: canManage, error: manageError } = await supabase.rpc('can_manage_league', {
      p_league_id: leagueId,
    });
    if (manageError) throw manageError;
    if (!canManage) {
      return jsonResponse(
        { success: false, error: 'Only the league admin can send keeper requests' },
        403
      );
    }

    const { data: league, error: leagueError } = await supabase
      .from('leagues')
      .select('id, name')
      .eq('id', leagueId)
      .single();
    if (leagueError) throw leagueError;

    const { data: codes, error: codesError } = await supabase.rpc('list_team_access_codes', {
      p_league_id: leagueId,
    });
    if (codesError) throw codesError;

    let recipients = (codes ?? []) as TeamAccessRow[];
    if (teamId) {
      recipients = recipients.filter((row) => row.team_id === teamId);
      if (recipients.length === 0) {
        return jsonResponse({ success: false, error: 'Team not found in this league' }, 404);
      }
    }

    const withEmail = recipients.filter((row) => row.email?.trim());
    const skipped = recipients.length - withEmail.length;

    if (withEmail.length === 0) {
      return jsonResponse({
        success: false,
        error: 'No teams with manager emails to email',
        sent: 0,
        failed: 0,
        skipped,
      }, 400);
    }

    const leagueUrl = `${appUrl}/league/${leagueId}`;
    const results: { team_id: string; email: string; ok: boolean; error?: string }[] = [];

    for (const row of withEmail) {
      const email = row.email!.trim();
      const payload = {
        leagueName: league.name,
        teamName: row.team_name,
        accessCode: row.access_code,
        appUrl,
        leagueUrl,
      };

      const resendRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: fromEmail,
          to: [email],
          subject: `${league.name} — Select your keepers`,
          html: buildEmailHtml(payload),
          text: buildEmailText(payload),
        }),
      });

      if (!resendRes.ok) {
        const errBody = await resendRes.text();
        console.error(`Resend failed for ${email}:`, errBody);
        results.push({
          team_id: row.team_id,
          email,
          ok: false,
          error: errBody || `Resend HTTP ${resendRes.status}`,
        });
        continue;
      }

      results.push({ team_id: row.team_id, email, ok: true });
    }

    const sent = results.filter((r) => r.ok).length;
    const failed = results.filter((r) => !r.ok).length;

    return jsonResponse({
      success: failed === 0,
      message:
        failed === 0
          ? `Sent keeper request to ${sent} team${sent === 1 ? '' : 's'}`
          : `Sent ${sent}, failed ${failed}${skipped ? `, skipped ${skipped} without email` : ''}`,
      sent,
      failed,
      skipped,
      results,
    });
  } catch (error) {
    console.error('Error sending keeper requests:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return jsonResponse({ success: false, error: errorMessage }, 500);
  }
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
