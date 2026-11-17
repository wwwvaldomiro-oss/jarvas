import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
vi.mock("@tanstack/react-start",()=>({useServerFn:(fn:unknown)=>fn}));
vi.mock("@/lib/finance/launcher.functions",()=>({getLauncherState:vi.fn(async()=>({available:false,launches:[],usedTransactionIds:[],message:"Modo de análise: gravação pendente."})),saveLaunch:vi.fn()}));
import { LaunchPanel } from "@/components/finance/launcher/LaunchPanel";
import { saveLaunch } from "@/lib/finance/launcher.functions";
import type { FinanceAccount } from "@/lib/pluggy.functions";
const card={id:"card",name:"CAIXA SIM MASTERCARD",type:"CREDIT",number:"1234",closingDate:null,dueDate:null} as FinanceAccount;
const bank={id:"bank",name:"Conta corrente",type:"BANK",number:"5678"} as FinanceAccount;
function mount(){
  vi.stubGlobal("crypto",{randomUUID:()=>"c46061e2-e4e3-48d0-8760-d55157c2d37b"});
  render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><LaunchPanel ownerKey="test@example.com" accounts={[card,bank]} transactions={[]} profiles={[]} creditors={[]} connectionError={null}/></QueryClientProvider>);
}
afterEach(()=>{cleanup();vi.clearAllMocks();vi.unstubAllGlobals();});
describe("lançador em modo análise",()=>{
 it("permite testar compra de R$1.000 em 10x e bloqueia gravação sem banco",async()=>{
  mount();await screen.findByText("Modo de análise: gravação pendente.");fireEvent.click(screen.getByRole("button",{name:"Lançar movimentação"}));
  fireEvent.change(screen.getByLabelText("Forma de pagamento"),{target:{value:"card"}});
  fireEvent.change(screen.getByLabelText("Descrição / credor"),{target:{value:"Celular"}});
  fireEvent.change(screen.getByLabelText("Valor total (R$)"),{target:{value:"1000,00"}});
  fireEvent.change(screen.getByLabelText("Cartão de origem"),{target:{value:"card"}});
  fireEvent.change(screen.getByLabelText("Quantidade total de parcelas"),{target:{value:"10"}});
  fireEvent.change(screen.getByLabelText("Data da operação"),{target:{value:"2026-11-17"}});
  fireEvent.change(screen.getByLabelText("Vencimento da primeira fatura"),{target:{value:"2026-12-10"}});
  fireEvent.click(screen.getByRole("button",{name:"Conferir prévia"}));
  expect(screen.getByRole("heading",{name:"Conferir lançamento"})).toBeInTheDocument();
  expect(screen.getByText("10/10")).toBeInTheDocument();expect(screen.getByText("10/09/2027")).toBeInTheDocument();
  expect(screen.getByRole("button",{name:"Salvar lançamento"})).toBeDisabled();expect(saveLaunch).not.toHaveBeenCalled();
 });
 it("mostra crédito recebido e custo separados no financiamento com cartão",async()=>{
  mount();await screen.findByText("Modo de análise: gravação pendente.");fireEvent.click(screen.getByRole("button",{name:"Lançar movimentação"}));
  fireEvent.change(screen.getByLabelText("Operação"),{target:{value:"card_credit"}});
  fireEvent.change(screen.getByLabelText("Descrição / credor"),{target:{value:"Crédito C6"}});
  fireEvent.change(screen.getByLabelText("Total cobrado no cartão (R$)"),{target:{value:"1200,00"}});
  fireEvent.change(screen.getByLabelText("Valor recebido na conta (R$)"),{target:{value:"1000,00"}});
  fireEvent.change(screen.getByLabelText("Cartão de origem"),{target:{value:"card"}});
  fireEvent.change(screen.getByLabelText("Conta de destino"),{target:{value:"bank"}});
  fireEvent.change(screen.getByLabelText("Quantidade total de parcelas"),{target:{value:"12"}});
  fireEvent.change(screen.getByLabelText("Data da operação"),{target:{value:"2026-11-17"}});
  fireEvent.change(screen.getByLabelText("Vencimento da primeira fatura"),{target:{value:"2026-12-10"}});
  fireEvent.click(screen.getByRole("button",{name:"Conferir prévia"}));
  expect(screen.getByText(/Entrada:.*1.000,00.*Custo:.*200,00/)).toBeInTheDocument();expect(screen.getByText("12/12")).toBeInTheDocument();
 });
});
