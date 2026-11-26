import { PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from 'react';

import { Page, usePages } from './pdf';
import { Field, PlaceInfo } from './types';

type Placed = Field & { id: number };
type Drag = { kind: 'draw' | 'move' | 'resize'; fid: number; el: HTMLElement; scale: number; height: number; start: { x: number; y: number }; field?: Placed };

const SIZE: Record<string, [number, number]> = { signature: [198, 24], date: [198, 24], initials: [60, 24], text: [198, 20] };

/**
 * Draw fields on any PDF. Drag on a page to draw a box; click a box to select it;
 * drag it to move, drag its corner to resize. A popover on the selected box sets
 * what it is and who fills it. Fields are kept in PDF points from the bottom-left,
 * the same shape latex-kit writes to .form.json.
 */
export function Place({ id }: { id: string }) {
  const api = (path = '') => `/api/place/${id}${path}`;
  const [info, setInfo] = useState<PlaceInfo | null>(null);
  const [fields, setFields] = useState<Placed[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [type, setType] = useState('signature');
  const [who, setWho] = useState('signer1');
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const drag = useRef<Drag | null>(null);

  useEffect(() => {
    fetch(api()).then(async (r) => {
      const data = await r.json();
      if (!r.ok) return setError(data.error);
      setInfo(data);
      setFields((data as PlaceInfo).fields.map((f, i) => ({ ...f, id: i + 1 })));
    });
  }, []);
  const pages = usePages(info && { url: api('/pdf') }, info?.title);

  const update = (fid: number, change: Partial<Placed>) => setFields((all) => all.map((f) => (f.id === fid ? { ...f, ...change } : f)));
  const remove = (fid: number) => {
    setFields((all) => all.filter((f) => f.id !== fid));
    setSelected(null);
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selected && !/INPUT|SELECT/.test(document.activeElement?.tagName ?? '')) remove(selected);
      if (e.key === 'Escape') setSelected(null);
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [selected]);

  if (error) return <main className="note"><h1>Can't open this PDF</h1><p>{error}</p></main>;
  if (!info) return <main className="note"><p>Loading…</p></main>;

  const save = async () => {
    const r = await fetch(api(), { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ fields: fields.map(({ id: _, ...f }) => f) }) });
    const data = await r.json();
    setNote(r.ok ? `Saved ${data.saved} ${data.saved === 1 ? 'field' : 'fields'} to ${data.file}` : data.error);
  };

  /** Pointer position in PDF points (bottom-left origin) for the page under the pointer. */
  const at = (e: ReactPointerEvent, el: HTMLElement, scale: number, height: number) => {
    const box = el.getBoundingClientRect();
    return { x: (e.clientX - box.left) / scale, y: height - (e.clientY - box.top) / scale };
  };
  const roles = [...new Set(fields.map((f) => f.who))];

  return (
    <>
      <header className="bar">
        <div>
          <strong>{info.title}</strong>
          <span className="who">Drag on a page to draw a field. Click a field to change it.</span>
        </div>
        <div className="row">
          <label className="pick">New field <select value={type} onChange={(e) => setType(e.target.value)}>{info.types.map((t) => <option key={t}>{t}</option>)}</select></label>
          <label className="pick">for <input list="roles" value={who} onChange={(e) => setWho(e.target.value.replace(/[^\w-]/g, ''))} size={10} /></label>
          <datalist id="roles">{roles.map((r) => <option key={r} value={r} />)}</datalist>
          <button className="button" onClick={save}>Save {fields.length} {fields.length === 1 ? 'field' : 'fields'}</button>
        </div>
      </header>
      {note && <p className="status ok">{note}</p>}

      <main className="pages">
        {pages.map((page, i) => (
          <Page
            key={i}
            page={page}
            onPointerDown={(e) => {
              if ((e.target as HTMLElement).closest('.box, .popover')) return;
              const el = e.currentTarget;
              const scale = el.offsetWidth / page.getViewport({ scale: 1 }).width;
              const height = page.getViewport({ scale: 1 }).height;
              const p = at(e, el, scale, height);
              const fid = Math.max(0, ...fields.map((f) => f.id)) + 1;
              // a plain click drops a standard-size box; a drag draws one
              setFields((all) => [...all, { id: fid, type, who: who || 'signer1', page: i + 1, x: p.x, y: p.y - SIZE[type][1], width: SIZE[type][0], height: SIZE[type][1] }]);
              setSelected(fid);
              drag.current = { kind: 'draw', fid, el, scale, height, start: p };
              el.setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              const d = drag.current;
              if (!d) return;
              const p = at(e, d.el, d.scale, d.height);
              if (d.kind === 'draw') {
                if (Math.abs(p.x - d.start.x) < 6 && Math.abs(p.y - d.start.y) < 6) return;
                update(d.fid, { x: Math.min(p.x, d.start.x), y: Math.min(p.y, d.start.y), width: Math.abs(p.x - d.start.x), height: Math.abs(p.y - d.start.y) });
              } else if (d.field && d.kind === 'move') update(d.fid, { x: d.field.x + p.x - d.start.x, y: d.field.y + p.y - d.start.y });
              else if (d.field) {
                // the top edge stays put while the bottom-right corner is dragged
                const h = Math.max(10, d.field.height - (p.y - d.start.y));
                update(d.fid, { width: Math.max(12, d.field.width + p.x - d.start.x), height: h, y: d.field.y + d.field.height - h });
              }
            }}
            onPointerUp={() => {
              drag.current = null;
            }}
          >
            {(scale, height) => fields.filter((f) => f.page === i + 1).map((f) => (
              <div key={f.id}>
                <div
                  className={`box placed ${f.id === selected ? 'selected' : ''}`}
                  style={{ left: f.x * scale, top: (height - f.y - f.height) * scale, width: f.width * scale, height: f.height * scale }}
                  onPointerDown={(e) => {
                    const el = e.currentTarget.closest('.page') as HTMLElement;
                    setSelected(f.id);
                    drag.current = { kind: (e.target as HTMLElement).classList.contains('grip') ? 'resize' : 'move', fid: f.id, field: f, el, scale, height, start: at(e, el, scale, height) };
                    el.setPointerCapture(e.pointerId);
                  }}
                >
                  {f.label || f.type} · {f.who}
                  <span className="grip" />
                </div>
                {f.id === selected && (
                  <div className="popover" style={{ left: f.x * scale, top: (height - f.y) * scale + 6 }}>
                    <select value={f.type} onChange={(e) => update(f.id, { type: e.target.value })}>{info.types.map((t) => <option key={t}>{t}</option>)}</select>
                    <input list="roles" value={f.who} onChange={(e) => update(f.id, { who: e.target.value.replace(/[^\w-]/g, '') })} size={10} aria-label="Who fills this field" />
                    {f.type === 'text' && <input value={f.label || ''} onChange={(e) => update(f.id, { label: e.target.value })} size={12} placeholder="Label" aria-label="What to type here" />}
                    <button onClick={() => remove(f.id)}>Delete</button>
                  </div>
                )}
              </div>
            ))}
          </Page>
        ))}
      </main>
    </>
  );
}
