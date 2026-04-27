import type { RefObject } from 'react';
import { useEffect } from 'react';

const MIRROR_STYLE_PROPERTIES = [
  'box-sizing',
  'border-left-width',
  'border-right-width',
  'border-top-width',
  'border-bottom-width',
  'font-family',
  'font-size',
  'font-style',
  'font-variant',
  'font-weight',
  'letter-spacing',
  'line-height',
  'padding-left',
  'padding-right',
  'padding-top',
  'padding-bottom',
  'text-indent',
  'text-transform',
  'white-space',
  'word-break',
  'overflow-wrap',
] as const;

function getCursorOffsetTop(el: HTMLTextAreaElement, position: number): number {
  const style = window.getComputedStyle(el);
  const mirror = document.createElement('div');
  const marker = document.createElement('span');

  for (const property of MIRROR_STYLE_PROPERTIES) {
    mirror.style.setProperty(property, style.getPropertyValue(property));
  }

  mirror.style.position = 'absolute';
  mirror.style.left = '-9999px';
  mirror.style.top = '0';
  mirror.style.width = `${el.clientWidth}px`;
  mirror.style.height = 'auto';
  mirror.style.visibility = 'hidden';
  mirror.style.overflow = 'hidden';
  mirror.style.whiteSpace = 'pre-wrap';

  mirror.textContent = el.value.slice(0, position);
  marker.textContent = '\u200b';
  mirror.appendChild(marker);
  document.body.appendChild(mirror);

  const offsetTop = marker.offsetTop;
  document.body.removeChild(mirror);
  return offsetTop;
}

export function useTypewriterScroll(
  editorRef: RefObject<HTMLTextAreaElement | null>,
  enabled: boolean,
): void {
  useEffect(() => {
    const el = editorRef.current;
    if (!enabled || !el) return;

    let frameId = 0;
    const recenter = () => {
      window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(() => {
        const cursorTop = getCursorOffsetTop(el, el.selectionStart);
        const targetTop = Math.max(0, cursorTop - el.clientHeight / 2);
        el.scrollTo({ top: targetTop, behavior: 'smooth' });
      });
    };

    el.addEventListener('input', recenter);
    el.addEventListener('keyup', recenter);
    el.addEventListener('click', recenter);

    recenter();

    return () => {
      window.cancelAnimationFrame(frameId);
      el.removeEventListener('input', recenter);
      el.removeEventListener('keyup', recenter);
      el.removeEventListener('click', recenter);
    };
  }, [enabled, editorRef]);
}
