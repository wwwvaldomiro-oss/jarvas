import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RegistrationWorkspace } from "./RegistrationWorkspace";

export function RegistrationDialog({ type, year, onClose, onSaved }: {
  type: "despesas" | "receitas"; year: number; onClose: () => void; onSaved?: () => void;
}) {
  return <Dialog open onOpenChange={o => !o && onClose()}>
    <DialogContent className="max-h-[94dvh] w-[96vw] max-w-[1600px] overflow-y-auto p-3 sm:p-5" aria-describedby={undefined}>
      <DialogHeader><DialogTitle>{type === "despesas" ? "Registrar pagamento" : "Registrar recebimento"}</DialogTitle></DialogHeader>
      <RegistrationWorkspace type={type} initialYear={year} onSaved={onSaved} />
    </DialogContent>
  </Dialog>;
}
