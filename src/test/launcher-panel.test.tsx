import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
vi.mock("@/lib/finance/transaction-trace.functions",()=>({ getTransactionTrace:vi.fn() }));
vi.mock("@tanstack/react-start",()=>({useServerFn:(fn:unknown)=>fn}));
vi.mock("@/lib/finance/launcher.functions",()=>({getLauncherState:vi.fn(async()=>({available:false,launches:[],usedTransactionIds:[],message:"Modo de análise: gravação pendente."})),saveLaunch:vi.fn(),undoLaunch:vi.fn()}));
vi.mock("@/lib/finance/revenue.functions",()=>({getRevenue:vi.fn(async()=>({sources:[{id:"source",title:"BPC"}],entries:[{id:"entry",source_id:"source",title:"BPC",due_date:"2026-11-17",expected_cents:162000,received_date:null}]}))}));
vi.mock("@/components/finance/ContractForm",()=>({ContractForm:()=> <div role="dialog">Formulário de contrato parcelado</div>}));
vi.mock("@/components/finance/RevenueForms",()=>({NewRevenueDialog:()=> <div role="dialog">Nova fonte</div>,ReceiveDialog:({entry}:any)=> <div role="dialog">Recebimento existente {entry.id}</div>}));
import { getTransactionTrace } from "@/lib/finance/transaction-trace.functions";
import { LaunchPanel } from "@/components/finance/launcher/LaunchPanel";
import { saveLaunch, getLauncherState, undoLaunch } from "@/lib/finance/launcher.functions";
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
  fireEvent.change(screen.getByLabelText("O que foi comprado ou consumido?"),{target:{value:"Celular"}});
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
  fireEvent.change(screen.getByLabelText("Operação"),{target:{value:"income"}});
  fireEvent.change(screen.getByLabelText("Fonte pagadora"),{target:{value:"card"}});
  expect(screen.getByLabelText("Credor")).toHaveValue("Pix Cartão Parcelado");
  expect(screen.getByLabelText("Credor")).toHaveAttribute("readonly");
  fireEvent.change(screen.getByLabelText("Total cobrado no cartão (R$)"),{target:{value:"1200,00"}});
  fireEvent.change(screen.getByLabelText("Valor líquido recebido (R$)"),{target:{value:"1000,00"}});
  fireEvent.change(screen.getByLabelText("Cartão de origem"),{target:{value:"card"}});
  fireEvent.change(screen.getByLabelText("Conta de destino"),{target:{value:"bank"}});
  fireEvent.change(screen.getByLabelText("Quantidade total de parcelas"),{target:{value:"12"}});
  fireEvent.change(screen.getByLabelText("Data da operação"),{target:{value:"2026-11-17"}});
  fireEvent.change(screen.getByLabelText("Vencimento da primeira fatura"),{target:{value:"2026-12-10"}});
  fireEvent.click(screen.getByRole("button",{name:"Conferir prévia"}));
  expect(screen.getByText(/Entrada:.*1.000,00.*Custo:.*200,00/)).toBeInTheDocument();expect(screen.getByText("12/12")).toBeInTheDocument();
 });
 it("oferece só Receita e Despesa e abre o contrato pela fonte pagadora",async()=>{
   mount();await screen.findByText("Modo de análise: gravação pendente.");fireEvent.click(screen.getByRole("button",{name:"Lançar movimentação"}));
   expect([...screen.getByLabelText<HTMLSelectElement>("Operação").options].map(o=>o.text)).toEqual(["Receita","Despesa"]);
   fireEvent.change(screen.getByLabelText("Operação"),{target:{value:"income"}});
   fireEvent.change(screen.getByLabelText("Fonte pagadora"),{target:{value:"contracts"}});
   expect(await screen.findByText("Formulário de contrato parcelado")).toBeInTheDocument();
 });
 it("fonte existente distingue uma nova renda da baixa de um compromisso",async()=>{
   mount();await screen.findByText("Modo de análise: gravação pendente.");fireEvent.click(screen.getByRole("button",{name:"Lançar movimentação"}));
   fireEvent.change(screen.getByLabelText("Operação"),{target:{value:"income"}});
   await screen.findByRole("option",{name:"BPC"});fireEvent.change(screen.getByLabelText("Fonte pagadora"),{target:{value:"source"}});
   fireEvent.click(screen.getByRole("button",{name:"Registrar recebimento existente"}));
   fireEvent.click(screen.getByRole("button",{name:/17\/11\/2026/}));
   expect(screen.getByText("Recebimento existente entry")).toBeInTheDocument();expect(saveLaunch).not.toHaveBeenCalled();
 });

 it("abre a origem da transação e identifica a conta que pagou a fatura",async()=>{
   const id="c46061e2-e4e3-48d0-8760-d55157c2d37b";
   vi.mocked(getLauncherState).mockResolvedValueOnce({available:true,launches:[{id,title:"Celular",kind:"expense",date:"2026-11-19",totalCents:100000,status:"forecast"}],usedTransactionIds:[],message:null} as any);
   vi.mocked(getTransactionTrace).mockResolvedValueOnce({event:null,obligations:[{creditor:"Caixa SIM",period:"2026-12",expected:10000,closed_total:10000,
     items:[{title:"Celular",merchant:"Loja teste",date:"2026-11-19",instrument:"Caixa SIM",number:1,count:10,cents:10000,included:false}],
     payments:[{date:"2026-12-10",cents:10000,settled:true,account:"Conta BTG"}]}]});
   mount();fireEvent.click(await screen.findByRole("button",{name:"Celular"}));
   expect(await screen.findByText(/Saída de Conta BTG/)).toBeInTheDocument();
   expect(screen.getByText(/Loja teste.*1\/10/)).toBeInTheDocument();
   expect(getTransactionTrace).toHaveBeenCalledWith({data:{launchId:id}});
 });
 it("libera Salvar com o banco ativo e oferece desfazer no histórico",async()=>{
   const id="c46061e2-e4e3-48d0-8760-d55157c2d37b";
   vi.mocked(getLauncherState).mockImplementationOnce(async()=>({available:true,launches:[{id,title:"Operação salva",kind:"expense",date:"2026-11-17",totalCents:10000,status:"settled",canUndo:true}],usedTransactionIds:[],message:null}) as any);
   vi.mocked(undoLaunch).mockResolvedValueOnce({id,undone:true});
   mount();fireEvent.click(await screen.findByRole("button",{name:"Desfazer"}));
   fireEvent.click(screen.getByRole("button",{name:"Confirmar desfazimento"}));
   await screen.findByRole("button",{name:"Lançar movimentação"});
   expect(undoLaunch).toHaveBeenCalledWith({data:{launchId:id}});
 });

});
