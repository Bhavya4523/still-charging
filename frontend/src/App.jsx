import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity, ArrowDownRight, ArrowUpRight, BadgeCheck, CalendarDays, Check,
  ChevronDown, CircleHelp, Cloud, CreditCard, FileText, Ghost, Heart, LayoutDashboard,
  LockKeyhole, Menu, MoreHorizontal, Music2, Newspaper, Plus, Search, ShieldCheck,
  Sparkles, TicketCheck, Wallet, X, Clapperboard, Dumbbell, CircleDot
} from 'lucide-react';
import { detectRecurring, normalizeMerchant, parseStatement, sampleTransactions, transactionId } from './parsing.js';

const icons = { Activity, Cloud, Music2, Newspaper, Clapperboard, Dumbbell, CircleDot };
const money = value => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value || 0);
const dateLabel = value => new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(value);
const annualMultiplier = cadence => ({ Weekly: 52, 'Every 2 weeks': 26, Monthly: 12, Quarterly: 4, Annual: 1 })[cadence] || 0;
const safeMerchantDescription = value => String(value || '').trim()
  .replace(/\b\d{1,4}[/-]\d{1,2}[/-]\d{2,4}\b/g, '[date removed]')
  .replace(/(?:₹|\bINR\b|\bUSD\b|\$)\s?[\d,]+(?:\.\d{1,2})?/gi, '[amount removed]')
  .replace(/(?:^|\s)[-+]?\d[\d,]*(?:\.\d{1,2})?(?=\s|$)/g, ' [amount removed] ')
  .replace(/\b(?:x{2,}|\*{2,})[\dx* -]{0,12}\b/gi, '[reference removed]')
  .replace(/\b\d{4,}\b/g, '[reference removed]').slice(0, 120);

function getEpitaph(item, remembrance) {
  if (remembrance) return 'A gentle reminder. Review this whenever it feels right.';
  if (item.increasePercent) return 'A quiet little charge that learned to ask for more.';
  return ({ Streaming: 'The season ended. The bill did not.', Music: 'Still playing long after the encore.', 'Software & cloud': 'A tiny tool with a very persistent pulse.', Fitness: 'The membership keeps doing its reps.', 'News & reading': 'The story keeps renewing itself.' })[item.category] || 'A familiar visitor, right on schedule.';
}

function Modal({ title, eyebrow, onClose, children, className = '' }) {
  return <div className="modal-scrim" role="presentation" onMouseDown={event => event.target === event.currentTarget && onClose()}>
    <section className={`modal ${className}`} role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <button className="modal-close icon-button" aria-label="Close dialog" onClick={onClose}><X size={18}/></button>
      <p className="eyebrow">{eyebrow}</p><h2 id="modal-title">{title}</h2>{children}
    </section>
  </div>;
}

function StatCard({ icon: Icon, label, value, detail, accent = '' }) {
  return <article className={`stat-card ${accent}`}><div className="stat-icon"><Icon size={17}/></div><p>{label}</p><strong>{value}</strong><span>{detail}</span></article>;
}

