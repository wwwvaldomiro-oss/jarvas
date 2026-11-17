import React from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ViewportOverlay } from './viewport-overlay';
afterEach(cleanup);
describe('Janelas no viewport',()=>{
 it('sai do contêiner transformado e mantém o primeiro campo acessível',()=>{
  const view=render(<div style={{transform:'translateY(0)'}}><ViewportOverlay><div role="dialog"><input aria-label="Placa" /><button>Salvar</button></div></ViewportOverlay></div>);
  const input=view.getByLabelText('Placa');
  expect(input.closest('.viewport-overlay')?.parentElement).toBe(document.body);
  expect(document.activeElement).toBe(input);
  expect(document.body.style.overflow).toBe('hidden');
  view.unmount();
  expect(document.body.style.overflow).not.toBe('hidden');
 });
 it('mantém o bloqueio de rolagem enquanto existir outra janela',()=>{
  const first=render(<ViewportOverlay><div>Primeira</div></ViewportOverlay>);
  const second=render(<ViewportOverlay><div>Segunda</div></ViewportOverlay>);
  second.unmount();expect(document.body.style.overflow).toBe('hidden');
  first.unmount();expect(document.body.style.overflow).not.toBe('hidden');
 });
});
