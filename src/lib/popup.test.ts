import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { confirmAction, promptValue, showAlert } from './popup';
beforeEach(()=>{
 HTMLDialogElement.prototype.showModal = function(){this.setAttribute('open','');};
 HTMLDialogElement.prototype.close = function(value=''){this.returnValue=value;this.dispatchEvent(new Event('close'));};
});
afterEach(()=>{document.body.innerHTML='';vi.restoreAllMocks();});
describe('Confirmações centralizadas',()=>{
 it('cancelar nunca confirma uma ação destrutiva',async()=>{
  const result=confirmAction('Excluir registro?');
  (document.querySelector('button') as HTMLButtonElement).click();
  expect(await result).toBe(false);
  expect(document.querySelector('dialog')).toBeNull();
 });
 it('retorna apenas o texto informado ao confirmar',async()=>{
  const result=promptValue('Nome da pasta','Anterior');
  const input=document.querySelector('input')!;input.value='Novo';
  document.querySelector('form')!.dispatchEvent(new Event('submit',{cancelable:true}));
  expect(await result).toBe('Novo');
 });
 it('exibe mensagens como texto e fecha com OK',async()=>{
  const result=showAlert('<img src=x onerror=alert(1)>');
  expect(document.querySelector('img')).toBeNull();
  document.querySelector('form')!.dispatchEvent(new Event('submit',{cancelable:true}));
  await result;
  expect(document.querySelector('dialog')).toBeNull();
 });
});