function App() {
  const [transactions, setTransactions] = useState(sampleTransactions);
  const [fileName, setFileName] = useState('Sample ledger · May—Oct 2026');
  const [isSample, setIsSample] = useState(true);
  const [remembrance, setRemembrance] = useState(false);
  const [decisions, setDecisions] = useState({});
  const [names, setNames] = useState({});
  const [categories, setCategories] = useState({});
  const [separatedTransactions, setSeparatedTransactions] = useState([]);
  const [filter, setFilter] = useState('active');
  const [modal, setModal] = useState(null);
  const [aiTarget, setAiTarget] = useState(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [language, setLanguage] = useState('English');
  const [aiMode, setAiMode] = useState('none');
  const [privacyStatus, setPrivacyStatus] = useState({ loading: false, available: false, message: 'AI is off. Core analysis runs in this browser.' });
  const [toast, setToast] = useState('');
  const [mobileNav, setMobileNav] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const aiStatus = privacyStatus;
  const inputRef = useRef(null);
  const findings = useMemo(() => detectRecurring(transactions, separatedTransactions).map(item => ({ ...item, category: categories[item.id] || item.category, displayName: names[item.id] || item.merchant, status: decisions[item.id] || 'active' })), [transactions, separatedTransactions, decisions, names, categories]);
  const visible = findings.filter(item => (filter === 'all' || item.status === filter) && `${item.displayName} ${item.merchant} ${item.category}`.toLowerCase().includes(searchQuery.toLowerCase()));
  const active = findings.filter(item => item.status === 'active');
  const monthlySpend = findings.filter(item => item.cadence === 'Monthly').reduce((total, item) => total + item.amount, 0);
  const monthlyHike = findings.filter(item => item.cadence === 'Monthly' && item.increasePercent).reduce((total, item) => total + (item.amount - item.previousAmount), 0);
  const annualized = findings.reduce((sum, item) => sum + item.amount * annualMultiplier(item.cadence), 0);
  const savingsEstimate = findings.filter(item => item.status === 'exorcised').reduce((sum, item) => sum + item.amount * annualMultiplier(item.cadence), 0);
  const [showToast, setShowToast] = useState(false);

  useEffect(() => {
    if (aiMode === 'none') {
      setPrivacyStatus({ loading: false, available: false, message: 'AI is off. Core analysis runs in this browser.' });
      return;
    }
    let current = true;
    setPrivacyStatus({ loading: true, available: false, message: aiMode === 'local' ? 'Checking your local Ollama model…' : 'Checking the Groq backend configuration…' });
    fetch(`/api/ai/status?mode=${aiMode}`).then(response => response.json()).then(data => {
      if (current) setPrivacyStatus({ loading: false, available: Boolean(data.available), message: data.message, provider: data.provider });
    }).catch(() => current && setPrivacyStatus({ loading: false, available: false, message: 'Could not reach the app backend. Core analysis still works.' }));
    return () => { current = false; };
  }, [aiMode]);

  function notify(message) {
    setToast(message); setShowToast(true);
    window.clearTimeout(notify.timeout);
    notify.timeout = window.setTimeout(() => setShowToast(false), 3000);
  }

  async function onFile(event) {
    const file = event.target.files?.[0]; if (!file) return;
    try {
      const rows = await parseStatement(file);
      setTransactions(rows); setFileName(file.name); setIsSample(false); setDecisions({}); setNames({}); setSeparatedTransactions([]); setFilter('active');
      notify(`${detectRecurring(rows).length} recurring patterns found in ${file.name}.`);
    } catch (error) { notify(error.message || 'Could not read that statement.'); }
    finally { event.target.value = ''; }
  }

  function loadSample() {
    setTransactions(sampleTransactions()); setFileName('Sample ledger · May—Oct 2026'); setIsSample(true);
    setDecisions({}); setNames({}); setSeparatedTransactions([]); setFilter('active'); notify('Sample ledger loaded. No real statement is involved.');
  }

  function decide(item, status) {
    setDecisions(current => ({ ...current, [item.id]: status }));
    notify(status === 'exorcised' ? 'Marked for you to cancel. This is an estimate; no account or payment was changed.' : status === 'cancelled' ? 'Recorded as cancelled by you. This app did not cancel it.' : status === 'kept' ? 'Kept in your ledger.' : 'Decision undone.');
  }

  function beginAi(item, task) {
    if (aiMode === 'none') { notify('Choose Local AI or Cloud AI in Privacy & AI first.'); return; }
    setAiTarget({ item, task });
    setModal({ kind: 'consent' });
  }

  async function askAi() {
    if (!aiTarget) return;
    setAiBusy(true);
    try {
      // Deliberately send one merchant description only—no date, amount, balance, or statement.
      const response = await fetch('/api/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: aiMode, task: aiTarget.task, description: safeMerchantDescription(aiTarget.item.merchant), language, consent: true }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'AI is unavailable.');
      const parsed = data.data || {};
      setModal({ kind: 'result', data, parsed, target: aiTarget });
    } catch (error) { setModal(null); notify(error.message || 'AI could not help right now.'); }
    finally { setAiBusy(false); }
  }

  function acceptName() {
    const suggestion = modal?.parsed;
    if (suggestion?.name) setNames(current => ({ ...current, [modal.target.item.id]: suggestion.name }));
    if (suggestion?.category) setCategories(current => ({ ...current, [modal.target.item.id]: suggestion.category }));
    setModal(null); notify('Suggestion applied in this tab only.');
  }

  function printList() { window.print(); }

  const monthSeries = useMemo(() => {
    const dates = transactions.map(item => item.date).filter(Boolean).sort((a,b) => a-b);
    if (!dates.length) return [];
    const latest = dates.at(-1);
    const months = Array.from({ length: 6 }, (_, offset) => new Date(Date.UTC(latest.getUTCFullYear(), latest.getUTCMonth() - 5 + offset, 1)));
    return months.map(month => {
      const total = findings.reduce((sum, finding) => sum + transactions
        .filter(tx => tx.debit && !separatedTransactions.includes(transactionId(tx)) && normalizeMerchant(tx.description) === finding.id && tx.date.getUTCFullYear() === month.getUTCFullYear() && tx.date.getUTCMonth() === month.getUTCMonth())
        .reduce((subtotal, tx) => subtotal + tx.amount, 0), 0);
      return { month, total, label: new Intl.DateTimeFormat('en-IN', { month: 'short', timeZone: 'UTC' }).format(month).toUpperCase() };
    });
  }, [transactions, findings, separatedTransactions]);
  const maxMonth = Math.max(1, ...monthSeries.map(item => item.total));

  return <div className={`app-frame ${remembrance ? 'remembrance' : ''}`}>
    <aside className={`sidebar ${mobileNav ? 'sidebar-open' : ''}`}>
      <a className="brand" href="#top" aria-label="Still Charging home"><span className="brand-sigil">✳</span><span>STILL <b>CHARGING</b></span></a>
      <div className="side-label">YOUR SPACE</div>
      <nav className="main-nav" aria-label="Main navigation">
        <button className="nav-item active"><LayoutDashboard size={17}/> <span>Your ledger</span><span className="nav-count">{findings.length}</span></button>
        <button className="nav-item" onClick={() => setFilter('kept')}><BadgeCheck size={17}/> <span>Kept for now</span></button>
        <button className="nav-item" onClick={() => setModal({ kind: 'guidance' })}><CircleHelp size={17}/> <span>Cancellation guide</span></button>
      </nav>
      <div className="sidebar-divider"/>
      <div className="side-label">YOUR STATEMENT</div>
      <div className="statement-card">
        <div className="statement-icon"><FileText size={16}/></div>
        <div className="statement-info"><strong>{isSample ? 'Sample ledger' : fileName}</strong><span>{isSample ? 'Synthetic · 6 months' : 'Read locally in this tab'}</span></div>
        <button className="icon-button more-button" aria-label="Load sample ledger" onClick={loadSample}><MoreHorizontal size={18}/></button>
      </div>
      <button className="side-import" onClick={() => inputRef.current?.click()}><Plus size={15}/> Import a statement</button>
      <div className="sidebar-spacer"/>
      <div className="sidebar-privacy"><div className="privacy-lock"><LockKeyhole size={16}/></div><div><strong>Local by design</strong><span>Your file stays in this browser.</span></div><ShieldCheck size={15} className="privacy-check"/></div>
      <button className="mode-switch" aria-pressed={remembrance} onClick={() => setRemembrance(value => !value)}>
        <span className="mode-flower">{remembrance ? <Ghost size={16}/> : <Heart size={16}/>}</span>
        <span>{remembrance ? 'Return to Halloween mode' : 'For someone who has passed'}</span>
      </button>
      <div className="sidebar-foot"><span>OPEN MODELS</span><span className="model-dot"/> GEMMA + GROQ</div>
    </aside>

    <main className="main-area" id="top">
      <header className="topbar">
        <button className="icon-button menu-button" aria-label="Open navigation" onClick={() => setMobileNav(value => !value)}><Menu size={20}/></button>
        <div className="breadcrumb"><span>STILL CHARGING</span><span className="crumb-slash">/</span><b>Your ledger</b></div>
        <div className="topbar-right"><span className="local-state"><i/>PRIVATE SESSION</span><span className="top-date"><CalendarDays size={14}/> OCT 2026</span><button className="icon-button help-button" aria-label="Privacy information" onClick={() => setModal({ kind: 'privacy' })}><CircleHelp size={18}/></button></div>
      </header>

      <div className="content-wrap">
        <section className="page-intro">
          <div className="intro-copy"><p className="eyebrow"><span className="eyebrow-mark">✦</span> {remembrance ? 'A LEDGER HELD WITH CARE' : 'THE OCTOBER LEDGER'}</p>
            <h1>{remembrance ? <>A gentler ledger<br/><em>for a life remembered.</em></> : <>Still <em>charging?</em></>}</h1>
            <p className="intro-subtitle">{remembrance ? 'A calm place to review recurring charges connected to someone you remember. There is no rush; every choice is yours.' : 'The subscriptions that linger after the trial, the price hike, the forgotten sign-up. Review each one at your pace.'}</p>
            <div className="intro-meta"><span className="file-chip"><FileText size={13}/>{fileName}</span><span className="data-note"><LockKeyhole size={13}/> Parsed on this device</span></div>
          </div>
          <div className="hero-illustration" aria-label={remembrance ? 'Marigold candle illustration' : 'Moonlit subscription grave marker'}>
            <div className="hero-orbit"/><div className="hero-moon"/>
            {!remembrance ? <><div className="hero-grave"><span>SUBSCRIPTION</span><strong>2021—?</strong><i>rest in peace</i></div><div className="hero-grave-small"/><span className="hero-spark spark-one">✦</span><span className="hero-spark spark-two">✧</span></> : <div className="marigold-bouquet"><span>✿</span><span>✿</span><span>✿</span><i/></div>}
            <div className="hero-ground"/>
          </div>
          <div className="intro-actions"><button className="button-primary" onClick={() => inputRef.current?.click()}><Plus size={16}/> Open a statement</button><button className="button-ghost" onClick={loadSample}>Explore sample data <ArrowUpRight size={14}/></button><input ref={inputRef} type="file" accept=".csv,.pdf,text/csv,application/pdf" hidden onChange={onFile}/></div>
          <p className="file-limit">CSV or text-based PDF <span>·</span> Scanned and password-protected PDFs aren’t supported</p>
        </section>

        <section className="privacy-banner">
          <div className="privacy-banner-icon"><LockKeyhole size={18}/></div><div className="privacy-banner-copy"><strong>Your statement never leaves this browser.</strong><span>We scan it here. If you choose AI, only a sanitized merchant description goes to the selected provider after confirmation.</span></div><button onClick={() => setModal({ kind: 'privacy' })}>How it works <ArrowUpRight size={13}/></button>
        </section>

        <section className="stats-grid" aria-label="Ledger summary">
          <StatCard icon={Wallet} label="MONTHLY SUBSCRIPTIONS" value={money(monthlySpend)} detail={`${active.length} still awaiting a decision`} accent="stat-moss"/>
          <StatCard icon={ArrowUpRight} label="PRICE RAISED" value={monthlyHike ? `+${money(monthlyHike)}` : '—'} detail={monthlyHike ? 'Increase found in your latest cycle' : 'No recent increases found'} accent="stat-red"/>
          <StatCard icon={TicketCheck} label="EST. YEARLY CHARGES" value={money(annualized)} detail="Cadence annualized; assumes repeats continue" accent="stat-amber"/>
          <StatCard icon={ArrowDownRight} label="POTENTIAL SAVINGS" value={money(savingsEstimate)} detail="Only items you mark to cancel; estimate, not actual savings" accent="stat-red"/>
          <StatCard icon={Activity} label="PATTERNS FOUND" value={String(findings.length).padStart(2, '0')} detail="Based on repeat dates and amounts" accent="stat-bone"/>
        </section>

        <section className="dashboard-grid">
          <div className="subscriptions-panel">
            <div className="panel-heading"><div><p className="eyebrow">{remembrance ? 'A GENTLE REVIEW' : 'THE USUAL SUSPECTS'}</p><h2>Recurring charges <span>{findings.length}</span></h2></div><button className="print-button" onClick={printList} disabled={!visible.length}><FileText size={14}/> Print list</button></div>
            <div className="list-controls"><div className="filter-tabs" role="group" aria-label="Filter subscription list">
              {[['active', 'Needs a decision'], ['all', 'All'], ['kept', 'Kept'], ['exorcised', 'Plan to cancel'], ['cancelled', 'Cancelled by you']].map(([value, label]) => <button key={value} className={filter === value ? 'selected' : ''} onClick={() => setFilter(value)}>{label}</button>)}
            </div>{searchOpen && <input className="search-field" autoFocus aria-label="Search subscriptions" placeholder="Search ledger" value={searchQuery} onChange={event => setSearchQuery(event.target.value)}/>}<button className="icon-button search-button" aria-label={searchOpen ? 'Close search' : 'Search subscriptions'} title="Search" onClick={() => { setSearchOpen(value => !value); if (searchOpen) setSearchQuery(''); }}><Search size={16}/></button></div>
            <div className="subscription-list">
              {!visible.length ? <div className="list-empty"><Sparkles size={23}/><strong>{findings.length ? 'Nothing in this view.' : 'The ledger is quiet—for now.'}</strong><span>Import a statement or choose the sample ledger to see recurring patterns.</span><button className="button-ghost" onClick={loadSample}>Show sample ledger</button></div> : visible.map(item => {
                const Icon = icons[item.icon] || CircleDot;
                return <article key={item.id} className={`subscription-item ${item.status}`}>
                  <div className="tombstone-edge"/>
                  <div className="service-icon"><Icon size={19}/></div>
                  <div className="subscription-main"><div className="subscription-title-row"><h3>{item.displayName}</h3><span className="cadence-pill">{item.cadence}</span>{item.increasePercent > 0 && <span className="hike-pill"><ArrowUpRight size={12}/> {item.increasePercent}% increase</span>}</div><p className="merchant-description">{item.merchant}</p><div className="item-evidence"><span>{item.category}</span><i>·</i><span>{item.occurrences} charges</span><i>·</i><span>{item.status === 'kept' ? 'User reviewed' : item.status === 'active' ? 'Suspected' : item.status === 'cancelled' ? 'Cancelled by user' : 'Plan to cancel'}</span><i>·</i><span>{item.confidence} confidence</span><i>·</i><span>Last seen {dateLabel(item.lastDate)}</span></div><p className="item-epitaph">{getEpitaph(item, remembrance)}</p>
                    <details className="evidence-details"><summary>Why this appeared <ChevronDown size={12}/></summary><p>{item.evidence}. Pattern status: {item.reviewStatus}. AI suggestions never change this transaction evidence.</p><button className="action-button undo" onClick={() => { const custom = window.prompt('Enter a display name for this merchant group. The original transaction descriptions remain unchanged.', item.displayName); if (custom?.trim()) { setNames(current => ({ ...current, [item.id]: custom.trim() })); notify('Display name updated in this tab only. Original evidence is unchanged.'); } }}>Correct display name</button><details className="separate-details"><summary>Keep one transaction separate</summary><ul>{item.transactions.map((transaction, index) => <li key={transaction.evidenceId}><button className="action-button undo" disabled={separatedTransactions.includes(transaction.evidenceId)} onClick={() => { setSeparatedTransactions(current => [...current, transaction.evidenceId]); notify('Transaction removed from this recurring group; its source row is preserved.'); }}>{separatedTransactions.includes(transaction.evidenceId) ? 'Separate' : 'Separate'} · {dateLabel(transaction.date)} · {transaction.description}</button></li>)}</ul></details></details>
                  </div>
                  <div className="subscription-cost"><strong>{money(item.amount)}</strong><span>/ {item.cadence.toLowerCase()}</span>{item.increasePercent > 0 && <small>was {money(item.previousAmount)}</small>}</div>
                  <div className="item-menu"><button className="icon-button" aria-label={`More about ${item.displayName}`} onClick={() => setModal({ kind: 'guidance', merchant: item.displayName })}><MoreHorizontal size={18}/></button></div>
                  <div className="item-actions">{item.status === 'active' ? <><button className="action-button exorcise" onClick={() => decide(item, 'exorcised')}>{remembrance ? 'Plan to cancel' : '✦ Plan to cancel'}</button><button className="action-button keep" onClick={() => decide(item, 'kept')}>Keep</button></> : <><span className="decision-label"><Check size={13}/>{item.status === 'kept' ? 'Reviewed · kept' : item.status === 'cancelled' ? 'Cancelled by you' : 'Plan to cancel'}</span><button className="action-button undo" onClick={() => decide(item, 'active')}>Undo</button></>}{item.status !== 'cancelled' && <button className="action-button undo" onClick={() => decide(item, 'cancelled')}>Cancelled by user</button>}
                    <button className="ai-button" disabled={aiMode === 'none' || !aiStatus.available} title={aiStatus.message} onClick={() => beginAi(item, 'normalize')}><Sparkles size={13}/> Name with AI</button><button className="ai-button" disabled={aiMode === 'none' || !aiStatus.available} title={aiStatus.message} onClick={() => beginAi(item, 'draft')}><FileText size={13}/> Draft a note</button>
                  </div>
                </article>;
              })}
            </div>
            {separatedTransactions.length > 0 && <section className="separated-list" aria-label="Transactions kept separate"><strong>Kept separate by you</strong>{transactions.filter(transaction => separatedTransactions.includes(`${transaction.date.toISOString()}|${transaction.amount}|${transaction.description}`)).map(transaction => { const id = `${transaction.date.toISOString()}|${transaction.amount}|${transaction.description}`; return <div key={id}><span>{dateLabel(transaction.date)} · {transaction.description}</span><button className="action-button undo" onClick={() => setSeparatedTransactions(current => current.filter(value => value !== id))}>Rejoin pattern</button></div>; })}</section>}
            <div className="list-footnote"><ShieldCheck size={14}/><span>We only flag patterns. No subscription is cancelled without you.</span></div>
          </div>

          <aside className="insight-column">
            <article className="spend-card"><div className="aside-heading"><div><p className="eyebrow">RECENT HISTORY</p><h3>Your recurring outflow</h3></div><button className="icon-button" aria-label="Monthly overview"><MoreHorizontal size={18}/></button></div><div className="spend-total"><strong>{money(monthlySpend)}</strong><span>/ month estimated</span></div><div className="bar-chart" role="img" aria-label="Recurring charges by month from the imported transactions"><div className="chart-y-labels"><span>{money(maxMonth)}</span><span>{money(Math.round(maxMonth/2))}</span><span>₹0</span></div><div className="chart-bars">{monthSeries.map((item, index) => <div key={item.label + index} className={`chart-bar ${index === monthSeries.length - 1 ? 'current' : ''}`} style={{ height: `${Math.max(3, item.total / maxMonth * 100)}%` }} title={`${item.label} · ${money(item.total)}`}/>)}</div></div><div className="chart-months">{monthSeries.map((item, index) => <span key={item.label + index}>{item.label}</span>)}</div><div className="chart-caption"><span><i/> Recurring charges detected</span><span>Based on imported rows</span></div></article>
            <article className="price-alert"><div className="alert-icon"><ArrowUpRight size={16}/></div><div><p className="eyebrow">PRICE HIKE WATCH</p><h3>{findings.some(item => item.increasePercent) ? 'One familiar charge grew.' : 'No price hikes spotted.'}</h3><p>{findings.some(item => item.increasePercent) ? 'Compare the latest charge with the one before it. Check the service before deciding.' : 'We compare recent matching charges. A change is flagged only when it rises by more than 3%.'}</p>{findings.some(item => item.increasePercent) && <button onClick={() => { setFilter('all'); document.querySelector('.subscriptions-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>Review changed charges <ArrowDownRight size={13}/></button>}</div></article>
            <article className="model-card privacy-ai-card"><div className="model-head"><div className="model-emblem"><ShieldCheck size={17}/></div><div><p className="eyebrow">PRIVACY & AI</p><h3>Choose how AI works</h3></div></div>
              <fieldset className="mode-options"><legend className="sr-only">AI operating mode</legend>
                <label><input type="radio" name="ai-mode" checked={aiMode === 'none'} onChange={() => setAiMode('none')}/><span><strong>No AI</strong><small>All detection stays here</small></span></label>
                <label><input type="radio" name="ai-mode" checked={aiMode === 'local'} onChange={() => setAiMode('local')}/><span><strong>Local Gemma</strong><small>Ollama on this machine</small></span></label>
                <label><input type="radio" name="ai-mode" checked={aiMode === 'cloud'} onChange={() => setAiMode('cloud')}/><span><strong>Cloud Groq</strong><small>Internet and API key required</small></span></label>
              </fieldset>
              <p className="privacy-mode-status" role="status">{aiStatus.loading ? 'Checking selected provider…' : aiStatus.message}</p>
              <p>For an AI action, the preview lists the operation, one merchant description, and the selected language. No dates, amounts, account details, or transaction arrays are accepted by the backend. Cloud requests require confirmation each time.</p>
              <button onClick={() => setModal({ kind: 'privacy' })}>Full privacy details <ArrowUpRight size={13}/></button></article>
            <article className="guide-card"><div className="guide-card-icon"><CreditCard size={17}/></div><div><strong>Ready to stop one?</strong><span>See fixed steps for UPI AutoPay and card mandates.</span><button onClick={() => setModal({ kind: 'guidance' })}>Open cancellation guide <ArrowUpRight size={13}/></button></div></article>
          </aside>
        </section>

        <footer className="page-footer"><span>STILL CHARGING <i>✳</i></span><span>OPEN MODELS. YOUR CALL.</span><button onClick={() => setModal({ kind: 'guidance' })}>Cancellation guidance</button></footer>
      </div>
    </main>

    {mobileNav && <button className="nav-backdrop" aria-label="Close navigation" onClick={() => setMobileNav(false)}/>}

    {modal?.kind === 'consent' && <Modal eyebrow={aiMode === 'cloud' ? 'CLOUD AI · CONFIRM THIS REQUEST' : 'LOCAL AI · CONFIRM THIS REQUEST'} title={aiMode === 'cloud' ? 'Review what leaves this device.' : 'Review what goes to Ollama.'} onClose={() => setModal(null)}>
      <p className="modal-copy">{aiMode === 'cloud' ? 'Groq will receive the fields below for this one request. A merchant name can still be sensitive. The full statement remains in this browser.' : 'This request will go to the Ollama service configured on your machine. It will not fall back to a cloud provider.'}</p>
      <dl className="transmission-preview"><div><dt>Operation</dt><dd>{aiTarget?.task === 'normalize' ? 'Merchant name suggestion' : 'Cancellation message draft'}</dd></div><div><dt>Merchant description</dt><dd>{safeMerchantDescription(aiTarget?.item.merchant)}</dd></div><div><dt>Draft language</dt><dd><select aria-label="Draft language" value={language} onChange={event => setLanguage(event.target.value)}><option>English</option><option>Hindi</option><option>Marathi</option></select></dd></div></dl>
      <p className="modal-copy">No transaction dates, amounts, account identifiers, statement files, or transaction lists are sent. The generated draft is only a suggestion and is never sent automatically.</p>
      <div className="consent-box"><LockKeyhole size={16}/><span>One-time confirmation. {aiMode === 'cloud' ? 'Internet and Groq cloud processing are required.' : 'Local Gemma requires Ollama and a downloaded model.'}</span></div>
      <div className="modal-actions"><button className="button-secondary" onClick={() => setModal(null)}>Cancel</button><button className="button-primary" onClick={askAi} disabled={aiBusy || !aiStatus.available}>{aiBusy ? 'Working…' : `Confirm ${aiMode === 'cloud' ? 'cloud' : 'local'} request`}</button></div>
    </Modal>}

    {modal?.kind === 'result' && <Modal eyebrow="MODEL SUGGESTION · REVIEW IT" title={modal.target.task === 'normalize' ? 'A name suggestion' : (modal.parsed?.subject || 'Cancellation request')} onClose={() => setModal(null)} className="result-modal">
      <p className="provider-attribution">Suggested by {modal.data.provider}. Review it before using; model output can be wrong.</p>
      <div className="draft-box">{modal.target.task === 'normalize' ? <><strong>{modal.parsed?.name}</strong>{modal.parsed?.category && <span>Suggested category · {modal.parsed.category}</span>}<p>{modal.parsed?.explanation}</p>{modal.parsed?.alternative && <span>Alternative · {modal.parsed.alternative}</span>}{modal.parsed?.warning && <span>Review note · {modal.parsed.warning}</span>}<span>Confidence · {modal.parsed?.confidence}</span></> : <><strong>{modal.parsed?.subject}</strong><p>{modal.parsed?.message}</p><span>Editable suggestion only · no cancellation was performed</span></>}</div>
      <div className="modal-actions">{modal.target.task === 'normalize' && <button className="button-secondary" onClick={acceptName}>Use this name</button>}<button className="button-secondary" onClick={async () => { try { await navigator.clipboard.writeText(modal.target.task === 'normalize' ? modal.parsed?.name : `${modal.parsed?.subject}\n\n${modal.parsed?.message}`); notify('Copied to clipboard.'); } catch { notify('Select the text to copy it.'); } }}>Copy</button><button className="button-primary" onClick={() => setModal(null)}>Done</button></div>
    </Modal>}

    {modal?.kind === 'privacy' && <Modal eyebrow="A NOTE ON PRIVACY" title="Your statement stays here." onClose={() => setModal(null)}>
      <div className="rich-modal-copy"><p>CSV rows, PDF text, recurrence detection, amount comparisons, and cancellation guidance run in this browser. In No-AI mode the app does not call an AI endpoint; after the app assets are loaded, core analysis does not need internet access.</p><p>Local AI sends one approved merchant description, operation, and language to the app backend and then to your configured local Ollama service. It never falls back to cloud. Cloud AI sends those same minimum fields to Groq only after you confirm each request. The backend rejects extra fields and removes dates, currency amounts, and long numeric references from merchant descriptions.</p><p>Neither mode accepts statement files, transaction arrays, account identifiers, transaction dates, or amounts as separate fields. AI output is validated and remains a user-reviewed suggestion. Decisions stay in this tab. Provider keys stay in backend environment variables.</p></div>
      <div className="modal-actions"><button className="button-primary" onClick={() => setModal(null)}>Got it</button></div>
    </Modal>}

    {modal?.kind === 'guidance' && <Modal eyebrow="FIXED GUIDANCE · NOT AI-GENERATED" title="Check the mandate, then cancel it yourself." onClose={() => setModal(null)} className="guide-modal">
      {modal.merchant && <p className="guide-context">Reviewing: <strong>{modal.merchant}</strong></p>}
      <div className="guide-section"><div className="guide-marker">01</div><div><h3>UPI AutoPay</h3><p>In the UPI or bank app where the mandate appears, open its AutoPay or Mandates section, select the active mandate, then choose cancel or revoke. Confirm the status in that app. Labels vary; some loan mandates may need the lender.</p><a href="https://support.google.com/pay/india/answer/10840624?hl=en-IN" target="_blank" rel="noreferrer">Google Pay India · manage recurring payments ↗</a><a href="https://www.npci.org.in/uploads/UPI_OC_223_Enhancement_of_UPI_Autopay_3e6a1cdb33.pdf" target="_blank" rel="noreferrer">NPCI · UPI AutoPay lifecycle ↗</a></div></div>
      <div className="guide-section"><div className="guide-marker">02</div><div><h3>Card mandate</h3><p>Cancel the subscription with the merchant first. Then check your card issuer’s official app or contact the issuer to review or revoke the recurring e-mandate. Issuer steps differ. Still Charging cannot access an account or cancel for you.</p><a href="https://www.rbi.org.in/commonman/Upload/English/PressRelease/PDFs/PR72151BDEC79C76948C68A6DE914991CC848.pdf" target="_blank" rel="noreferrer">RBI · recurring e-mandates and customer protections ↗</a></div></div>
      <div className="modal-actions"><button className="button-primary" onClick={() => setModal(null)}>Done</button></div>
    </Modal>}

    <div className={`toast ${showToast ? 'visible' : ''}`} role="status" aria-live="polite">{toast}</div>
  </div>;
}

export default App;
