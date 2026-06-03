import { useState, useCallback, useRef, useEffect } from 'react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts'
import { Upload, Download, AlertCircle, CheckCircle, Clock, BarChart2, ChevronDown, ChevronUp, Scale, LogOut, User, History, Eye, EyeOff, X } from 'lucide-react'

// For local dev: uses proxy. For production: set VITE_API_URL in Vercel env vars
const API = import.meta.env.VITE_API_URL || ''

// ── Auth helpers ──────────────────────────────────────────────────────────────
const getToken = () => localStorage.getItem('lsx_token')
const setToken = (t) => localStorage.setItem('lsx_token', t)
const clearToken = () => localStorage.removeItem('lsx_token')
const getUser = () => { try { return JSON.parse(localStorage.getItem('lsx_user') || 'null') } catch { return null } }
const setUser = (u) => localStorage.setItem('lsx_user', JSON.stringify(u))
const clearUser = () => localStorage.removeItem('lsx_user')

async function apiFetch(path, options = {}) {
  const token = getToken()
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) }
  if (token) headers['Authorization'] = `Bearer ${token}`
  if (options.body instanceof FormData) delete headers['Content-Type']
  const res = await fetch(`${API}${path}`, { ...options, headers })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Request failed' }))
    throw new Error(err.detail || 'Request failed')
  }
  return res.json()
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = {
  page: { minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--paper)' },
  header: { borderBottom: '2px solid var(--ink)', padding: '1.1rem 2rem', display: 'flex', alignItems: 'center', gap: '1rem', background: 'var(--ink)' },
  headerTitle: { fontFamily: 'var(--ff-display)', fontSize: '1.5rem', fontWeight: 900, color: 'var(--gold)', letterSpacing: '-0.02em' },
  headerSub: { fontFamily: 'var(--ff-mono)', fontSize: '0.65rem', color: '#9a8f7a', letterSpacing: '0.12em', textTransform: 'uppercase' },
  main: { flex: 1, maxWidth: 1100, margin: '0 auto', width: '100%', padding: '2.5rem 2rem' },
  card: { background: '#fff', border: '1.5px solid var(--border)', borderRadius: '6px', padding: '2rem', boxShadow: '0 4px 16px var(--shadow)' },
  cardTitle: { fontFamily: 'var(--ff-display)', fontSize: '1.6rem', fontWeight: 900, marginBottom: '0.35rem', color: 'var(--ink)' },
  cardSub: { color: 'var(--muted)', fontSize: '0.88rem', marginBottom: '1.75rem' },
  label: { display: 'block', fontFamily: 'var(--ff-mono)', fontSize: '0.72rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: '0.4rem' },
  input: (err) => ({
    width: '100%', padding: '0.7rem 0.9rem', borderRadius: '4px', fontSize: '0.92rem',
    fontFamily: 'var(--ff-body)', border: `1.5px solid ${err ? 'var(--red)' : 'var(--border)'}`,
    background: '#fff', color: 'var(--ink)', outline: 'none', boxSizing: 'border-box',
  }),
  errMsg: { color: 'var(--red)', fontFamily: 'var(--ff-mono)', fontSize: '0.72rem', marginTop: '0.3rem' },
  btn: (v = 'primary', full = false) => ({
    display: full ? 'flex' : 'inline-flex', width: full ? '100%' : 'auto',
    alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
    padding: '0.72rem 1.4rem', fontFamily: 'var(--ff-mono)', fontSize: '0.82rem',
    fontWeight: 500, letterSpacing: '0.04em',
    border: v === 'primary' ? 'none' : '1.5px solid var(--border)',
    borderRadius: '4px',
    background: v === 'primary' ? 'var(--ink)' : 'transparent',
    color: v === 'primary' ? 'var(--gold)' : 'var(--muted)',
    cursor: 'pointer', transition: 'all 0.15s', marginTop: full ? '0.25rem' : 0,
  }),
  divider: { display: 'flex', alignItems: 'center', gap: '1rem', margin: '1.25rem 0', color: 'var(--muted)', fontFamily: 'var(--ff-mono)', fontSize: '0.72rem' },
  dividerLine: { flex: 1, height: 1, background: 'var(--border)' },
  dropzone: (active) => ({
    border: `2px dashed ${active ? 'var(--gold)' : 'var(--border)'}`, borderRadius: '4px',
    padding: '3rem 2rem', textAlign: 'center',
    background: active ? 'rgba(201,168,76,0.06)' : 'var(--cream)',
    transition: 'all 0.2s', cursor: 'pointer', position: 'relative',
  }),
  badge: (s) => ({
    display: 'inline-block', padding: '0.15rem 0.55rem', borderRadius: '2px',
    fontFamily: 'var(--ff-mono)', fontSize: '0.72rem', fontWeight: 500, letterSpacing: '0.06em',
    background: s === 'Positive' ? '#e8f4ec' : s === 'Negative' ? '#f9ecec' : '#f0ede6',
    color: s === 'Positive' ? 'var(--green)' : s === 'Negative' ? 'var(--red)' : 'var(--muted)',
    border: `1px solid ${s === 'Positive' ? '#b8dfc5' : s === 'Negative' ? '#e8b8b8' : 'var(--border)'}`,
  }),
  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' },
  grid3: { display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '1rem' },
  stat: (c) => ({ padding: '1.2rem 1.4rem', borderRadius: '4px', border: `1.5px solid ${c}33`, background: `${c}0d` }),
  statNum: (c) => ({ fontFamily: 'var(--ff-display)', fontSize: '2.2rem', fontWeight: 900, color: c, lineHeight: 1 }),
  statLabel: { fontFamily: 'var(--ff-mono)', fontSize: '0.72rem', color: 'var(--muted)', letterSpacing: '0.08em', textTransform: 'uppercase', marginTop: '0.25rem' },
  table: { width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--ff-body)', fontSize: '0.88rem' },
  th: { textAlign: 'left', padding: '0.6rem 0.9rem', fontFamily: 'var(--ff-mono)', fontSize: '0.72rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)', borderBottom: '2px solid var(--border)', background: 'var(--cream)' },
  td: { padding: '0.65rem 0.9rem', borderBottom: '1px solid var(--border)', verticalAlign: 'top' },
  progressBar: (p) => ({ height: 6, borderRadius: 3, background: `linear-gradient(90deg, var(--gold) ${p}%, var(--border) ${p}%)`, transition: 'background 0.4s' }),
  navBtn: (active) => ({
    display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
    padding: '0.4rem 0.8rem', fontFamily: 'var(--ff-mono)', fontSize: '0.75rem',
    border: 'none', borderRadius: '3px', cursor: 'pointer',
    background: active ? 'rgba(201,168,76,0.15)' : 'transparent',
    color: active ? 'var(--gold)' : '#9a8f7a', transition: 'all 0.15s',
  }),
}

const PIE_COLORS = { Positive: '#1a5c2e', Negative: '#8b1a1a', Neutral: '#6b6355' }

// ── Input component ───────────────────────────────────────────────────────────
function Input({ label, type = 'text', value, onChange, error, placeholder }) {
  const [show, setShow] = useState(false)
  const actualType = type === 'password' ? (show ? 'text' : 'password') : type
  return (
    <div style={{ marginBottom: '1rem' }}>
      <label style={s.label}>{label}</label>
      <div style={{ position: 'relative' }}>
        <input
          type={actualType} value={value} onChange={e => onChange(e.target.value)}
          placeholder={placeholder} style={{ ...s.input(error), paddingRight: type === 'password' ? '2.5rem' : '0.9rem' }}
        />
        {type === 'password' && (
          <button type="button" onClick={() => setShow(!show)} style={{ position: 'absolute', right: '0.7rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 0 }}>
            {show ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        )}
      </div>
      {error && <div style={s.errMsg}>{error}</div>}
    </div>
  )
}

// ── Auth page ─────────────────────────────────────────────────────────────────
function AuthPage({ onAuth }) {
  const [mode, setMode] = useState('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [errors, setErrors] = useState({})
  const [apiError, setApiError] = useState('')
  const [loading, setLoading] = useState(false)

  const validate = () => {
    const e = {}
    if (mode === 'register' && !name.trim()) e.name = 'Name is required'
    if (!email.trim() || !email.includes('@')) e.email = 'Valid email required'
    if (!password) e.password = 'Password is required'
    if (mode === 'register' && password.length < 6) e.password = 'At least 6 characters'
    if (mode === 'register' && password !== confirm) e.confirm = 'Passwords do not match'
    return e
  }

  const submit = async () => {
    const e = validate()
    if (Object.keys(e).length) { setErrors(e); return }
    setErrors({}); setApiError(''); setLoading(true)
    try {
      const body = mode === 'login' ? { email, password } : { name, email, password }
      const data = await apiFetch(`/api/auth/${mode}`, { method: 'POST', body: JSON.stringify(body) })
      setToken(data.token); setUser(data.user)
      onAuth(data.user)
    } catch (err) {
      setApiError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const switchMode = () => { setMode(mode === 'login' ? 'register' : 'login'); setErrors({}); setApiError('') }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--paper)' }}>
      <header style={s.header}>
        <Scale size={20} color="var(--gold)" />
        <div>
          <div style={s.headerTitle}>LexSentinel</div>
          <div style={s.headerSub}>Legal Document Sentiment Analyzer</div>
        </div>
      </header>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
        <div style={{ ...s.card, width: '100%', maxWidth: 420 }}>
          <div style={s.cardTitle}>{mode === 'login' ? 'Welcome back' : 'Create account'}</div>
          <div style={s.cardSub}>{mode === 'login' ? 'Sign in to your account to continue' : 'Start analyzing legal documents today'}</div>

          {apiError && (
            <div style={{ background: '#f9ecec', border: '1px solid #e8b8b8', borderRadius: 4, padding: '0.7rem 1rem', marginBottom: '1rem', color: 'var(--red)', fontFamily: 'var(--ff-mono)', fontSize: '0.8rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <AlertCircle size={14} /> {apiError}
            </div>
          )}

          {mode === 'register' && <Input label="Full Name" value={name} onChange={setName} error={errors.name} placeholder="John Smith" />}
          <Input label="Email Address" type="email" value={email} onChange={setEmail} error={errors.email} placeholder="you@example.com" />
          <Input label="Password" type="password" value={password} onChange={setPassword} error={errors.password} placeholder="••••••••" />
          {mode === 'register' && <Input label="Confirm Password" type="password" value={confirm} onChange={setConfirm} error={errors.confirm} placeholder="••••••••" />}

          <button style={s.btn('primary', true)} onClick={submit} disabled={loading}>
            {loading ? 'Please wait…' : mode === 'login' ? 'Sign In' : 'Create Account'}
          </button>

          <div style={s.divider}><div style={s.dividerLine} /><span>{mode === 'login' ? 'New here?' : 'Have an account?'}</span><div style={s.dividerLine} /></div>

          <button style={s.btn('secondary', true)} onClick={switchMode}>
            {mode === 'login' ? 'Create an account' : 'Sign in instead'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── History panel ─────────────────────────────────────────────────────────────
function HistoryPanel({ onClose }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    apiFetch('/api/auth/history').then(setItems).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const fmt = (ts) => new Date(ts * 1000).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(13,13,13,0.5)', zIndex: 1000, display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end' }} onClick={onClose}>
      <div style={{ width: 420, height: '100vh', background: '#fff', borderLeft: '2px solid var(--border)', overflowY: 'auto', padding: '1.5rem' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <span style={{ fontFamily: 'var(--ff-display)', fontSize: '1.2rem', fontWeight: 700 }}>Analysis History</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}><X size={18} /></button>
        </div>
        {loading && <div style={{ color: 'var(--muted)', fontFamily: 'var(--ff-mono)', fontSize: '0.8rem' }}>Loading…</div>}
        {!loading && items.length === 0 && <div style={{ color: 'var(--muted)', fontFamily: 'var(--ff-mono)', fontSize: '0.8rem' }}>No analyses yet.</div>}
        {items.map(item => (
          <div key={item.id} style={{ border: '1.5px solid var(--border)', borderRadius: 4, padding: '1rem', marginBottom: '0.75rem' }}>
            <div style={{ fontFamily: 'var(--ff-mono)', fontSize: '0.78rem', fontWeight: 500, marginBottom: '0.35rem', color: 'var(--ink)' }}>{item.filename}</div>
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.35rem', alignItems: 'center' }}>
              <span style={s.badge(item.overall === 'positive' ? 'Positive' : item.overall === 'negative' ? 'Negative' : 'Neutral')}>{item.overall}</span>
              <span style={{ fontFamily: 'var(--ff-mono)', fontSize: '0.7rem', color: 'var(--muted)' }}>{item.total} segments</span>
            </div>
            <div style={{ fontFamily: 'var(--ff-mono)', fontSize: '0.68rem', color: 'var(--muted)' }}>{fmt(item.created_at)}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Main app ──────────────────────────────────────────────────────────────────
function MainApp({ user, onLogout }) {
  const [file, setFile] = useState(null)
  const [drag, setDrag] = useState(false)
  const [jobId, setJobId] = useState(null)
  const [job, setJob] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [filter, setFilter] = useState('All')
  const [showTable, setShowTable] = useState(false)
  const pollRef = useRef()
  const inputRef = useRef()

  useEffect(() => {
    if (!jobId) return
    const poll = async () => {
      try {
        const j = await apiFetch(`/api/job/${jobId}`)
        setJob(j)
        if (j.status === 'done' || j.status === 'error') clearInterval(pollRef.current)
      } catch (e) { setError(e.message); clearInterval(pollRef.current) }
    }
    poll()
    pollRef.current = setInterval(poll, 1500)
    return () => clearInterval(pollRef.current)
  }, [jobId])

  const handleFile = useCallback((f) => { setFile(f); setError('') }, [])

  const handleAnalyze = async () => {
    if (!file) return
    setError(''); setLoading(true); setJob(null); setJobId(null)
    try {
      const fd = new FormData(); fd.append('file', file)
      const token = getToken()
      const res = await fetch(`${API}/api/analyze`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd })
      if (!res.ok) { const e = await res.json(); throw new Error(e.detail) }
      const { job_id } = await res.json()
      setJobId(job_id)
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  const reset = () => { clearInterval(pollRef.current); setFile(null); setJob(null); setJobId(null); setError('') }

  const filteredResults = job?.results?.filter(r => filter === 'All' || r.sentiment === filter) || []

  const downloadCSV = () => {
    fetch(`${API}/api/job/${jobId}/download`, { headers: { Authorization: `Bearer ${getToken()}` } })
      .then(r => r.blob())
      .then(b => { const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = `results_${jobId.slice(0,8)}.csv`; a.click() })
  }

  return (
    <div style={s.page}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} button:hover{opacity:0.82}`}</style>
      <header style={s.header}>
        <Scale size={20} color="var(--gold)" />
        <div style={{ flex: 1 }}>
          <div style={s.headerTitle}>LexSentinel</div>
          <div style={s.headerSub}>Legal Document Sentiment Analyzer</div>
        </div>
        <button style={s.navBtn(false)} onClick={() => setShowHistory(true)}><History size={14} />History</button>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginLeft: '0.5rem' }}>
          <User size={13} color="#9a8f7a" />
          <span style={{ fontFamily: 'var(--ff-mono)', fontSize: '0.72rem', color: '#9a8f7a' }}>{user.name}</span>
        </div>
        <button style={{ ...s.navBtn(false), marginLeft: '0.5rem' }} onClick={onLogout}><LogOut size={14} />Sign out</button>
      </header>

      <main style={s.main}>
        {!job && (
          <>
            <div style={{ marginBottom: '2rem' }}>
              <h1 style={{ fontFamily: 'var(--ff-display)', fontSize: '2rem', fontWeight: 900, letterSpacing: '-0.03em', marginBottom: '0.5rem' }}>
                Understand the <em style={{ color: 'var(--gold-dark)', fontStyle: 'italic' }}>tone</em> of your legal documents.
              </h1>
              <p style={{ color: 'var(--muted)', maxWidth: 560, lineHeight: 1.6, fontSize: '0.92rem' }}>
                Upload a .txt or .csv file and get sentence-level sentiment classification using FLAN-T5.
              </p>
            </div>

            <div
              style={s.dropzone(drag)}
              onDragOver={e => { e.preventDefault(); setDrag(true) }}
              onDragLeave={() => setDrag(false)}
              onDrop={e => { e.preventDefault(); setDrag(false); e.dataTransfer.files[0] && handleFile(e.dataTransfer.files[0]) }}
              onClick={() => inputRef.current.click()}
            >
              <input ref={inputRef} type="file" accept=".txt,.csv" style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} onChange={e => e.target.files[0] && handleFile(e.target.files[0])} />
              <Upload size={30} color="var(--gold)" style={{ margin: '0 auto 1rem' }} />
              <div style={{ fontFamily: 'var(--ff-display)', fontSize: '1.3rem', fontWeight: 700, marginBottom: '0.4rem' }}>
                {file ? file.name : 'Drop your legal document here'}
              </div>
              <div style={{ fontFamily: 'var(--ff-mono)', fontSize: '0.78rem', color: 'var(--muted)' }}>
                {file ? `${(file.size / 1024).toFixed(1)} KB` : 'Accepts .txt and .csv (must have a "text" column)'}
              </div>
            </div>

            <div style={{ marginTop: '1rem', display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
              <button style={s.btn('primary')} onClick={handleAnalyze} disabled={!file || loading}>
                <BarChart2 size={14} />{loading ? 'Uploading…' : 'Run Analysis'}
              </button>
              {file && <button style={s.btn('secondary')} onClick={reset}>Clear</button>}
              {error && <span style={{ color: 'var(--red)', fontFamily: 'var(--ff-mono)', fontSize: '0.8rem' }}><AlertCircle size={13} style={{ verticalAlign: 'middle', marginRight: 4 }} />{error}</span>}
            </div>
          </>
        )}

        {job && (job.status === 'queued' || job.status === 'processing') && (
          <div style={{ ...s.card, marginTop: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
              <Clock size={18} color="var(--gold)" style={{ animation: 'spin 2s linear infinite' }} />
              <span style={{ fontFamily: 'var(--ff-mono)', fontSize: '0.82rem', color: 'var(--muted)' }}>
                {job.status === 'queued' ? 'Queued…' : `Analyzing… ${job.progress}%`}
              </span>
              <span style={{ marginLeft: 'auto', fontFamily: 'var(--ff-mono)', fontSize: '0.72rem', color: 'var(--muted)' }}>{job.filename}</span>
            </div>
            <div style={s.progressBar(job.progress)} />
          </div>
        )}

        {job && job.status === 'done' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h2 style={{ fontFamily: 'var(--ff-display)', fontSize: '1.4rem', fontWeight: 700 }}>Analysis Results</h2>
              <button style={s.btn('secondary')} onClick={reset}>← New Analysis</button>
            </div>

            <div style={{
              background: job.summary.overall === 'positive' ? '#e8f4ec' : job.summary.overall === 'negative' ? '#f9ecec' : 'var(--cream)',
              border: `1.5px solid ${job.summary.overall === 'positive' ? '#b8dfc5' : job.summary.overall === 'negative' ? '#e8b8b8' : 'var(--border)'}`,
              borderRadius: 4, padding: '1rem 1.4rem', marginBottom: '1.25rem',
              color: job.summary.overall === 'positive' ? 'var(--green)' : job.summary.overall === 'negative' ? 'var(--red)' : 'var(--muted)',
            }}>
              <strong style={{ fontFamily: 'var(--ff-display)' }}>Overall: {job.summary.overall.charAt(0).toUpperCase() + job.summary.overall.slice(1)}</strong>
              <span style={{ marginLeft: '0.75rem', fontSize: '0.9rem' }}>{job.summary.insight}</span>
            </div>

            <div style={s.grid3}>
              {[['#1a5c2e', job.summary.positive_pct, 'Positive', job.summary.positive],
                ['#8b1a1a', job.summary.negative_pct, 'Negative', job.summary.negative],
                ['#6b6355', job.summary.neutral_pct, 'Neutral', job.summary.neutral]].map(([c, pct, lbl, cnt]) => (
                <div key={lbl} style={s.stat(c)}>
                  <div style={s.statNum(c)}>{pct}%</div>
                  <div style={s.statLabel}>{lbl} · {cnt} segments</div>
                </div>
              ))}
            </div>

            <div style={{ ...s.grid2, marginTop: '1.25rem' }}>
              <div style={s.card}>
                <div style={{ fontFamily: 'var(--ff-display)', fontWeight: 700, marginBottom: '1rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.6rem' }}>Distribution</div>
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie data={[{ name: 'Positive', value: job.summary.positive }, { name: 'Negative', value: job.summary.negative }, { name: 'Neutral', value: job.summary.neutral }]} cx="50%" cy="50%" innerRadius={50} outerRadius={75} paddingAngle={3} dataKey="value">
                      {['Positive', 'Negative', 'Neutral'].map(k => <Cell key={k} fill={PIE_COLORS[k]} />)}
                    </Pie>
                    <Tooltip contentStyle={{ fontFamily: 'var(--ff-mono)', fontSize: '0.78rem' }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div style={s.card}>
                <div style={{ fontFamily: 'var(--ff-display)', fontWeight: 700, marginBottom: '1rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.6rem' }}>Segment Count</div>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={[{ name: 'Positive', count: job.summary.positive }, { name: 'Negative', count: job.summary.negative }, { name: 'Neutral', count: job.summary.neutral }]}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="name" tick={{ fontFamily: 'var(--ff-mono)', fontSize: 11 }} />
                    <YAxis tick={{ fontFamily: 'var(--ff-mono)', fontSize: 11 }} />
                    <Tooltip contentStyle={{ fontFamily: 'var(--ff-mono)', fontSize: '0.78rem' }} />
                    <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                      {[{ fill: '#1a5c2e' }, { fill: '#8b1a1a' }, { fill: '#9a8f7a' }].map((e, i) => <Cell key={i} fill={e.fill} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end' }}>
              <button style={s.btn('secondary')} onClick={downloadCSV}><Download size={14} /> Download CSV</button>
            </div>

            <div style={{ ...s.card, marginTop: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: showTable ? '1rem' : 0 }}>
                <span style={{ fontFamily: 'var(--ff-display)', fontSize: '1rem', fontWeight: 700, flex: 1 }}>
                  Sentence Results <span style={{ fontFamily: 'var(--ff-mono)', fontSize: '0.72rem', color: 'var(--muted)', fontWeight: 400 }}>({job.results.length})</span>
                </span>
                {['All', 'Positive', 'Negative', 'Neutral'].map(f => (
                  <button key={f} onClick={() => setFilter(f)} style={{ ...s.btn(filter === f ? 'primary' : 'secondary'), padding: '0.3rem 0.7rem', fontSize: '0.72rem' }}>{f}</button>
                ))}
                <button style={s.btn('secondary')} onClick={() => setShowTable(!showTable)}>
                  {showTable ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
              </div>
              {showTable && (
                <div style={{ maxHeight: 380, overflowY: 'auto' }}>
                  <table style={s.table}>
                    <thead><tr><th style={{ ...s.th, width: 40 }}>#</th><th style={s.th}>Text</th><th style={{ ...s.th, width: 110 }}>Sentiment</th></tr></thead>
                    <tbody>
                      {filteredResults.map((row, i) => (
                        <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : 'var(--cream)' }}>
                          <td style={{ ...s.td, fontFamily: 'var(--ff-mono)', fontSize: '0.72rem', color: 'var(--muted)' }}>{i + 1}</td>
                          <td style={s.td}>{row.text}</td>
                          <td style={s.td}><span style={s.badge(row.sentiment)}>{row.sentiment}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}

        {job && job.status === 'error' && (
          <div style={{ ...s.card, marginTop: '1.5rem', borderColor: 'var(--red)' }}>
            <div style={{ color: 'var(--red)', fontFamily: 'var(--ff-mono)', fontSize: '0.85rem' }}><AlertCircle size={15} style={{ verticalAlign: 'middle', marginRight: 6 }} />{job.error}</div>
            <button style={{ ...s.btn('secondary'), marginTop: '1rem' }} onClick={reset}>Try Again</button>
          </div>
        )}

        <footer style={{ marginTop: '3rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border)', fontFamily: 'var(--ff-mono)', fontSize: '0.72rem', color: 'var(--muted)', display: 'flex', justifyContent: 'space-between' }}>
          <span>LexSentinel · FLAN-T5 Small · Local inference</span>
          <span>FastAPI · React · SQLite</span>
        </footer>
      </main>

      {showHistory && <HistoryPanel onClose={() => setShowHistory(false)} />}
    </div>
  )
}

// ── Root ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [user, setUser] = useState(() => getUser())
  const handleAuth = (u) => setUser(u)
  const handleLogout = () => { clearToken(); clearUser(); setUser(null) }
  if (!user) return <AuthPage onAuth={handleAuth} />
  return <MainApp user={user} onLogout={handleLogout} />
}
