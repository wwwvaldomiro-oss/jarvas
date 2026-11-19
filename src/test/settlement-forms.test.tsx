import {afterEach,describe,it,expect,vi} from "vitest";
import {cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {QueryClient,QueryClientProvider} from "@tanstack/react-query";
vi.mock("@/lib/finance/transaction-trace.functions",()=>({ getTransactionTrace:vi.fn() }));
vi.mock("@tanstack/react-start",()=>({useServerFn:(fn:unknown)=>fn}));
vi.mock("@/components/finance/launcher/SettlementAccount",async()=>{
  const {useState}=await import("react");
  return {useSettlementAccount:()=>{const [accountId,setAccountId]=useState("");return {accountId,setAccountId,available:true,legacy:true,accounts:[],error:null};},SettlementAccountField:({value,onChange,flow}:any)=><label>{flow==="payment"?"Conta de origem":"Conta de destino"}<select value={value} onChange={e=>onChange(e.target.value)}><option value="">Selecione</option><option value="bank">Conta BTG</option></select></label>};
});
vi.mock("@/lib/finance/launcher.functions",()=>({recordAccountSettlement:vi.fn(async()=>({ok:true}))}));
vi.mock("@/lib/finance/finance.functions",()=>({payBillFn:vi.fn(),payInstallmentFn:vi.fn(),reviseBillFn:vi.fn(),reviseInstallmentFn:vi.fn(),uploadAttachment:vi.fn()}));
vi.mock("@/lib/finance/revenue.functions",()=>({receiveRevenue:vi.fn(),uploadRevenueFile:vi.fn(),createRevenue:vi.fn(),editRevenue:vi.fn(),createRevenueContract:vi.fn(),adjustRevenue:vi.fn()}));
import {PayDialog} from "@/components/finance/PayDialog";
import {ReceiveDialog} from "@/components/finance/RevenueForms";
import {recordAccountSettlement} from "@/lib/finance/launcher.functions";
import {payBillFn} from "@/lib/finance/finance.functions";
function mount(child:React.ReactNode){vi.stubGlobal("crypto",{randomUUID:()=>"c46061e2-e4e3-48d0-8760-d55157c2d37b"});render(<QueryClientProvider client={new QueryClient()}>{child}</QueryClientProvider>);}
afterEach(()=>{cleanup();vi.clearAllMocks();vi.unstubAllGlobals();});
describe("confirmação dos formulários existentes",()=>{
 it("conclui pagamento com conta e quitação integral selecionada, sem criar outra despesa",async()=>{
   const onSaved=vi.fn();mount(<PayDialog target={{kind:"bill",id:"bill",creditor:"Cartão Nubank",due_date:"2026-12-14",expected_cents:26662,paid_date:null,paid_cents:null,note:null}} onClose={()=>{}} onSaved={onSaved}/>);
   expect(screen.getByRole("checkbox",{name:"Quita"})).toBeChecked();
   fireEvent.change(screen.getByLabelText("Conta de origem"),{target:{value:"bank"}});fireEvent.click(screen.getByRole("button",{name:"Confirmar pagamento"}));
   await waitFor(()=>expect(onSaved).toHaveBeenCalledOnce());expect(recordAccountSettlement).toHaveBeenCalledWith({data:expect.objectContaining({kind:"bill",id:"bill",accountId:"bank",cents:26662,quits:true,revision:false})});expect(payBillFn).not.toHaveBeenCalled();
 });
 it("conclui recebimento BPC com a conta de destino no mesmo registro",async()=>{
   const onSaved=vi.fn();mount(<ReceiveDialog entry={{id:"bpc",title:"BPC",due_date:"2026-11-17",expected_cents:162000,received_date:null,received_cents:null,note:"",adjustment:null} as any} onClose={()=>{}} onSaved={onSaved}/>);
   fireEvent.change(screen.getByLabelText("Conta de destino"),{target:{value:"bank"}});fireEvent.click(screen.getByRole("button",{name:"Confirmar"}));
   await waitFor(()=>expect(onSaved).toHaveBeenCalledOnce());expect(recordAccountSettlement).toHaveBeenCalledWith({data:expect.objectContaining({kind:"revenue",id:"bpc",accountId:"bank",cents:162000})});
 });
});
