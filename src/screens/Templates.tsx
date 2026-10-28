import { useEffect, useMemo, useState } from 'react';
import { go } from '../lib/nav';
import { newEstimateData, normalizeMeasurements } from '../lib/estimate';
import { materialOrderText, workOrderText } from '../lib/orders';
import { KIND_TITLES, PLACEHOLDERS, defaultTemplate, type CompanyInfo, type OrderKind, type OrderTemplate } from '../lib/templates';
import { loadTemplates, saveTemplate, type TemplateSet } from '../lib/templatesDb';

const SAMPLE = normalizeMeasurements({ area: 2000, waste: 10, steepShare: 0, starter: 200, ridgeCap: 60, leakBarrierLF: 200, leakBarrierWidth: 3, dripEdge: 200 });

export default function Templates() {
  const [set, setSet] = useState<TemplateSet | null>(null);
  const [kind, setKind] = useState<OrderKind>('material_order');
  const [tpl, setTpl] = useState<OrderTemplate | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  useEffect(() => {
    loadTemplates().then((s) => { setSet(s); setTpl(s.material_order); }).catch((e) => setErr(e.message));
  }, []);

  const preview = useMemo(() => {
    if (!tpl) return '';
    const e = newEstimateData(SAMPLE, 'Sample');
    const ctx = { address: '123 Sample St (preview)', customerName: 'Sample Customer', jobId: '00000000-0000', deliveryDate: '' };
    return kind === 'work_order' ? workOrderText(e, ctx, tpl.showPrices, tpl) : materialOrderText(e, ctx, tpl.showPrices, tpl);
  }, [tpl, kind]);

  if (!set || !tpl)
    return <div className="page"><button className="btn ghost small" onClick={() => go('/')}>‹ Board</button>{err ? <div className="error pad-x">{err}</div> : <p className="muted pad-x">Loading…</p>}</div>;

  const up = (p: Partial<OrderTemplate>) => { setTpl({ ...tpl, ...p }); setDirty(true); setMsg(''); };
  const upC = (k: keyof CompanyInfo, v: string) => up({ company: { ...tpl.company, [k]: v } });
  const switchKind = (k: OrderKind) => {
    if (k === kind) return;
    if (dirty && !confirm('Discard unsaved template changes?')) return;
    setKind(k); setTpl(set[k]); setDirty(false); setMsg(''); setErr('');
  };

  async function save() {
    if (!tpl || !set) return;
    setBusy(true); setErr('');
    try {
      await saveTemplate(kind, tpl);
      setSet({ ...set, [kind]: tpl, saved: { ...set.saved, [kind]: true } });
      setDirty(false);
      setMsg(`${KIND_TITLES[kind]} template saved. New orders start from it.`);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  const other: OrderKind = kind === 'work_order' ? 'material_order' : 'work_order';
  async function copyCompany() {
    if (!tpl || !set || !confirm(`Copy this company header into the ${KIND_TITLES[other]} template and save it?`)) return;
    setBusy(true); setErr('');
    try {
      const o = { ...set[other], company: { ...tpl.company } };
      await saveTemplate(other, o);
      setSet({ ...set, [other]: o, saved: { ...set.saved, [other]: true } });
      setMsg(`Company header copied to ${KIND_TITLES[other]}.`);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  const ta = (label: string, k: 'intro' | 'notes' | 'signature' | 'footer', rows = 4) => (
    <label>{label}<textarea rows={rows} value={tpl[k]} onChange={(e) => up({ [k]: e.target.value } as Partial<OrderTemplate>)} /></label>
  );

  return (
    <div className="page">
      <header className="topbar">
        <button className="btn ghost small" onClick={() => (!dirty || confirm('Leave without saving?')) && go('/')}>‹ Board</button>
        <h1 className="title-sm">Order templates</h1>
        <span />
      </header>
      <div className="row gap pad-x seg">
        {(['material_order', 'work_order'] as OrderKind[]).map((k) => (
          <button key={k} className={`btn grow ${k === kind ? 'primary' : ''}`} onClick={() => switchKind(k)}>{KIND_TITLES[k]}</button>
        ))}
      </div>
      <p className="pad-x muted small">{set.saved[kind] ? 'Saved team template.' : 'Using the built-in starting template (not saved yet).'} Each order can still be edited before you email or print it.</p>

      <div className="card stack">
        <h2>Company header</h2>
        <p className="muted small">Shown at the top of every {KIND_TITLES[kind].toLowerCase()}. Empty fields are left out.</p>
        <label>Company name<input value={tpl.company.name} onChange={(e) => upC('name', e.target.value)} /></label>
        <label>Phone<input type="tel" inputMode="tel" placeholder="(not set)" value={tpl.company.phone} onChange={(e) => upC('phone', e.target.value)} /></label>
        <label>Email<input type="email" inputMode="email" placeholder="(not set)" value={tpl.company.email} onChange={(e) => upC('email', e.target.value)} /></label>
        <label>Address<input placeholder="(not set)" value={tpl.company.address} onChange={(e) => upC('address', e.target.value)} /></label>
        <label>License no.<input placeholder="(not set)" value={tpl.company.license} onChange={(e) => upC('license', e.target.value)} /></label>
        <button className="btn ghost small" disabled={busy} onClick={copyCompany}>Copy header to {KIND_TITLES[other]} template</button>
      </div>

      <div className="card stack">
        <h2>Text</h2>
        <label>Title<input value={tpl.title} onChange={(e) => up({ title: e.target.value })} /></label>
        {ta('Intro / greeting (above the items)', 'intro', 5)}
        {ta('Notes / terms (below the items)', 'notes')}
        {ta('Signature block', 'signature', 3)}
        {ta('Footer', 'footer', 3)}
        <label className="check"><input type="checkbox" checked={tpl.showPrices} onChange={(e) => up({ showPrices: e.target.checked })} /> Show prices by default</label>
        <details>
          <summary className="muted small">Placeholders you can type</summary>
          <ul className="small phlist">
            {PLACEHOLDERS.map((p) => <li key={p.key}><code>{`{{${p.key}}}`}</code> — {p.help}</li>)}
          </ul>
        </details>
        <button className="btn ghost small" onClick={() => confirm('Reset this template to the built-in starting text? (Not saved until you tap Save.)') && (setTpl(defaultTemplate(kind)), setDirty(true))}>Reset to starting text</button>
      </div>

      <div className="card">
        <h2>Preview (sample job)</h2>
        <pre className="rawtext preview">{preview}</pre>
      </div>

      {err && <div className="error pad-x">{err}</div>}
      {msg && <div className="ok pad-x">{msg}</div>}
      <div className="actions">
        <button className="btn primary" disabled={busy || (!dirty && set.saved[kind])} onClick={save}>{busy ? "Saving…" : dirty || !set.saved[kind] ? `Save ${KIND_TITLES[kind].toLowerCase()} template` : 'Saved ✓'}</button>
      </div>
    </div>
  );
}
