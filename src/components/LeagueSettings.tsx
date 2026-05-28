import { useState, useEffect } from 'react';
import { League } from '@/lib/types';
import { useLeagueSettings, useUpdateLeagueSettings } from '@/hooks/useLeague';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Settings, Save } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

interface LeagueSettingsProps {
  league: League;
  year: number;
}

export function LeagueSettings({ league, year }: LeagueSettingsProps) {
  const { data: settings, isLoading } = useLeagueSettings(league.id, year);
  const updateSettings = useUpdateLeagueSettings();
  
  const [formData, setFormData] = useState({
    num_teams: league.num_teams,
    num_rounds: league.num_rounds,
    draft_time_seconds: league.draft_time_seconds,
    qb_slots: league.qb_slots,
    rb_slots: league.rb_slots,
    wr_slots: league.wr_slots,
    te_slots: league.te_slots,
    k_slots: league.k_slots,
    def_slots: league.def_slots,
    dp_slots: league.dp_slots ?? 0,
    num_keepers: 0,
  });

  // Update form data when settings load
  useEffect(() => {
    if (settings) {
      setFormData({
        num_teams: settings.num_teams,
        num_rounds: settings.num_rounds,
        draft_time_seconds: settings.draft_time_seconds,
        qb_slots: settings.qb_slots,
        rb_slots: settings.rb_slots,
        wr_slots: settings.wr_slots,
        te_slots: settings.te_slots,
        k_slots: settings.k_slots,
        def_slots: settings.def_slots,
        dp_slots: settings.dp_slots ?? 0,
        num_keepers: settings.num_keepers ?? 0,
      });
    }
  }, [settings]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await updateSettings.mutateAsync({
      leagueId: league.id,
      year: year,
      ...formData,
    });
  };

  const handleChange = (key: keyof typeof formData, value: string | number) => {
    setFormData(prev => ({ ...prev, [key]: value }));
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-[400px] w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-24">
      <div className="flex items-center gap-3">
        <Settings className="h-6 w-6 text-primary" />
        <h2 className="text-2xl font-display">League Settings for {year}</h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card className="glass">
          <CardHeader>
            <CardTitle>General</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
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
          <CardContent className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-7">
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
              <Label className="text-position-dp">DP</Label>
              <Input
                type="number"
                min={0}
                max={10}
                value={formData.dp_slots}
                onChange={(e) => handleChange('dp_slots', parseInt(e.target.value))}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="glass">
          <CardHeader>
            <CardTitle>Keeper Settings</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2">
              <Label>Number of Keepers</Label>
              <Input
                type="number"
                min={0}
                max={10}
                value={formData.num_keepers}
                onChange={(e) => handleChange('num_keepers', parseInt(e.target.value))}
              />
              <p className="text-xs text-muted-foreground">
                Maximum number of keepers per team for this year
              </p>
            </div>
          </CardContent>
        </Card>
      </form>

      {/* Sticky Save Button */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur border-t border-border p-4">
        <div className="container max-w-7xl mx-auto">
          <Button 
            type="submit" 
            size="lg" 
            disabled={updateSettings.isPending}
            onClick={handleSubmit}
            className="w-full sm:w-auto"
          >
            <Save className="h-4 w-4 mr-2" />
            {updateSettings.isPending ? 'Saving...' : 'Save Settings'}
          </Button>
        </div>
      </div>
    </div>
  );
}
