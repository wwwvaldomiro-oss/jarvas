import { useEffect, useRef, type HTMLAttributes } from 'react';
import { createPortal } from 'react-dom';
let locks = 0;
let previousOverflow = '';
/** Portal avoids transformed page containers clipping fixed windows. */
export function ViewportOverlay({children,className = '',...props}: HTMLAttributes<HTMLDivElement>) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    if (locks++ === 0) {previousOverflow = document.body.style.overflow;document.body.style.overflow = 'hidden';}
    const node = root.current;
    const fields = () => Array.from(node?.querySelectorAll<HTMLElement>('input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), a[href], [tabindex="0"]') ?? []).filter(el => el.getClientRects().length > 0);
    const first = node?.querySelector<HTMLElement>('input:not([disabled]), select:not([disabled]), textarea:not([disabled])') ?? fields()[0];
    first?.focus({preventScroll:true});
    const trap = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const elements = fields(), first = elements[0], last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) {event.preventDefault();last?.focus();}
      else if (!event.shiftKey && document.activeElement === last) {event.preventDefault();first?.focus();}
    };
    node?.addEventListener('keydown',trap);
    return () => {node?.removeEventListener('keydown',trap);if (--locks === 0) document.body.style.overflow = previousOverflow;previousFocus?.focus({preventScroll:true});};
  }, []);
  if (typeof document === 'undefined') return null;
  return createPortal(<div ref={root} className={`viewport-overlay fleet-module-root ${className}`} {...props}>{children}</div>,document.body);
}
