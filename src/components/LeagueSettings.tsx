import { useState } from 'react';
import { League } from '@/lib/types';
import { useUpdateLeague } from '@/hooks/useLeague';
import { useLeaguePermissions } from '@/hooks/useLeaguePermissions';
import { AuthDialog } from '@/components/AuthDialog';
import { ResetDraftDialog } from '@/components/ResetDraftDialog';
import { LeagueAdminsManager } from '@/components/LeagueAdminsManager';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Settings, Save, Shield, TriangleAlert } from 'lucide-react';

interface LeagueSettingsProps {
  league: League;
}

export function LeagueSettings({ league }: LeagueSettingsProps) {
  const updateLeague = useUpdateLeague();
  const { canEditSettings, isAdmin } = useLeaguePermissions(league);
  const [formData, setFormData] = useState({
    name: league.name,
    num_teams: league.num_teams,
    num_rounds: league.num_rounds,
    num_keepers: league.num_keepers,
    draft_time_seconds: league.draft_time_seconds,
    qb_slots: league.qb_slots,
    rb_slots: league.rb_slots,
    wr_slots: league.wr_slots,
    te_slots: league.te_slots,
    flex_slots: league.flex_slots,
    k_slots: league.k_slots,
    def_slots: league.def_slots,
    bench_slots: league.bench_slots,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEditSettings) return;
    await updateLeague.mutateAsync({
      id: league.id,
      ...formData,
    });
  };

  if (!isAdmin) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Settings className="h-6 w-6 text-primary" />
          <h2 className="text-2xl font-display">League Settings</h2>
        </div>
        <Card className="glass p-8 text-center space-y-4">
          <Shield className="h-10 w-10 mx-auto text-muted-foreground" />
          <p className="text-muted-foreground">
            Only signed-in league admins can change league-wide settings.
          </p>
          <div className="flex justify-center">
            <AuthDialog triggerLabel="Sign in as admin" />
          </div>
        </Card>
      </div>
    );
  }

  const handleChange = (key: keyof typeof formData, value: string | number) => {
    setFormData(prev => ({ ...prev, [key]: value }));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Settings className="h-6 w-6 text-primary" />
        <h2 className="text-2xl font-display">League Settings</h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card className="glass">
          <CardHeader>
            <CardTitle>General</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2 md:col-span-2">
              <Label>League Name</Label>
              <Input
                value={formData.name}
                onChange={(e) => handleChange('name', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Number of Teams</Label>
              <Input
                type="number"
                min={4}
                max={20}
                value={formData.num_teams}
                onChange={(e) => handleChange('num_teams', parseInt(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label>Number of Rounds</Label>
              <Input
                type="number"
                min={1}
                max={30}
                value={formData.num_rounds}
                onChange={(e) => handleChange('num_rounds', parseInt(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label>Keepers per team</Label>
              <Input
                type="number"
                min={0}
                max={30}
                value={formData.num_keepers}
                onChange={(e) => handleChange('num_keepers', parseInt(e.target.value) || 0)}
              />
            </div>
            <div className="space-y-2">
              <Label>Draft Time (seconds)</Label>
              <Input
                type="number"
                min={30}
                max={600}
                step={30}
                value={formData.draft_time_seconds}
                onChange={(e) => handleChange('draft_time_seconds', parseInt(e.target.value))}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="glass">
          <CardHeader>
            <CardTitle>Roster Slots</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 grid-cols-2 md:grid-cols-4 lg:grid-cols-8">
            <div className="space-y-2">
              <Label className="text-position-qb">QB</Label>
              <Input
                type="number"
                min={0}
                max={5}
                value={formData.qb_slots}
                onChange={(e) => handleChange('qb_slots', parseInt(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-position-rb">RB</Label>
              <Input
                type="number"
                min={0}
                max={5}
                value={formData.rb_slots}
                onChange={(e) => handleChange('rb_slots', parseInt(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-position-wr">WR</Label>
              <Input
                type="number"
                min={0}
                max={5}
                value={formData.wr_slots}
                onChange={(e) => handleChange('wr_slots', parseInt(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-position-te">TE</Label>
              <Input
                type="number"
                min={0}
                max={5}
                value={formData.te_slots}
                onChange={(e) => handleChange('te_slots', parseInt(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label>FLEX</Label>
              <Input
                type="number"
                min={0}
                max={5}
                value={formData.flex_slots}
                onChange={(e) => handleChange('flex_slots', parseInt(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-position-k">K</Label>
              <Input
                type="number"
                min={0}
                max={3}
                value={formData.k_slots}
                onChange={(e) => handleChange('k_slots', parseInt(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-position-def">DEF</Label>
              <Input
                type="number"
                min={0}
                max={3}
                value={formData.def_slots}
                onChange={(e) => handleChange('def_slots', parseInt(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label>Bench</Label>
              <Input
                type="number"
                min={0}
                max={15}
                value={formData.bench_slots}
                onChange={(e) => handleChange('bench_slots', parseInt(e.target.value))}
              />
            </div>
          </CardContent>
        </Card>

        <Button type="submit" size="lg" disabled={updateLeague.isPending}>
          <Save className="h-4 w-4 mr-2" />
          {updateLeague.isPending ? 'Saving...' : 'Save Settings'}
        </Button>
      </form>

      <LeagueAdminsManager league={league} />

      <Card className="glass border-destructive/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <TriangleAlert className="h-5 w-5" />
            Danger zone
          </CardTitle>
          <CardDescription>
            Uninitialize the draft board at any time (type RESET to confirm). You can then change
            draft order and initialize again. Teams and keepers are kept.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ResetDraftDialog league={league} year={new Date().getFullYear()} />
        </CardContent>
      </Card>
    </div>
  );
}
