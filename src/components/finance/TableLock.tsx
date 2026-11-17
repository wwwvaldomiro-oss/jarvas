import { Lock, Unlock } from "lucide-react";

export function TableLock({ unlocked, onToggle }: {unlocked: boolean; onToggle: () => void}) {
  const label = unlocked ? "Trancar edição da tabela" : "Liberar edição da tabela";
  return <button type="button" aria-label={label} title={label} aria-pressed={unlocked}
    onClick={onToggle} className="ml-1 inline-flex rounded p-0.5 align-middle text-muted-foreground hover:text-primary focus-visible:ring-2 focus-visible:ring-primary">
    {unlocked ? <Unlock className="size-3" /> : <Lock className="size-3" />}
  </button>;
}
