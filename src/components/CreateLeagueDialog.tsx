import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCreateLeague } from '@/hooks/useLeague';
import { useNavigate } from 'react-router-dom';

export function CreateLeagueDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [numTeams, setNumTeams] = useState(12);
  const [numRounds, setNumRounds] = useState(15);
  const [draftTime, setDraftTime] = useState(120);

  const createLeague = useCreateLeague();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const league = await createLeague.mutateAsync({
      name,
      num_teams: numTeams,
      num_rounds: numRounds,
      draft_time_seconds: draftTime,
    });

    setOpen(false);
    setName('');
    navigate(`/league/${league.id}`);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="lg" className="glow-primary">
          <Plus className="mr-2 h-5 w-5" />
          Create League
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-2xl font-display">Create New League</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-6 mt-4">
          <div className="space-y-2">
            <Label htmlFor="name">League Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="The Best League Ever"
              required
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="teams">Teams</Label>
              <Input
                id="teams"
                type="number"
                min={4}
                max={20}
                value={numTeams}
                onChange={(e) => setNumTeams(parseInt(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rounds">Rounds</Label>
              <Input
                id="rounds"
                type="number"
                min={1}
                max={30}
                value={numRounds}
                onChange={(e) => setNumRounds(parseInt(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="time">Time (sec)</Label>
              <Input
                id="time"
                type="number"
                min={30}
                max={600}
                step={30}
                value={draftTime}
                onChange={(e) => setDraftTime(parseInt(e.target.value))}
              />
            </div>
          </div>

          <Button type="submit" className="w-full" disabled={createLeague.isPending}>
            {createLeague.isPending ? 'Creating...' : 'Create League'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
