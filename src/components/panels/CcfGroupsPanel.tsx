import { useFTAStore } from "@/store/ftaStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AddRegular as Plus, DeleteRegular as Trash2 } from "@fluentui/react-icons";
import type { CcfGroup, CcfModel } from "@/types/fta";

function GroupCard({ group }: { group: CcfGroup }) {
  const nodes = useFTAStore((s) => s.nodes);
  const updateCcfGroup = useFTAStore((s) => s.updateCcfGroup);
  const removeCcfGroup = useFTAStore((s) => s.removeCcfGroup);

  const candidates = nodes.filter(
    (n) =>
      n.data.category === "event" &&
      n.data.eventKind !== "house" &&
      n.data.eventKind !== "intermediate" &&
      n.data.eventKind !== "transfer"
  );

  const mglLevels = group.factors.length;

  return (
    <div className="space-y-3 rounded-md border border-border p-3">
      <div className="flex items-center gap-2">
        <Input
          className="h-7"
          value={group.name}
          onChange={(e) => updateCcfGroup(group.id, { name: e.target.value })}
        />
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 text-destructive"
          onClick={() => removeCcfGroup(group.id)}
          title="Delete group"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="space-y-1.5">
        <Label>Model</Label>
        <Select
          value={group.model}
          onValueChange={(v) =>
            updateCcfGroup(group.id, {
              model: v as CcfModel,
              factors: v === "beta-factor" ? [group.factors[0] ?? 0.1] : group.factors.length ? group.factors : [0.1],
            })
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="beta-factor">Beta-Factor</SelectItem>
            <SelectItem value="mgl">MGL (SCRAM CLI only)</SelectItem>
            <SelectItem value="alpha-factor">Alpha-Factor (SCRAM CLI only)</SelectItem>
          </SelectContent>
        </Select>
        {group.model !== "beta-factor" && (
          <p className="text-[10px] leading-snug text-muted-foreground">
            The built-in engine only evaluates beta-factor groups — this one will show up correctly when run
            through SCRAM CLI, and be flagged with a warning otherwise.
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${group.id}-prob`}>Group Probability</Label>
        <Input
          id={`${group.id}-prob`}
          type="number"
          step="any"
          min={0}
          max={1}
          value={group.groupProbability.value ?? 0}
          onChange={(e) => updateCcfGroup(group.id, { groupProbability: { value: Number(e.target.value) } })}
        />
      </div>

      {group.model === "beta-factor" ? (
        <div className="space-y-1.5">
          <Label htmlFor={`${group.id}-beta`}>β (beta factor)</Label>
          <Input
            id={`${group.id}-beta`}
            type="number"
            step="any"
            min={0}
            max={1}
            value={group.factors[0] ?? 0}
            onChange={(e) => updateCcfGroup(group.id, { factors: [Number(e.target.value)] })}
          />
        </div>
      ) : (
        <div className="space-y-1.5">
          {/* MGL's ρ factors describe shared-failure levels only, so they
              start at level 2 (a single component failing alone isn't a
              common-cause event); alpha-factor's α factors cover every
              multiplicity including the independent case, starting at 1. */}
          <Label>{group.model === "alpha-factor" ? "Alpha Factors (level 1, 2, …)" : "MGL Factors (level 2, 3, …)"}</Label>
          <div className="space-y-1.5">
            {group.factors.map((f, i) => (
              <Input
                key={i}
                type="number"
                step="any"
                min={0}
                max={1}
                value={f}
                placeholder={`Level ${i + (group.model === "alpha-factor" ? 1 : 2)}`}
                onChange={(e) => {
                  const next = [...group.factors];
                  next[i] = Number(e.target.value);
                  updateCcfGroup(group.id, { factors: next });
                }}
              />
            ))}
          </div>
          <div className="flex gap-1.5">
            <Button
              size="sm"
              variant="outline"
              className="h-7"
              onClick={() => updateCcfGroup(group.id, { factors: [...group.factors, 0.1] })}
            >
              <Plus className="h-3.5 w-3.5" /> Add Level ({mglLevels + (group.model === "alpha-factor" ? 1 : 2)})
            </Button>
            {mglLevels > 1 && (
              <Button
                size="sm"
                variant="outline"
                className="h-7"
                onClick={() => updateCcfGroup(group.id, { factors: group.factors.slice(0, -1) })}
              >
                Remove Level
              </Button>
            )}
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        <Label>Members</Label>
        {candidates.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">No basic events on the current tab.</p>
        ) : (
          <div className="max-h-40 space-y-1.5 overflow-auto rounded-md border border-border p-2">
            {candidates.map((n) => (
              <div key={n.id} className="flex items-center justify-between gap-2">
                <Label htmlFor={`${group.id}-${n.id}`} className="text-xs font-normal">
                  {n.data.label} <span className="font-mono text-muted-foreground">({n.data.identifier})</span>
                </Label>
                <Switch
                  id={`${group.id}-${n.id}`}
                  checked={group.memberIdentifiers.includes(n.data.identifier)}
                  onCheckedChange={(checked) => {
                    const next = checked
                      ? [...group.memberIdentifiers, n.data.identifier]
                      : group.memberIdentifiers.filter((id) => id !== n.data.identifier);
                    updateCcfGroup(group.id, { memberIdentifiers: next });
                  }}
                />
              </div>
            ))}
          </div>
        )}
        {group.memberIdentifiers.length > 0 && group.memberIdentifiers.length < 2 && (
          <p className="text-[10px] text-warning-foreground">A CCF group needs at least 2 members to do anything.</p>
        )}
      </div>
    </div>
  );
}

export function CcfGroupsPanel() {
  const ccfGroups = useFTAStore((s) => s.ccfGroups);
  const addCcfGroup = useFTAStore((s) => s.addCcfGroup);

  return (
    <ScrollArea className="h-full">
      <div className="space-y-3 p-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Common-Cause Failure Groups
          </h3>
        </div>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Model basic events that can fail together from a shared cause. Beta-factor groups are evaluated by both
          the built-in engine and SCRAM CLI; MGL groups need SCRAM CLI.
        </p>
        <Button size="sm" className="w-full gap-1.5" onClick={() => addCcfGroup()}>
          <Plus className="h-3.5 w-3.5" /> Add CCF Group
        </Button>

        {ccfGroups.length > 0 && <Separator />}

        {ccfGroups.map((group) => (
          <GroupCard key={group.id} group={group} />
        ))}
      </div>
    </ScrollArea>
  );
}
