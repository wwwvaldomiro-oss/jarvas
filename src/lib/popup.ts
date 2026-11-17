/** Native dialog top layer keeps confirmations visible above any form or header. */
function popup(message:string,mode:'confirm'|'prompt'|'alert',initial=''):Promise<string|null> {
  return new Promise(resolve=>{
    const dialog = document.createElement('dialog');
    dialog.className = 'orion-system-popup';
    const form = document.createElement('form');form.method = 'dialog';
    const title = document.createElement('h2');title.textContent = mode === 'prompt' ? 'Preencher informação' : mode === 'confirm' ? 'Confirmar ação' : 'Aviso';title.style.cssText='font-size:18px;font-weight:600;margin-bottom:12px';
    const text = document.createElement('p');text.textContent=message;text.style.cssText='white-space:pre-wrap;line-height:1.6;margin-bottom:20px';
    form.append(title,text);
    const input = document.createElement('input');
    if(mode==='prompt'){input.value=initial;input.setAttribute('aria-label',message);input.style.cssText='width:100%;padding:12px;border:1px solid #E7E1D5;border-radius:8px;margin-bottom:20px';form.append(input);}
    const actions=document.createElement('div');actions.style.cssText='display:flex;justify-content:flex-end;gap:12px;flex-wrap:wrap';
    if(mode!=='alert'){const cancel=document.createElement('button');cancel.type='button';cancel.textContent='Cancelar';cancel.style.cssText='padding:10px 16px;border:1px solid #E7E1D5;border-radius:8px';cancel.onclick=()=>dialog.close('cancel');actions.append(cancel);}
    const ok=document.createElement('button');ok.type='submit';ok.textContent=mode==='alert'?'OK':'Confirmar';ok.style.cssText='padding:10px 16px;background:#173D4A;color:white;border-radius:8px';actions.append(ok);form.append(actions);dialog.append(form);document.body.append(dialog);
    const previous=document.activeElement as HTMLElement|null;
    form.onsubmit=e=>{e.preventDefault();dialog.close('ok');};
    dialog.onclose=()=>{const value=dialog.returnValue==='ok'?(mode==='prompt'?input.value:'ok'):null;dialog.remove();previous?.focus({preventScroll:true});resolve(value);};
    dialog.showModal();if(mode==='prompt'){input.focus();input.select();}else ok.focus();
  });
}
export const confirmAction = async (message:string) => (await popup(message,'confirm'))!==null;
export const promptValue = (message:string,initial='') => popup(message,'prompt',initial);
export const showAlert = async (message:string) => {await popup(message,'alert');};
