export type AccountMovement = {version:1;accountId:string;accountName:string;direction:"debit"|"credit"};
const MARKER="\n[ÓRION_MOVIMENTO_V1]";
export function unpackMovementNote(value:string|null|undefined):{note:string;movement:AccountMovement|null}{
  const note=value??"",at=note.lastIndexOf(MARKER);
  if(at<0)return {note,movement:null};
  try{
    const parsed=JSON.parse(note.slice(at+MARKER.length));
    if(parsed.version!==1||typeof parsed.accountId!=="string"||!parsed.accountId||typeof parsed.accountName!=="string"||!["debit","credit"].includes(parsed.direction))return {note,movement:null};
    return {note:note.slice(0,at),movement:parsed};
  }catch{return {note,movement:null};}
}
export function packMovementNote(note:string,movement:AccountMovement,maxLength:number){
  const result=unpackMovementNote(note).note+MARKER+JSON.stringify(movement);
  if(result.length>maxLength)throw new Error("Reduza a observação para guardar também a conta vinculada.");
  return result;
}
export function movementDelta(cents:number,direction:"debit"|"credit"){
  if(!Number.isSafeInteger(cents)||cents<0)throw new Error("Valor de movimentação inválido.");
  return direction==="debit"?-cents:cents;
}
export function visibleMovementNote(value:string|null|undefined){
  const {note,movement}=unpackMovementNote(value);
  return [note,movement?`${movement.direction==="debit"?"Saída de":"Entrada em"}: ${movement.accountName}`:""].filter(Boolean).join(" · ");
}
