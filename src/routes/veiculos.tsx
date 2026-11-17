import { createFileRoute } from '@tanstack/react-router';
import { useMemo } from 'react';
import { AppShell, useRequireUser } from '@/components/AppShell';
import { FleetModule } from '@/modules/frota/FleetModule';
import { JarvasFleetAdapter } from '@/modules/frota/services/jarvas.adapter';
export const Route = createFileRoute('/veiculos')({ssr:false, component: VehiclesPage});
function VehiclesPage() {
  const user = useRequireUser();
  const adapter = useMemo(() => new JarvasFleetAdapter(), []);
  if (!user) return null;
  return <AppShell user={user} active="veiculos"><FleetModule embedded adapter={adapter} currentUser={{id:user.email, email:user.email, name:user.name, role:'GESTOR'}} /></AppShell>;
}
