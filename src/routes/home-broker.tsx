import { LaunchPanel } from "@/components/finance/launcher/LaunchPanel";
import { getLauncherCreditors } from "@/lib/finance/launcher.functions";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { RefreshCw, ArrowUpRight, Lock, Unlock, CalendarDays, BadgeCheck } from "lucide-react";
import { AppShell, useRequireUser } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { formatBRL } from "@/lib/finance/money";
import { getContracts, getAnnualDebtTotals, getCardLimitOverrides, saveCardLimitOverride, clearCardLimitOverride } from "@/lib/finance/finance.functions";
import { getFinances } from "@/lib/pluggy.functions";
import { getFinanceAccountProfiles } from "@/lib/finance/card-profile.functions";
import { MicroBar, MicroRing } from "@/components/finance/MicroChart";

export const Route = createFileRoute("/home-broker")({
  ssr: false,
  component: HomeBroker,
  head: () => ({ meta: [{ title: "Painel Financeiro — Axion" }] }),
});


function Sparkline({values,label}: {values:number[];label:string}) {
  const nums=values.map(v=>Number.isFinite(v)?Math.max(0,v):0);
  if(!nums.length) return null;
  const max=Math.max(...nums,1);
  const coords=nums.map((v,i)=>({
    x:nums.length===1?50:4+i*92/(nums.length-1),
    y:27-23*v/max,
  }));
  const points=coords.map(p=>`${p.x},${p.y}`).join(" ");
  return <svg viewBox="0 0 100 32" className="mt-3 h-9 w-full text-current opacity-75"
    preserveAspectRatio="none" role="img" aria-label={`Evolução de ${label}`}>
    <path d="M4 29 H96" fill="none" stroke="currentColor" strokeOpacity=".18" strokeWidth=".8" />
    <polyline points={points} fill="none" stroke="currentColor" strokeWidth="1.7"
      strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    {coords.length===1 && <circle cx={coords[0]!.x} cy={coords[0]!.y} r="2" fill="currentColor" />}
  </svg>;
}

function Kpi({ label, value, emphasis, bar, ring, trend }: {
  label: string; value: string; emphasis?: boolean; bar?: number | undefined;
  ring?: number | undefined; trend?: number[] | undefined;
}) {
  return <div className={`axion-kpi rounded-2xl border p-3 ${emphasis ? "axion-kpi-featured bg-primary text-primary-foreground" : "bg-card"}`}>
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="axion-kpi-label">{label}</p>
        <p className="mt-2 text-lg font-extrabold tracking-tight xl:text-xl">{value}</p>
      </div>
      {ring != null && <MicroRing value={ring} />}
    </div>
    {bar != null && <MicroBar value={bar} tone={emphasis ? "light" : "gold"} />}
    {trend && <Sparkline values={trend} label={label} />}
  </div>;
}

