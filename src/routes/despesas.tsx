import { createFileRoute, Navigate, Outlet, useMatchRoute } from "@tanstack/react-router";

// Rota estrutural pai: as páginas anuais e parceladas continuam independentes.
// A antiga interface duplicada "Despesas do Mês" foi desativada;
// o Registro de pagamento é aberto em uma janela nas Despesas Anuais.
export const Route = createFileRoute("/despesas")({
  ssr: false,
  component: DespesasLayout,
});

function DespesasLayout() {
  const matchRoute = useMatchRoute();
  if (matchRoute({ to: "/despesas", fuzzy: false })) {
    return <Navigate to="/despesas/anuais" replace />;
  }
  return <Outlet />;
}
