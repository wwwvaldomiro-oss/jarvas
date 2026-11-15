export type InstallmentTx = {
  id:string;description:string;date:string;amount:number;type:"DEBIT"|"CREDIT";
  billForecastDate?:string|null;billPostDate?:string|null;
  creditCardMetadata?:{installmentNumber?:number|null;totalInstallments?:number|null;
    billForecastDate?:string|null;billPostDate?:string|null}|null;
  installmentNumber?:number|null;totalInstallments?:number|null;
};
export type ForecastMonth={year:number;month:number;expected_cents:number;installments:number};
const valid=(n:unknown):n is number=>typeof n==="number"&&Number.isInteger(n)&&n>0;
const monthDate=(value:unknown)=>typeof value==="string"&&/^\d{4}-(0[1-9]|1[0-2])(-\d{2})?/.test(value)?value:null;
const invoiceDate=(t:InstallmentTx)=>
  monthDate(t.creditCardMetadata?.billForecastDate)??monthDate(t.billForecastDate)??
  monthDate(t.creditCardMetadata?.billPostDate)??monthDate(t.billPostDate)??monthDate(t.date);
const installmentNumber=(t:InstallmentTx)=>t.creditCardMetadata?.installmentNumber??t.installmentNumber;
const installmentTotal=(t:InstallmentTx)=>t.creditCardMetadata?.totalInstallments??t.totalInstallments;

/**
 * Projeção informativa. A competência da fatura prevalece sobre a data da compra.
 * Um grupo pode conter duas compras distintas com mesmo nome, parcela e valor.
 * Conservamos essa multiplicidade ao comparar a maior quantidade de lançamentos
 * observada por número de parcela, sem somar novamente as parcelas anteriores.
 */
export function projectCardInstallments(txs:InstallmentTx[],fromYear:number,maxYear=fromYear+10):ForecastMonth[]{
  const groups=new Map<string,InstallmentTx[]>();
  for(const tx of txs){
    const n=installmentNumber(tx), total=installmentTotal(tx);
    if(!valid(n)||!valid(total)||n>total||total>120||tx.type!=="DEBIT"||
      !Number.isFinite(tx.amount)||tx.amount===0||!invoiceDate(tx))continue;
    const cents=Math.round(Math.abs(tx.amount)*100);
    const name=tx.description.trim().toLowerCase().replace(/\b\d{1,3}\s*\/\s*\d{1,3}\b/g,"").replace(/\s+/g," ");
    const key=`${name}:${cents}:${total}`;
    groups.set(key,[...(groups.get(key)??[]),tx]);
  }
  const sums=new Map<string,ForecastMonth>();
  for(const group of groups.values()){
    const byNumber=new Map<number,InstallmentTx[]>();
    for(const tx of group){
      const n=installmentNumber(tx)!;
      const entries=byNumber.get(n)??[];
      // Evita repetir o mesmo evento do provedor nas consultas paginadas.
      if(!entries.some(existing=>existing.id===tx.id))entries.push(tx);
      byNumber.set(n,entries);
    }
    // Se o banco reportar várias compras idênticas no mesmo período, preserva todas.
    const count=Math.max(...[...byNumber.values()].map(entries=>entries.length));
    const slots:Array<InstallmentTx[]> = Array.from({length:count},()=>[]);
    for(const entries of byNumber.values()){
      entries.sort((a,b)=>(invoiceDate(b)??"").localeCompare(invoiceDate(a)??"")||b.id.localeCompare(a.id));
      entries.forEach((tx,i)=>{slots[i]?.push(tx);});
    }
    for(const slot of slots){
      slot.sort((a,b)=>(installmentNumber(b)??0)-(installmentNumber(a)??0)||
        (invoiceDate(b)??"").localeCompare(invoiceDate(a)??""));
      const tx=slot[0];if(!tx)continue;
      const n=installmentNumber(tx)!,total=installmentTotal(tx)!;
      const effective=invoiceDate(tx)!;
      const [year0,month0]=effective.split("-").map(Number);
      for(let step=1;step<=total-n;step++){
        const offset=month0-1+step,year=year0+Math.floor(offset/12),month=offset%12+1;
        if(year<fromYear||year>maxYear)continue;
        const key=`${year}-${month}`,old=sums.get(key);
        sums.set(key,{year,month,expected_cents:(old?.expected_cents??0)+Math.round(Math.abs(tx.amount)*100),installments:(old?.installments??0)+1});
      }
    }
  }
  return [...sums.values()].sort((a,b)=>a.year-b.year||a.month-b.month);
}