function HomeBroker() {
  const user = useRequireUser();
  const client = useQueryClient();
  const now = new Date();
  const currentExercise = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", year: "numeric" }).format(now));
  const creditorsFn = useServerFn(getLauncherCreditors);
  const creditorsQuery = useQuery({queryKey:["launcher-creditors",user?.email],queryFn:()=>creditorsFn(),enabled:!!user});
  const walletFn = useServerFn(getFinances);
  const contractsFn = useServerFn(getContracts);
  const annualDebtFn = useServerFn(getAnnualDebtTotals);
  const overrideFn = useServerFn(getCardLimitOverrides);
  const saveOverrideFn = useServerFn(saveCardLimitOverride);
  const clearOverrideFn = useServerFn(clearCardLimitOverride);
  const [cardsUnlocked, setCardsUnlocked] = useState(false);
  const [cardDrafts, setCardDrafts] = useState<Record<string, { limit: string; used: string }>>({});
  const [savingCard, setSavingCard] = useState<string | null>(null);
  const overrides = useQuery({ queryKey: ["card-limit-overrides", user?.email], queryFn: () => overrideFn(), enabled: !!user });
  const effective = (card: { id: string; creditLimit: number; available: number }) => {
    const manual = overrides.data?.find(item => item.account_id === card.id);
    return { limit: manual?.limit_cents ?? Math.round(card.creditLimit * 100), used: manual?.used_cents ?? Math.round(Math.max(0, card.creditLimit - card.available) * 100), manual: !!manual };
  };
  const unlockCards = () => {
    if (cardsUnlocked) { setCardsUnlocked(false); setCardDrafts({}); return; }
    setCardDrafts(Object.fromEntries(cards.map(card => {
      const value = effective(card);
      return [card.id, { limit: (value.limit / 100).toFixed(2), used: (value.used / 100).toFixed(2) }];
    })));
    setCardsUnlocked(true);
  };
  const saveCard = async (id: string) => {
    const value = cardDrafts[id];
    if (!value) return;
    const limit = Number(value.limit.replace(",", "."));
    const used = Number(value.used.replace(",", "."));
    if (!Number.isFinite(limit) || !Number.isFinite(used) || limit < 0 || used < 0 || used > limit) {
      toast.error("Informe valores válidos; utilizado não pode exceder o limite."); return;
    }
    setSavingCard(id);
    try {
      await saveOverrideFn({ data: { accountId: id, limitCents: Math.round(limit * 100), usedCents: Math.round(used * 100) } });
      await client.invalidateQueries({ queryKey: ["card-limit-overrides"] });
      toast.success("Ajuste manual salvo sem modificar os valores do Open Finance.");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Falha ao salvar."); }
    finally { setSavingCard(null); }
  };
  const restoreCard = async (id: string) => {
    setSavingCard(id);
    try {
      await clearOverrideFn({ data: { accountId: id } });
      await client.invalidateQueries({ queryKey: ["card-limit-overrides"] });
      const card = cards.find(item => item.id === id);
      if (card) setCardDrafts(prev => ({ ...prev, [id]: { limit: card.creditLimit.toFixed(2), used: Math.max(0, card.creditLimit - card.available).toFixed(2) } }));
      toast.success("Valores de Open Finance restaurados.");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Falha ao restaurar."); }
    finally { setSavingCard(null); }
  };
  const contracts = useQuery({ queryKey: ["home-broker-contracts"], queryFn: () => contractsFn({ data: { includeArchived: false } }), enabled: !!user });
  const wallet = useQuery({ queryKey: ["finances"], queryFn: () => walletFn(), enabled: !!user });
  const profileFn = useServerFn(getFinanceAccountProfiles);
  const profiles = useQuery({ queryKey: ["finance-profiles"], queryFn: () => profileFn(), enabled: !!user });
  const annualDebt = useQuery({ queryKey: ["annual-debt-totals", user?.email, currentExercise], queryFn: () => annualDebtFn(), enabled: !!user });
  const cards = [...new Map((wallet.data?.accounts?.filter(a => a.type === "CREDIT") ?? []).map(card => [card.id, card])).values()];
  const limits = useMemo(() => cards.reduce((acc, card) => {
    const manual = overrides.data?.find(item => item.account_id === card.id);
    return {
      limit: acc.limit + (manual?.limit_cents ?? Math.round(card.creditLimit * 100)),
      used: acc.used + (manual?.used_cents ?? Math.round(Math.max(0, card.creditLimit - card.available) * 100)),
    };
  }, { limit: 0, used: 0 }), [cards, overrides.data]);
  // DASH 1: somente Despesas Anuais do ano vigente. Não usa filtros do DASH 2.
  const financialReady = !!annualDebt.data && !annualDebt.error;
  const consumptionReady = financialReady && !annualDebt.data?.migrationRequired;
  const debtTotal = annualDebt.data?.expected ?? 0;
  const debtPaid = annualDebt.data?.paid ?? 0;
  const debtOpen = annualDebt.data?.open ?? 0;
  const pct = annualDebt.data?.pct ?? 0;
  const consumption = annualDebt.data?.consumption;
  const debtMonths = annualDebt.data?.debtTrend ?? [];
  const consumptionMonths = annualDebt.data?.consumptionTrend ?? [];
  const refresh = () => { void client.invalidateQueries(); };
  return <AppShell active="home-broker" user={user}>
    <div className="mx-auto max-w-[1600px] space-y-6 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-[#a47c3e] dark:text-[#d9b76f]">Painel Financeiro</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link to="/receitas"><Button variant="outline">Receitas <ArrowUpRight className="size-4" /></Button></Link>
          <Link to="/despesas/anuais"><Button variant="outline">Despesas anuais <ArrowUpRight className="size-4" /></Button></Link>
          <Button variant="outline" onClick={() => { refresh(); void client.invalidateQueries({ queryKey: ["finances"] }); }}><RefreshCw className="size-4" /> Atualizar</Button>
        </div>
      </div>
      {profiles.data?.available === false && (
        <p role="alert" className="rounded-lg border border-amber-500/40 p-3 text-sm">
          Perfis e vínculos dos cartões indisponíveis neste banco. A migração
          20261107140000_finance_card_profiles_invoices.sql precisa ser aplicada
          antes da sincronização de faturas. Os demais registros permanecem acessíveis.
        </p>
      )}
      <LaunchPanel ownerKey={user?.email??""} accounts={wallet.data?.accounts??[]} transactions={wallet.data?.transactions??[]}
        profiles={profiles.data?.profiles??[]} creditors={creditorsQuery.data??[]} connectionError={wallet.error?.message??wallet.data?.error??creditorsQuery.error?.message??null} />
      <section className="rounded-2xl border bg-card p-4 shadow-soft">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <CalendarDays className="size-5 text-primary" />
          <h2 className="text-xl font-bold">Resumo Anual</h2>
        </div>
        <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <div className="min-w-0">
            <div className="mb-2">
              <h3 className="font-bold">Compromissos apurados para: {annualDebt.data?.year ?? currentExercise}</h3>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <Kpi label="Total das dívidas" value={financialReady ? formatBRL(debtTotal) : "—"} emphasis bar={financialReady ? 100 - pct : undefined} trend={financialReady ? debtMonths.map(x=>x.expected) : undefined} />
              <Kpi label="Total já pago" value={financialReady ? formatBRL(debtPaid) : "—"} bar={financialReady ? pct : undefined} trend={financialReady ? debtMonths.map(x=>x.paid) : undefined} />
              <Kpi label="Saldo devedor" value={financialReady ? formatBRL(debtOpen) : "—"} bar={financialReady ? 100 - pct : undefined} trend={financialReady ? debtMonths.map(x=>x.open) : undefined} />
              <Kpi label="% quitado" value={financialReady ? `${pct}%` : "—"} ring={financialReady ? pct : undefined} trend={financialReady ? debtMonths.map(x=>x.expected>0 ? (x.expected-x.open)/x.expected*100 : 0) : undefined} />
            </div>
          </div>
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <BadgeCheck className="size-4 text-primary" />
              <h3 className="font-bold">Apuração de Consumo</h3>
              <span className="text-xs text-muted-foreground">Água, luz, internet, gás e outros</span>
            </div>
            <div className="grid gap-2">
              <Kpi label="Consumo apurado" value={consumptionReady ? formatBRL(consumption?.apurado ?? 0) : "—"} trend={consumptionReady ? consumptionMonths.map(x=>x.apurado) : undefined} />
            </div>
          </div>
        </div>
        {annualDebt.data?.migrationRequired && (
          <p role="alert" className="mt-3 rounded-lg border border-amber-500/40 p-3 text-sm">
            Classificação de consumo indisponível: a migração do banco ainda não foi aplicada.
            Os valores de dívidas são provisórios e os indicadores de consumo não serão mostrados como zero.
            Acesse Despesas Anuais para classificar os credores após a migração.
          </p>
        )}
        {annualDebt.error && (
          <p role="alert" className="mt-3 rounded-lg border border-destructive/30 p-3 text-sm text-destructive">
            Não foi possível consolidar Despesas Anuais: {annualDebt.error.message}. Valores não foram apresentados como zero.
          </p>
        )}
      </section>

      <section className="rounded-2xl border bg-card p-4 shadow-soft">
        <div className="mb-3 flex items-center justify-between gap-3"><h2 className="font-bold">Contratos Parcelados</h2>
          <Link to="/despesas/parceladas" className="text-sm font-semibold text-primary underline">Ver contratos de despesas</Link></div>
        {contracts.error && <p role="alert" className="text-sm text-destructive">Não foi possível consultar os contratos.</p>}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-sm">
            <thead className="bg-muted text-left text-xs uppercase text-muted-foreground"><tr>
              <th className="p-3">Dívida</th><th className="p-3">Valor total</th><th className="p-3">Já pago</th>
              <th className="p-3">Saldo atual</th><th className="p-3">% pago</th><th className="p-3">Restantes</th>
            </tr></thead>
            <tbody className="divide-y">
              {contracts.isLoading && <tr><td colSpan={6} className="p-4 text-center">Carregando contratos…</td></tr>}
              {!contracts.isLoading && contracts.data?.length === 0 && <tr><td colSpan={6} className="p-4 text-center text-muted-foreground">Nenhum contrato parcelado cadastrado.</td></tr>}
              {(contracts.data ?? []).map((c: { id: string; name: string; kpis: { total: number; paid: number; remaining: number; count: number; paidCount: number } }) => <tr key={c.id}>
                <td className="p-3 font-semibold">{c.name}</td>
                <td className="p-3">{formatBRL(c.kpis.total)}</td><td className="p-3">{formatBRL(c.kpis.paid)}</td>
                <td className="p-3">{formatBRL(c.kpis.remaining)}</td><td className="p-3">{c.kpis.total ? (100 * c.kpis.paid / c.kpis.total).toFixed(1) : "0,0"}%</td>
                <td className="p-3">{Math.max(0, c.kpis.count - c.kpis.paidCount)}</td>
              </tr>)}
            </tbody>
          </table>
        </div>
      </section>
      <section className="rounded-2xl border bg-card p-4 shadow-soft">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 className="font-bold">Cartões — limite utilizado</h2>
            <button type="button" aria-label={cardsUnlocked ? "Bloquear edição dos cartões" : "Desbloquear edição dos cartões"} title={cardsUnlocked ? "Bloquear edição" : "Liberar edição manual"} aria-pressed={cardsUnlocked} onClick={unlockCards} className="rounded-full border p-2 hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary">
              {cardsUnlocked ? <Unlock className="size-4" /> : <Lock className="size-4" />}
            </button>
          </div>
          <Link to="/painel" className="text-sm font-semibold text-primary underline">Abrir Carteira</Link>
        </div>
        {wallet.error && <p role="alert" className="text-sm text-destructive">Dados dos cartões indisponíveis.</p>}
        {overrides.error && <p role="alert" className="text-sm text-destructive">Ajustes manuais indisponíveis: {overrides.error.message}</p>}
        {cards.length === 0 && !wallet.isLoading && <p className="text-sm text-muted-foreground">Nenhum cartão disponível.</p>}
        {cardsUnlocked && <p className="mb-3 text-xs text-muted-foreground">Edite e salve cada cartão. Os ajustes manuais ficam separados dos valores bancários até você restaurar a origem Open Finance.</p>}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
              <tr><th className="p-3">Cartão</th><th className="p-3">Limite</th><th className="p-3">Utilizado</th><th className="p-3">Disponível</th><th className="p-3">% utilizado</th>{cardsUnlocked && <th className="p-3">Ações</th>}</tr>
            </thead>
            <tbody className="divide-y">
              {cards.map(card => {
                const value = effective(card);
                const available = Math.max(0, value.limit - value.used);
                const percentage = value.limit > 0 ? Math.min(100, 100 * value.used / value.limit) : 0;
                const draft = cardDrafts[card.id] ?? { limit: (value.limit / 100).toFixed(2), used: (value.used / 100).toFixed(2) };
                return <tr key={card.id}>
                  <td className="p-3 font-semibold">{profiles.data?.profiles.find(p => p.account_id === card.id)?.display_name || card.name}{value.manual && <span className="ml-2 text-xs font-normal text-muted-foreground">Ajuste manual</span>}</td>
                  <td className="p-3">{cardsUnlocked ? <input aria-label={`Limite do cartão ${card.name}`} className="w-28 rounded-md border bg-background p-2" inputMode="decimal" value={draft.limit} onChange={e => setCardDrafts(prev => ({...prev, [card.id]: {...draft, limit: e.target.value}}))} /> : formatBRL(value.limit)}</td>
                  <td className="p-3">{cardsUnlocked ? <input aria-label={`Valor utilizado do cartão ${card.name}`} className="w-28 rounded-md border bg-background p-2" inputMode="decimal" value={draft.used} onChange={e => setCardDrafts(prev => ({...prev, [card.id]: {...draft, used: e.target.value}}))} /> : formatBRL(value.used)}</td>
                  <td className="p-3">{formatBRL(available)}</td>
                  <td className="p-3"><div className="flex items-center gap-2"><div className="h-2 w-20 rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${percentage}%` }} /></div><span>{percentage.toFixed(1)}%</span></div></td>
                  {cardsUnlocked && <td className="p-3"><div className="flex flex-wrap gap-1"><Button size="sm" disabled={savingCard === card.id || !!overrides.error} onClick={() => void saveCard(card.id)}>Salvar</Button>{value.manual && <Button size="sm" variant="outline" disabled={savingCard === card.id} onClick={() => void restoreCard(card.id)}>Restaurar Open Finance</Button>}</div></td>}
                </tr>;
              })}
            </tbody>
            <tfoot className="bg-muted font-semibold"><tr>
              <td className="p-3">Total</td><td className="p-3">{formatBRL(limits.limit)}</td><td className="p-3">{formatBRL(limits.used)}</td>
              <td className="p-3">{formatBRL(Math.max(0, limits.limit - limits.used))}</td>
              <td className="p-3">{limits.limit ? (100 * limits.used / limits.limit).toFixed(1) : "0,0"}%</td>{cardsUnlocked && <td />}
            </tr></tfoot>
          </table>
        </div>
      </section>
    </div>
  </AppShell>;
}
