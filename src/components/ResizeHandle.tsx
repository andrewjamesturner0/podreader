import { useCallback } from 'react';
import './ResizeHandle.css';

interface Props {
  direction: 'horizontal' | 'vertical';
  onResize: (delta: number) => void;
}

export default function ResizeHandle({ direction, onResize }: Props) {
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    const startPos = direction === 'horizontal' ? e.clientX : e.clientY;
    let lastPos = startPos;

    document.body.style.userSelect = 'none';
    document.body.style.cursor = direction === 'horizontal' ? 'col-resize' : 'row-resize';

    const onMove = (me: PointerEvent) => {
      const current = direction === 'horizontal' ? me.clientX : me.clientY;
      const delta = current - lastPos;
      lastPos = current;
      onResize(delta);
    };

    const onUp = () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }, [direction, onResize]);

  return (
    <div
      className={`resize-handle resize-handle-${direction}`}
      onPointerDown={handlePointerDown}
    />
  );
}
