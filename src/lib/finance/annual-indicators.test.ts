import {describe,it,expect} from "vitest";
import {calculateAnnualIndicators} from "./annual-indicators";

const rows=[
  {id:"2026-card",year:2026,creditor:"Cartão C6",expense_source:"card"},
  {id:"2027-card",year:2027,creditor:"Cartão Caixa",expense_source:"card"},
  {id:"2028-contract",year:2028,creditor:"Contrato",expense_source:"contract"},
];
const cells=[
  {annual_expense_id:"2026-card",month:12,expected_cents:10000},
  {annual_expense_id:"2027-card",month:1,expected_cents:20000},
  {annual_expense_id:"2028-contract",month:2,expected_cents:30000},
];
const payments=[
  {source_annual_id:"2026-card",source_period:"2026-12",paid_cents:10000,paid_date:"2026-12-12",is_settled:true},
  {source_annual_id:"2027-card",source_period:"2027-01",paid_cents:5000,paid_date:"2027-01-10",is_settled:false},
];
describe("Compromissos apurados e memorial",()=>{
  it("2026 inclui 2026 em diante e preserva a soma das competências",()=>{
    const result=calculateAnnualIndicators({rows,cells,payments,currentYear:2026,scope:"all"});
    expect(result.expected).toBe(60000);
    expect(result.paid).toBe(15000);
    expect(result.open).toBe(45000);
    expect(result.details.map(d=>d.year)).toEqual([2026,2027,2028]);
    expect(result.details.reduce((s,d)=>s+d.expected,0)).toBe(result.expected);
    expect(result.details.reduce((s,d)=>s+d.paid,0)).toBe(result.paid);
    expect(result.details.reduce((s,d)=>s+d.open,0)).toBe(result.open);
  });
  it("2027 exclui 2026 integralmente, sem remover o histórico",()=>{
    const result=calculateAnnualIndicators({rows,cells,payments,currentYear:2027,scope:"all"});
    expect(result.expected).toBe(50000);
    expect(result.paid).toBe(5000);
    expect(result.open).toBe(45000);
    expect(result.details.map(d=>d.year)).toEqual([2027,2028]);
    expect(result.details[0]).toMatchObject({creditor:"Cartão Caixa",category:"Cartão de crédito",paid:5000,open:15000});
  });
  it("não transfere pagamento efetuado em 2026 para o indicador de 2027",()=>{
    const result=calculateAnnualIndicators({
      rows:[{id:"future",year:2027,creditor:"Contrato",expense_source:"contract"}],
      cells:[{annual_expense_id:"future",month:1,expected_cents:10000}],
      payments:[{source_annual_id:"future",source_period:"2027-01",paid_cents:10000,
        paid_date:"2026-12-20",is_settled:true}],
      currentYear:2027,scope:"all",
    });
    expect(result.expected).toBe(10000);
    expect(result.paid).toBe(0);
    expect(result.open).toBe(10000);
  });
  it("2028 ignora todos os exercícios anteriores",()=>{
    const result=calculateAnnualIndicators({rows,cells,payments,currentYear:2028,scope:"all"});
    expect(result.expected).toBe(30000);
    expect(result.paid).toBe(0);
    expect(result.details).toHaveLength(1);
    expect(result.details[0].category).toBe("Contrato parcelado");
  });
  it("o painel do ano corrente não soma anos futuros",()=>{
    const result=calculateAnnualIndicators({rows,cells,payments,currentYear:2027,scope:"current"});
    expect(result.expected).toBe(20000);
    expect(result.details.map(d=>d.year)).toEqual([2027]);
  });
});
