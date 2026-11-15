import { describe, expect, it } from "vitest";
import { projectCardInstallments } from "./card-installment-forecast";

describe("projeção de compras parceladas por competência",()=>{
  it("prioriza billForecastDate em vez da data da compra",()=>{
    const result=projectCardInstallments([{
      id:"tx-1",description:"Compra",amount:-100,type:"DEBIT",date:"2026-11-15",
      billForecastDate:"2027-01-10",creditCardMetadata:{installmentNumber:1,totalInstallments:3},
    }],2027,2027);
    expect(result).toEqual([
      {year:2027,month:2,expected_cents:10000,installments:1},
      {year:2027,month:3,expected_cents:10000,installments:1},
    ]);
  });
  it("não soma novamente a mesma compra exibida em parcelas consecutivas",()=>{
    const result=projectCardInstallments([
      {id:"tx-1",description:"Compra",amount:-50,type:"DEBIT",date:"2026-11-01",
        billForecastDate:"2026-11-15",installmentNumber:1,totalInstallments:3},
      {id:"tx-2",description:"Compra",amount:-50,type:"DEBIT",date:"2026-12-01",
        billForecastDate:"2026-12-15",installmentNumber:2,totalInstallments:3},
    ],2027,2027);
    expect(result).toEqual([{year:2027,month:1,expected_cents:5000,installments:1}]);
  });
  it("não elimina duas compras diferentes com parcelas de mesmo valor e nome",()=>{
    const result=projectCardInstallments([
      {id:"purchase-a",description:"Amazon",amount:-30,type:"DEBIT",date:"2026-12-01",
        installmentNumber:1,totalInstallments:3},
      {id:"purchase-b",description:"Amazon",amount:-30,type:"DEBIT",date:"2026-12-02",
        installmentNumber:1,totalInstallments:3},
    ],2027,2027);
    expect(result).toEqual([
      {year:2027,month:1,expected_cents:6000,installments:2},
      {year:2027,month:2,expected_cents:6000,installments:2},
    ]);
  });
});
