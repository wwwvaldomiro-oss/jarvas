/**
 * Referência pronta para acoplar o Módulo Frota no aplicativo principal
 * Órion / Conecta (React 19 + TanStack Start + TanStack Query v5 + Lovable Cloud).
 */

export const GIT_SUBTREE_COMMANDS = `# 1. No repositório do app principal (Órion / Conecta), adicione este módulo:
git remote add frota-origin https://github.com/sua-org/modulo-frota.git
git subtree add --prefix=src/modules/frota frota-origin main --squash

# 2. Para receber futuras atualizações do módulo de frota:
git subtree pull --prefix=src/modules/frota frota-origin main --squash`;

export const TANSTACK_BRIDGE_SNIPPET = `// app/routes/frota.tsx (no aplicativo principal TanStack Start)
import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FleetModule, type FleetStateSnapshot } from '@/modules/frota';

export const getFleetSnapshotFn = createServerFn({ method: 'GET' }).handler(async () => {
  // Consultar tabelas public.fleet_* no PostgreSQL (com RLS do usuário autenticado)
  return await db.fleet.loadSnapshot();
});

export const saveFleetSnapshotFn = createServerFn({ method: 'POST' })
  .validator((data: FleetStateSnapshot) => data)
  .handler(async ({ data }) => {
    await db.fleet.saveSnapshot(data);
    return { ok: true };
  });

export const Route = createFileRoute('/frota')({
  component: FrotaRoutePage,
});

function FrotaRoutePage() {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ['fleet', 'snapshot'],
    queryFn: () => getFleetSnapshotFn(),
  });

  const adapter = {
    loadSnapshot: async () => data ?? (await getFleetSnapshotFn()),
    saveSnapshot: async (snapshot: FleetStateSnapshot) => {
      await saveFleetSnapshotFn({ data: snapshot });
      await queryClient.invalidateQueries({ queryKey: ['fleet', 'snapshot'] });
    },
  };

  return <FleetModule adapter={adapter} />;
}`;
