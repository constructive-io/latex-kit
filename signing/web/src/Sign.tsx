import { FormEvent, useState } from 'react';

import { Page, usePages } from './pdf';
import { SignaturePad } from './SignaturePad';
import { SignInfo } from './types';

const today = () => new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

/** Asks the browser where the signer is. Never blocks signing: a refusal is recorded as a refusal. */
type Where = { latitude: number; longitude: number; accuracy: number } | { declined: string };

function whereAmI(): Promise<Where> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve({ declined: 'unsupported' });
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ latitude: p.coords.latitude, longitude: p.coords.longitude, accuracy: p.coords.accuracy }),
      (e) => resolve({ declined: e.code === 1 ? 'denied' : e.code === 3 ? 'timeout' : 'unavailable' }),
      { timeout: 10000, maximumAge: 60000 },
    );
  });
}

export function Sign({ token }: { token: string }) {
  const api = (path = '') => `/api/sign/${token}${path}`;
  const [code, setCode] = useState('');
  const [info, setInfo] = useState<SignInfo | null>(null);
  const [gate, setGate] = useState<{ needCode: boolean; message?: string | null }>({ needCode: true, message: null }); // the access-code screen
  const [error, setError] = useState<string | null>(null);
  const [signature, setSignature] = useState<string | null>(null); // PNG data URL
  const [padOpen, setPadOpen] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [values, setValues] = useState<Record<number, string>>({}); // what was typed into text and initials boxes, by field index
  const [busy, setBusy] = useState<string | null>(null);
  const [termsOpen, setTermsOpen] = useState(false);
  const [declined, setDeclined] = useState(false);
  const [version, setVersion] = useState(0); // bumps to reload the PDF after signing

  const call = async (path = '', options: RequestInit = {}): Promise<{ ok: boolean; status: number; data: any }> => {
    const r = await fetch(api(path), { ...options, headers: { 'x-access-code': code, ...(options.body ? { 'content-type': 'application/json' } : {}) } });
    return { ok: r.ok, status: r.status, data: r.headers.get('content-type')?.includes('json') ? await r.json() : await r.blob() };
  };

  const open = async (e?: FormEvent) => {
    e?.preventDefault();
    const r = await call().catch(() => null);
    if (!r) return setError('Could not reach the signing server.');
    if (r.ok) {
      setGate({ needCode: false });
      return setInfo(r.data);
    }
    if (r.data.needCode && r.status === 401) return setGate({ needCode: true, message: code ? r.data.error : null });
    setError(r.data.error);
  };

  const pages = usePages(info && { url: `${api('/pdf')}?v=${version}`, httpHeaders: { 'x-access-code': code } }, `${info?.title}-${version}`);

  if (error) return <main className="note"><h1>Can't open this document</h1><p>{error}</p></main>;
  if (declined) return <main className="note"><h1>You declined to sign</h1><p>The sender has been told. Nobody can sign this document now.</p></main>;
  if (gate.needCode)
    return (
      <main className="note">
        <h1>Enter your access code</h1>
        <p>The sender gave you a 6-digit code separately from this link.</p>
        <form onSubmit={open}>
          <input className="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} autoFocus />
          <button className="button" disabled={code.length !== 6}>Open document</button>
        </form>
        {gate.message && <p className="bad">{gate.message}</p>}
      </main>
    );
  if (!info) return <main className="note"><p>Loading…</p></main>;

  const done = Boolean(info.signer.signedAt);
  const typedBoxes = info.fields.filter((f) => f.type === 'text' || f.type === 'initials');
  const needsSignature = info.fields.some((f) => f.type === 'signature' || f.type === 'date');
  const ready = (signature || !needsSignature) && typedBoxes.every((f) => (values[f.index] || '').trim());
  const finish = async () => {
    setBusy('Checking your location…');
    const where = await whereAmI();
    setBusy('Signing…');
    const r = await call('', { method: 'POST', body: JSON.stringify({ signaturePng: signature, agreed, termsVersion: info.terms.version, location: where, values }) });
    setBusy(null);
    if (!r.ok) return setError(r.data.error);
    setInfo(r.data);
    setVersion((v) => v + 1);
  };
  const decline = async () => {
    const reason = window.prompt('Decline to sign? Nobody will be able to sign this document afterwards. You can say why:');
    if (reason === null) return;
    const r = await call('/decline', { method: 'POST', body: JSON.stringify({ reason }) });
    if (r.ok) setDeclined(true);
    else setError(r.data.error);
  };
  const download = async () => {
    const r = await call('/pdf');
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(r.data), download: `${info.title}.pdf` });
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <>
      <header className="bar">
        <div>
          <strong>{info.title}</strong>
          <span className="who">Signing as {info.signer.name} ({info.signer.who})</span>
        </div>
        <div className="row">
          <button className="plain" onClick={download}>Download {info.completed ? 'signed copy' : 'a copy'}</button>
          {!done && <button className="plain" onClick={decline}>Decline</button>}
          {!done && <button className="button" disabled={!ready || !!busy} onClick={() => setTermsOpen(true)}>{busy || 'Finish signing'}</button>}
        </div>
      </header>

      {done ? (
        <p className="status ok">
          You signed this document.{' '}
          {info.completed ? 'Everyone has signed; the last page is the signing certificate.' : `Still waiting for: ${info.others.filter((o) => !o.signed).map((o) => o.name).join(', ')}.`}
        </p>
      ) : (
        <p className="status hint">Fill in every yellow box, then Finish signing.</p>
      )}

      <main className="pages">
        {pages.map((page, i) => (
          <Page key={`${version}-${i}`} page={page}>
            {(scale, height) =>
              !done && info.fields.filter((f) => f.page === i + 1).map((f) => {
                const style = { left: f.x * scale, top: (height - f.y - f.height) * scale, width: f.width * scale, height: f.height * scale };
                if (f.type === 'text' || f.type === 'initials')
                  return (
                    <input
                      key={f.index}
                      className={`box typed-in ${f.type} ${values[f.index] ? 'filled' : ''}`}
                      style={{ ...style, fontSize: Math.min(15, f.height * scale * 0.6) }}
                      placeholder={f.label || (f.type === 'initials' ? 'Initials' : 'Type here')}
                      maxLength={f.type === 'initials' ? 6 : 200}
                      value={values[f.index] || ''}
                      onChange={(e) => setValues((v) => ({ ...v, [f.index]: e.target.value }))}
                    />
                  );
                return (
                  <button key={f.index} className={`box ${f.type} ${signature ? 'filled' : ''}`} style={style} onClick={() => f.type !== 'date' && setPadOpen(true)}>
                    {f.type === 'date' ? (signature ? today() : 'Date') : signature ? <img src={signature} alt="Your signature" /> : 'Sign here'}
                  </button>
                );
              })
            }
          </Page>
        ))}
      </main>

      {termsOpen && (
        <div className="veil" onClick={() => setTermsOpen(false)}>
          <div className="dialog terms" role="dialog" aria-modal="true" aria-label="Signing terms" onClick={(e) => e.stopPropagation()}>
            <h2>Before you sign</h2>
            <ul>{info.terms.text.map((t, i) => <li key={i}>{t}</li>)}</ul>
            <label><input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} /> I agree to these terms.</label>
            <p className="hint">Next, your browser will ask to share your location. You can say no and still sign; that is recorded too.</p>
            <div className="actions">
              <button onClick={() => setTermsOpen(false)}>Back</button>
              <button className="button" disabled={!agreed} onClick={() => {
                setTermsOpen(false);
                finish();
              }}>Agree and sign</button>
            </div>
          </div>
        </div>
      )}

      {padOpen && <SignaturePad name={info.signer.name} onCancel={() => setPadOpen(false)} onDone={(png) => {
        if (png) setSignature(png);
        setPadOpen(false);
      }} />}
    </>
  );
}

