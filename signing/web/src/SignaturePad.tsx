import { useEffect, useRef, useState } from 'react';
import Pad from 'signature_pad';

/** Crops a canvas to its ink, so the signature fills its box instead of floating in white space. */
function trimmed(canvas: HTMLCanvasElement): string | null {
  const { width, height } = canvas;
  const px = canvas.getContext('2d')!.getImageData(0, 0, width, height).data;
  let x0 = width;
  let y0 = height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      if (px[(y * width + x) * 4 + 3] > 8) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  if (x1 < 0) return null;
  const pad = 4;
  const out = document.createElement('canvas');
  out.width = x1 - x0 + 1 + pad * 2;
  out.height = y1 - y0 + 1 + pad * 2;
  out.getContext('2d')!.drawImage(canvas, x0, y0, x1 - x0 + 1, y1 - y0 + 1, pad, pad, x1 - x0 + 1, y1 - y0 + 1);
  return out.toDataURL('image/png');
}

/** Draw a signature, or type a name and have it set in a script face. Gives back a PNG data URL. */
interface Props {
  name: string;
  onDone: (png: string | null) => void;
  onCancel: () => void;
}

export function SignaturePad({ name, onDone, onCancel }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const pad = useRef<Pad | null>(null);
  const [mode, setMode] = useState('draw');
  const [typed, setTyped] = useState(name);

  useEffect(() => {
    const c = canvas.current!;
    c.width = c.offsetWidth * devicePixelRatio;
    c.height = c.offsetHeight * devicePixelRatio;
    c.getContext('2d')!.scale(devicePixelRatio, devicePixelRatio);
    pad.current = new Pad(c, { penColor: '#0a2a6b' });
    return () => pad.current?.off();
  }, [mode]);

  const done = () => {
    if (mode === 'draw') {
      if (!pad.current || pad.current.isEmpty()) return;
      return onDone(trimmed(canvas.current!));
    }
    if (!typed.trim()) return;
    const c = document.createElement('canvas');
    c.width = 900;
    c.height = 220;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#0a2a6b';
    ctx.font = 'italic 110px "Snell Roundhand", "Brush Script MT", "Segoe Script", cursive';
    ctx.textBaseline = 'middle';
    ctx.fillText(typed.trim(), 20, 115, 860);
    onDone(trimmed(c));
  };

  return (
    <div className="veil" onClick={onCancel}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <div className="tabs">
          <button className={mode === 'draw' ? 'on' : ''} onClick={() => setMode('draw')}>Draw</button>
          <button className={mode === 'type' ? 'on' : ''} onClick={() => setMode('type')}>Type</button>
        </div>
        {mode === 'draw' ? (
          <canvas ref={canvas} className="pad" />
        ) : (
          <>
            <canvas ref={canvas} hidden />
            <input className="typed" value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus />
          </>
        )}
        <div className="actions">
          {mode === 'draw' && <button onClick={() => pad.current?.clear()}>Clear</button>}
          <button onClick={onCancel}>Cancel</button>
          <button className="button" onClick={done}>Use this signature</button>
        </div>
      </div>
    </div>
  );
}
