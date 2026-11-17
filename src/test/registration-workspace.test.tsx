import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@tanstack/react-router",()=>({Link:({children,to,...props}:any)=><a href={to} {...props}>{children}</a>}));
vi.mock("@tanstack/react-start",()=>({useServerFn:(fn:unknown)=>fn}));
vi.mock("@/components/AppShell",()=>({useRequireUser:()=>({email:"test@example.com"})}));
vi.mock("@/components/finance/PayDialog",()=>({PayDialog:({target}:any)=>target?<div role="dialog">Pagamento de {target.creditor}</div>:null}));
vi.mock("@/components/finance/AttachmentButton",()=>({AttachmentButton:()=>null}));
vi.mock("@/components/finance/RevenueForms",()=>({ReceiveDialog:({entry}:any)=><div role="dialog">Recebimento de {entry.title}</div>}));
vi.mock("@/lib/finance/finance.functions",()=>({
  getMonthExpenses:vi.fn(async()=>({bills:[{id:"bill",creditor:"Conta de água",expected_cents:10000,due_date:"2026-11-07",paid_date:null,paid_cents:null}],kpis:{expected:10000,paid:0,covered:0,open:10000,count:1},reviewFlags:[]})),
  getConsumptionForPeriod:vi.fn(async()=>({total:10000,missing:[]})),
  addManualBill:vi.fn(),previewBulkSettlement:vi.fn(),confirmBulkSettlement:vi.fn(),
}));
vi.mock("@/lib/finance/revenue.functions",()=>({
  getRevenue:vi.fn(async()=>({entries:[{id:"income",title:"Salário",due_date:"2026-11-05",expected_cents:300000,received_date:null,received_cents:null}]})),
  createRevenue:vi.fn(),
}));
import { RegistrationWorkspace } from "@/components/finance/RegistrationWorkspace";
import { getMonthExpenses } from "@/lib/finance/finance.functions";
import { getRevenue } from "@/lib/finance/revenue.functions";
function mount(type:"despesas"|"receitas") {
  const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
  render(<QueryClientProvider client={client}><RegistrationWorkspace type={type} initialYear={2026}/></QueryClientProvider>);
}
afterEach(()=>{cleanup();vi.clearAllMocks();vi.useRealTimers();});
describe("registro isolado por módulo",()=>{
  it("abre despesas com todas as ações e sem seletor de tipo ou consulta de receitas",async()=>{
    vi.setSystemTime(new Date("2026-11-17T12:00:00Z"));mount("despesas");
    expect(await screen.findByText("Conta de água")).toBeInTheDocument();
    expect(screen.getByRole("heading",{name:"Registro de pagamento"})).toBeInTheDocument();
    expect(screen.queryByLabelText("Tipo do registro")).not.toBeInTheDocument();
    expect(screen.getByRole("button",{name:"Quitar pagamentos existentes"})).toBeInTheDocument();
    expect(getRevenue).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button",{name:"Confirmar pagamento"}));
    expect(screen.getByRole("dialog")).toHaveTextContent("Pagamento de Conta de água");
  });
  it("abre recebimentos somente com informações de receitas",async()=>{
    vi.setSystemTime(new Date("2026-11-17T12:00:00Z"));mount("receitas");
    expect(await screen.findByText("Salário")).toBeInTheDocument();
    expect(screen.getByRole("heading",{name:"Registro de recebimento"})).toBeInTheDocument();
    expect(getMonthExpenses).not.toHaveBeenCalled();
    expect(screen.queryByRole("button",{name:"Quitar pagamentos existentes"})).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button",{name:"Confirmar recebimento"}));
    expect(screen.getByRole("dialog")).toHaveTextContent("Recebimento de Salário");
  });
});
