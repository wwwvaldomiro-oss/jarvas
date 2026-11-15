import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell, useRequireUser } from "@/components/AppShell";
import { ArrowRight, CarFront } from "lucide-react";

export const Route = createFileRoute("/viagens")({
  head: () => ({ meta: [{ title: "Viagens — Axion" }] }),
  component: Page,
});

function Page() {
  const user = useRequireUser();

  return (
    <AppShell active="viagens" user={user}>
      <main className="mx-auto max-w-5xl p-6 lg:p-8">
        <h1 className="text-3xl font-bold">Viagens</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Planeje suas viagens de carro.
        </p>
        <Link
          to="/viagens/carro"
          className="mt-6 flex flex-wrap items-center gap-4 rounded-2xl border bg-card p-5 transition-colors hover:border-primary/40 hover:bg-accent/40"
        >
          <span className="rounded-xl bg-primary/10 p-3 text-primary">
            <CarFront className="size-6" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">Viagens de Carro</span>
            <span className="block text-sm text-muted-foreground">
              Planeje rotas, paradas, combustível e pedágios com um orçamento estimado.
            </span>
          </span>
          <ArrowRight className="size-5 text-muted-foreground" />
        </Link>
      </main>
    </AppShell>
  );
}
