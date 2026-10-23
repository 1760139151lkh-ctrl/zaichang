import { useLayoutEffect, useRef, type RefObject } from 'react';

const pieces = '.interactive-paper, .interactive-graphic, .interactive-text, .interactive-formula, .presentation-map-slot, .presentation-figure, .presentation-weather, .presentation-planning, .presentation-note';

/** Reveal actual newly delivered content, never a simulated progress timeline. */
export function usePublicationReveal(root: RefObject<HTMLDivElement | null>, live: boolean) {
  const seen = useRef(new Set<string>());
  const seenElements = useRef(new WeakSet<Element>());
  useLayoutEffect(() => {
    const element = root.current;
    if (!element) return;
    const preference = matchMedia('(prefers-reduced-motion: reduce)');
    const animations = new Set<Animation>();
    const finish = () => { animations.forEach(animation => animation.finish()); animations.clear(); };
    const reveal = () => {
      const candidates = [...element.querySelectorAll<HTMLElement>(pieces)].filter(piece => {
        const key = piece.dataset.programNode ? `node:${piece.dataset.programNode}` : piece.dataset.sceneId ? `scene:${piece.dataset.sceneId}` : undefined;
        if (key ? seen.current.has(key) : seenElements.current.has(piece)) return false;
        if (key) seen.current.add(key); else seenElements.current.add(piece);
        return true;
      });
      const delivered = new Set<Element>(candidates);
      let order = 0;
      for (const piece of candidates) {
        let ancestor = piece.parentElement?.closest(pieces), covered = false;
        while (ancestor && element.contains(ancestor)) {
          if (delivered.has(ancestor)) { covered = true; break; }
          ancestor = ancestor.parentElement?.closest(pieces);
        }
        if (covered) continue;
        const bounds = piece.getBoundingClientRect();
        if (!live || preference.matches || document.documentElement.dataset.motion === 'reduced' || document.hidden || bounds.bottom < 0 || bounds.top > innerHeight) continue;
        const animation = piece.animate([{ opacity: .3, transform: 'translateY(7px)' }, { opacity: 1, transform: 'translateY(0)' }],
          { duration: 300, delay: Math.min(order++ * 55, 165), easing: 'cubic-bezier(.2,.7,.2,1)' });
        animations.add(animation); animation.onfinish = () => animations.delete(animation);
      }
    };
    reveal();
    const observer = new MutationObserver(reveal);
    observer.observe(element, { childList: true, subtree: true });
    const motionPreference = new MutationObserver(finish);
    motionPreference.observe(document.documentElement, { attributes: true, attributeFilter: ['data-motion'] });
    element.addEventListener('pointerdown', finish, true); element.addEventListener('keydown', finish, true);
    element.addEventListener('wheel', finish, { passive: true }); preference.addEventListener('change', finish);
    return () => {
      observer.disconnect(); motionPreference.disconnect(); animations.forEach(animation => animation.cancel());
      element.removeEventListener('pointerdown', finish, true); element.removeEventListener('keydown', finish, true);
      element.removeEventListener('wheel', finish); preference.removeEventListener('change', finish);
    };
  }, [root, live]);
}
