/**
 * Houdt het document op iOS echt stil: Safari laat een pagina altijd 'meebewegen'
 * (rubber band) bij een veeg, ook als er niets te scrollen valt. We blokkeren de
 * veeg op documentniveau en laten hem alleen door binnen een element dat zelf kan
 * scrollen in die richting (de schil, de schermbody, pop-ups, carrousel).
 * Aan te zetten door elk redesign-scherm (body.rd-theme), met teller zodat
 * overlappende schermen elkaar niet uitschakelen.
 */
let users = 0;
let startY = 0;
let startX = 0;

function scrollableAncestor(el: Element | null, dy: number, dx: number): boolean {
  let node: Element | null = el;
  while (node && node !== document.body) {
    const cs = getComputedStyle(node);
    const oy = /auto|scroll/.test(cs.overflowY);
    const ox = /auto|scroll/.test(cs.overflowX);
    if (oy && node.scrollHeight > node.clientHeight + 1) {
      const atTop = node.scrollTop <= 0;
      const atBottom = node.scrollTop + node.clientHeight >= node.scrollHeight - 1;
      // Naar beneden vegen (dy > 0) scrolt omhoog: alleen zinvol als we niet bovenaan staan.
      if ((dy > 0 && !atTop) || (dy < 0 && !atBottom)) return true;
    }
    if (ox && node.scrollWidth > node.clientWidth + 1 && Math.abs(dx) > Math.abs(dy)) return true;
    node = node.parentElement;
  }
  return false;
}

function onTouchStart(e: TouchEvent) {
  startY = e.touches[0]?.clientY ?? 0;
  startX = e.touches[0]?.clientX ?? 0;
}
function onTouchMove(e: TouchEvent) {
  const t = e.touches[0]; if (!t) return;
  const dy = t.clientY - startY;
  const dx = t.clientX - startX;
  const target = e.target as Element | null;
  if (target?.closest('input, textarea, select, [contenteditable]')) return;
  if (!scrollableAncestor(target, dy, dx)) e.preventDefault();
}

export function lockDocument(): () => void {
  document.body.classList.add('rd-theme');
  if (users++ === 0) {
    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchmove', onTouchMove, { passive: false });
  }
  return () => {
    if (--users === 0) {
      document.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('touchmove', onTouchMove);
      document.body.classList.remove('rd-theme');
    }
  };
}
