/**
 * Dashboard — professional dark theme, no decorative emoji.
 * Sidebar navigation + stat cards + tabbed content.
 */

import { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { apiFetch } from '../api'

// ── SVG Icon components ───────────────────────────────────────

function Icon({ children, className = 'w-4 h-4' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  )
}

function GridIcon({ className }) {
  return <Icon className={className}><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></Icon>
}
function FolderIcon({ className }) {
  return <Icon className={className}><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" /></Icon>
}
function ActivityIcon({ className }) {
  return <Icon className={className}><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></Icon>
}
function BotIcon({ className }) {
  return <Icon className={className}><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0110 0v4" /><circle cx="12" cy="16" r="1.5" fill="currentColor" stroke="none" /></Icon>
}
function SettingsIcon({ className }) {
  return <Icon className={className}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" /></Icon>
}
function CheckIcon({ className }) {
  return <Icon className={className}><polyline points="20 6 9 17 4 12" /></Icon>
}
function XIcon({ className }) {
  return <Icon className={className}><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></Icon>
}
function TrashIcon({ className }) {
  return <Icon className={className}><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4h6v2" /></Icon>
}
function SearchIcon({ className }) {
  return <Icon className={className}><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></Icon>
}
function LogOutIcon({ className }) {
  return <Icon className={className}><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></Icon>
}
function RefreshIcon({ className }) {
  return <Icon className={className}><polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" /><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" /></Icon>
}
function AlertTriangleIcon({ className }) {
  return <Icon className={className}><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></Icon>
}
function PlusIcon({ className }) {
  return <Icon className={className}><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></Icon>
}
function ChevronDownIcon({ className }) {
  return <Icon className={className}><polyline points="6 9 12 15 18 9" /></Icon>
}
function ChevronRightIcon({ className }) {
  return <Icon className={className}><polyline points="9 18 15 12 9 6" /></Icon>
}
function ChevronUpIcon({ className }) {
  return <Icon className={className}><polyline points="18 15 12 9 6 15" /></Icon>
}
function GitBotLogoIcon({ className }) {
  return <BotIcon className={className} />
}

// ── Helpers ───────────────────────────────────────────────────

const EVENT_CONFIG = {
  issues:       { label: 'Issue',   color: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30', border: 'border-l-yellow-500' },
  pull_request: { label: 'PR',      color: 'bg-purple-500/20 text-purple-300 border-purple-500/30', border: 'border-l-purple-500' },
  push:         { label: 'Push',    color: 'bg-blue-500/20 text-blue-300 border-blue-500/30',       border: 'border-l-blue-500' },
}

function timeAgo(isoString) {
  if (!isoString) return '—'
  const diff = Date.now() - new Date(isoString).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function formatDate(isoString) {
  if (!isoString) return '—'
  return new Date(isoString).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// ── Priority/complexity badges (text-only, no emoji) ──────────

const PRIORITY_STYLE = {
  'P0-critical': { label: 'P0', color: 'text-red-400',    bg: 'bg-red-500/10 border-red-500/30' },
  'P1-high':     { label: 'P1', color: 'text-orange-400', bg: 'bg-orange-500/10 border-orange-500/30' },
  'P2-medium':   { label: 'P2', color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/30' },
  'P3-low':      { label: 'P3', color: 'text-green-400',  bg: 'bg-green-500/10 border-green-500/30' },
}

const COMPLEXITY_STYLE = {
  small:  { label: 'Small' },
  medium: { label: 'Medium' },
  large:  { label: 'Large' },
}

// ── AI Analysis Panel ─────────────────────────────────────────

function AIAnalysisPanel({ analysis, eventType }) {
  if (!analysis) return null

  if (eventType === 'issues' && analysis.summary) {
    const pStyle = PRIORITY_STYLE[analysis.priority] || { label: analysis.priority || '—', color: 'text-gray-400', bg: 'bg-gray-500/10 border-gray-500/30' }
    const confidence = analysis.confidence != null ? Math.round(analysis.confidence * 100) : null
    return (
      <div className="mt-3 pt-3 border-t border-[#30363d]">
        <div className="flex items-center gap-2 mb-2">
          <BotIcon className="w-3.5 h-3.5 text-gray-500" />
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">AI Triage</span>
        </div>
        <div className="flex flex-wrap gap-2 mb-2">
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium border ${pStyle.bg} ${pStyle.color}`}>
            {pStyle.label} · {analysis.priority}
          </span>
          {analysis.suggested_label && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-blue-500/10 border border-blue-500/30 text-blue-300">
              {analysis.suggested_label}{confidence != null ? ` (${confidence}%)` : ''}
            </span>
          )}
          {analysis.sentiment && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-[#21262d] border border-[#30363d] text-gray-400">
              {analysis.sentiment}
            </span>
          )}
        </div>
        {analysis.summary && (
          <p className="text-xs text-gray-400 leading-relaxed">{analysis.summary}</p>
        )}
      </div>
    )
  }

  if (eventType === 'pull_request' && analysis.summary) {
    const cStyle = COMPLEXITY_STYLE[analysis.complexity] || { label: analysis.complexity }
    return (
      <div className="mt-3 pt-3 border-t border-[#30363d]">
        <div className="flex items-center gap-2 mb-2">
          <BotIcon className="w-3.5 h-3.5 text-gray-500" />
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">AI Analysis</span>
        </div>
        <div className="flex flex-wrap gap-2 mb-2">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-purple-500/10 border border-purple-500/30 text-purple-300">
            {cStyle.label} complexity
          </span>
        </div>
        <p className="text-xs text-gray-400 leading-relaxed mb-2">{analysis.summary}</p>
        {analysis.risk_flags && analysis.risk_flags.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <AlertTriangleIcon className="w-3 h-3 text-yellow-400" />
              <p className="text-xs font-medium text-yellow-400">Risk flags</p>
            </div>
            <ul className="space-y-0.5">
              {analysis.risk_flags.map((flag, i) => (
                <li key={i} className="text-xs text-gray-500">· {flag}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    )
  }

  if (eventType === 'push' && analysis.changelog) {
    return (
      <div className="mt-3 pt-3 border-t border-[#30363d]">
        <div className="flex items-center gap-2 mb-2">
          <BotIcon className="w-3.5 h-3.5 text-gray-500" />
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">AI Changelog</span>
        </div>
        <p className="text-xs text-gray-400 leading-relaxed">{analysis.changelog}</p>
      </div>
    )
  }

  return null
}

// ── Event List ────────────────────────────────────────────────

function EventList({ events }) {
  const [expanded, setExpanded] = useState(new Set())

  function toggle(id) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="divide-y divide-[#21262d]">
      {events.map(ev => {
        const cfg = EVENT_CONFIG[ev.event_type] || { label: ev.event_type, color: 'bg-gray-700/40 text-gray-400 border-gray-600', border: 'border-l-gray-600' }
        const hasAI = Boolean(ev.ai_analysis)
        const isExpanded = expanded.has(ev.id)

        return (
          <div key={ev.id} className={`border-l-2 ${cfg.border}`}>
            <div
              className={`grid grid-cols-5 gap-4 px-5 py-3.5 items-center hover:bg-[#21262d]/40 transition ${hasAI ? 'cursor-pointer' : ''}`}
              onClick={() => hasAI && toggle(ev.id)}
            >
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border ${cfg.color} w-fit flex-shrink-0`}>
                  {cfg.label}
                </span>
              </div>
              <span className="text-sm text-gray-300 truncate">{ev.repo?.repo_full_name || '—'}</span>
              <div className="col-span-2 flex items-center gap-2">
                <span className="text-xs text-gray-500 truncate">{ev.action_taken || '—'}</span>
                {hasAI && (
                  <span className="flex-shrink-0 text-xs text-blue-400 bg-blue-500/10 border border-blue-500/20 px-1.5 py-0.5 rounded font-medium flex items-center gap-1">
                    <BotIcon className="w-3 h-3" />
                    AI
                  </span>
                )}
              </div>
              <div className="flex flex-col items-start gap-0.5">
                <span className={`text-xs font-medium ${ev.status === 'processed' ? 'text-green-400' : 'text-red-400'}`}>{ev.status}</span>
                <span className="text-xs text-gray-600">{timeAgo(ev.created_at)}</span>
                {hasAI && (
                  <span className="text-xs text-gray-600">
                    {isExpanded ? <ChevronUpIcon className="w-3 h-3 inline" /> : <ChevronDownIcon className="w-3 h-3 inline" />}
                  </span>
                )}
              </div>
            </div>

            {hasAI && isExpanded && (
              <div className="px-5 pb-4">
                <AIAnalysisPanel analysis={ev.ai_analysis} eventType={ev.event_type} />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Stat Card ────────────────────────────────────────────────

function StatCard({ icon, label, value, sub }) {
  return (
    <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-5 flex items-center gap-4">
      <div className="w-10 h-10 rounded-lg bg-[#21262d] border border-[#30363d] flex items-center justify-center flex-shrink-0 text-gray-400">
        {icon}
      </div>
      <div>
        <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">{label}</p>
        <p className="text-2xl font-bold text-white mt-0.5">{value}</p>
        {sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

// ── Repo Picker (modal) ───────────────────────────────────────

function RepoPicker({ onSelect, onClose, alreadyConnected }) {
  const [search, setSearch] = useState('')
  const [ghRepos, setGhRepos] = useState([])
  const [loading, setLoading] = useState(true)
  const inputRef = useRef(null)

  useEffect(() => {
    apiFetch('/repos/github')
      .then(r => r.json())
      .then(data => { setGhRepos(data.repos || []); setLoading(false) })
      .catch(() => setLoading(false))
    setTimeout(() => inputRef.current?.focus(), 50)
  }, [])

  const connectedNames = new Set(alreadyConnected.map(r => r.repo_full_name))
  const filtered = ghRepos.filter(r =>
    r.full_name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#161b22] border border-[#30363d] rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#30363d]">
          <h3 className="text-white font-semibold">Connect a Repository</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition cursor-pointer">
            <XIcon className="w-4 h-4" />
          </button>
        </div>

        {/* Search */}
        <div className="px-4 py-3 border-b border-[#30363d]">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">
              <SearchIcon className="w-4 h-4" />
            </span>
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search repositories..."
              className="w-full pl-9 pr-4 py-2.5 bg-[#0d1117] border border-[#30363d] rounded-lg text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 text-sm"
            />
          </div>
        </div>

        {/* List */}
        <div className="max-h-80 overflow-y-auto">
          {loading ? (
            <div className="flex flex-col items-center py-10 text-gray-500 text-sm gap-3">
              <div className="w-5 h-5 border-2 border-gray-600 border-t-blue-400 rounded-full animate-spin" />
              Loading repositories...
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-10 text-center text-gray-500 text-sm">No repositories found</div>
          ) : (
            filtered.map(repo => {
              const connected = connectedNames.has(repo.full_name)
              return (
                <button
                  key={repo.full_name}
                  onClick={() => !connected && onSelect(repo.full_name)}
                  disabled={connected}
                  className={`w-full flex items-center justify-between px-5 py-3.5 text-left border-b border-[#21262d] transition ${
                    connected ? 'opacity-40 cursor-not-allowed' : 'hover:bg-[#21262d] cursor-pointer'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-white truncate">{repo.full_name}</span>
                      {repo.private && (
                        <span className="text-xs bg-[#21262d] border border-[#30363d] text-gray-400 px-1.5 py-0.5 rounded-md flex-shrink-0">Private</span>
                      )}
                    </div>
                    {repo.description && (
                      <p className="text-xs text-gray-500 mt-0.5 truncate">{repo.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-3 ml-4 flex-shrink-0 text-xs text-gray-500">
                    {repo.language && <span>{repo.language}</span>}
                    {connected
                      ? <span className="text-green-400 font-medium flex items-center gap-1"><CheckIcon className="w-3 h-3" /> Connected</span>
                      : <span className="text-blue-400">Connect</span>
                    }
                  </div>
                </button>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}

// ── Automation components ─────────────────────────────────────

function AutomationSection({ title, expanded, onToggle, children }) {
  return (
    <div className="bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-[#21262d]/40 transition cursor-pointer"
      >
        <span className="text-sm font-semibold text-white">{title}</span>
        {expanded
          ? <ChevronDownIcon className="w-4 h-4 text-gray-500" />
          : <ChevronRightIcon className="w-4 h-4 text-gray-500" />
        }
      </button>
      {expanded && (
        <div className="px-5 py-5 border-t border-[#30363d] space-y-5">
          {children}
        </div>
      )}
    </div>
  )
}

function ToggleRow({ label, description, checked, onChange, children }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1 min-w-0">
          <p className="text-sm text-white">{label}</p>
          {description && <p className="text-xs text-gray-500 mt-0.5">{description}</p>}
        </div>
        <button
          onClick={() => onChange(!checked)}
          className={`relative flex-shrink-0 w-10 h-5 rounded-full transition-colors duration-200 focus:outline-none cursor-pointer ${
            checked ? 'bg-blue-600' : 'bg-[#30363d]'
          }`}
          role="switch"
          aria-checked={checked}
        >
          <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`} />
        </button>
      </div>
      {checked && children && (
        <div className="pl-5 border-l-2 border-[#30363d] space-y-4">
          {children}
        </div>
      )}
    </div>
  )
}

function AutomationTab() {
  const [settings, setSettings] = useState(null)
  const [expanded, setExpanded] = useState({ issues: true, pull_request: false, push: false })
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState(null)
  const [loading, setLoading] = useState(true)

  const [keywordText, setKeywordText] = useState('')
  const [skipAuthorsText, setSkipAuthorsText] = useState('')
  const [branchText, setBranchText] = useState('')

  useEffect(() => {
    apiFetch('/settings/automation')
      .then(r => r.json())
      .then(data => {
        setSettings(data.settings)
        setKeywordText((data.settings?.issues?.keyword_filter ?? []).join(', '))
        setSkipAuthorsText((data.settings?.pull_request?.skip_authors ?? []).join(', '))
        setBranchText((data.settings?.push?.branch_filter ?? []).join(', '))
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const set = (section, key, value) => {
    setSettings(prev => ({
      ...prev,
      [section]: { ...prev[section], [key]: value },
    }))
  }

  const handleSave = async () => {
    setSaving(true)
    setSaveMsg(null)

    const payloadSettings = {
      ...settings,
      issues: {
        ...settings?.issues,
        keyword_filter: keywordText.split(',').map(s => s.trim()).filter(Boolean),
      },
      pull_request: {
        ...settings?.pull_request,
        skip_authors: skipAuthorsText.split(',').map(s => s.trim()).filter(Boolean),
      },
      push: {
        ...settings?.push,
        branch_filter: branchText.split(',').map(s => s.trim()).filter(Boolean),
      },
    }

    try {
      const res = await apiFetch('/settings/automation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: payloadSettings }),
      })
      if (res.ok) {
        const data = await res.json()
        setSettings(data.settings)
        setSaveMsg({ type: 'success', text: 'Settings saved.' })
      } else {
        setSaveMsg({ type: 'error', text: 'Failed to save settings.' })
      }
    } catch {
      setSaveMsg({ type: 'error', text: 'Network error.' })
    } finally {
      setSaving(false)
      setTimeout(() => setSaveMsg(null), 4000)
    }
  }

  const toggleSection = (key) =>
    setExpanded(prev => ({ ...prev, [key]: !prev[key] }))

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-500">
        <div className="w-5 h-5 border-2 border-gray-600 border-t-blue-400 rounded-full animate-spin mr-3" />
        Loading settings...
      </div>
    )
  }
  if (!settings) {
    return <div className="py-20 text-center text-gray-500 text-sm">Failed to load settings.</div>
  }

  const iss = settings.issues || {}
  const pr  = settings.pull_request || {}
  const psh = settings.push || {}

  return (
    <div className="space-y-4 max-w-2xl">
      <div>
        <h2 className="text-lg font-semibold text-white">Automation Settings</h2>
        <p className="text-sm text-gray-500 mt-0.5">Control how GitBot responds to events on your repos.</p>
      </div>

      {/* Issues */}
      <AutomationSection title="Issues" expanded={expanded.issues} onToggle={() => toggleSection('issues')}>
        <ToggleRow
          label="Auto-label new issues"
          description="Automatically apply a label when an issue is opened"
          checked={iss.auto_label ?? true}
          onChange={v => set('issues', 'auto_label', v)}
        >
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Label name</label>
            <input
              type="text"
              value={iss.label_name ?? 'bot-triaged'}
              onChange={e => set('issues', 'label_name', e.target.value)}
              className="w-full px-3 py-2 bg-[#0d1117] border border-[#30363d] rounded-lg text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500"
              placeholder="bot-triaged"
            />
          </div>
        </ToggleRow>

        <ToggleRow
          label="Send Slack notification"
          description="Post a Slack message when a new issue is opened"
          checked={iss.slack_notify ?? true}
          onChange={v => set('issues', 'slack_notify', v)}
        />

        <ToggleRow
          label="AI Triage"
          description="Classify issues with Gemini — adds priority, category, and sentiment"
          checked={iss.ai_triage ?? true}
          onChange={v => set('issues', 'ai_triage', v)}
        >
          <ToggleRow
            label="Apply AI-suggested label"
            description="Add the AI category as a label in addition to the base label"
            checked={iss.ai_apply_label ?? true}
            onChange={v => set('issues', 'ai_apply_label', v)}
          />
          <ToggleRow
            label="Show priority in Slack (P0–P3)"
            description="Include the AI priority badge in Slack messages"
            checked={iss.ai_show_priority_slack ?? true}
            onChange={v => set('issues', 'ai_show_priority_slack', v)}
          />
          <ToggleRow
            label="Only notify on P0/P1 (skip low priority)"
            description="Skip Slack notification for P2-medium and P3-low issues to reduce noise"
            checked={iss.ai_skip_low_priority ?? false}
            onChange={v => set('issues', 'ai_skip_low_priority', v)}
          />
        </ToggleRow>

        <ToggleRow
          label="Post comment on new issues"
          description="Automatically post a comment when an issue is opened"
          checked={iss.post_comment ?? false}
          onChange={v => set('issues', 'post_comment', v)}
        >
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">
              Comment text
              <span className="ml-2 text-gray-600">— supports {'{{author}}'}, {'{{title}}'}, {'{{ai_summary}}'}, {'{{ai_priority}}'}</span>
            </label>
            <textarea
              rows={3}
              value={iss.comment_text ?? ''}
              onChange={e => set('issues', 'comment_text', e.target.value)}
              className="w-full px-3 py-2 bg-[#0d1117] border border-[#30363d] rounded-lg text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 resize-none"
              placeholder="Thanks for reporting, @{{author}}! We'll triage this soon."
            />
            <p className="text-xs text-gray-600 mt-1">Leave blank to use the AI triage summary.</p>
          </div>
        </ToggleRow>

        <div>
          <label className="block text-xs text-gray-400 mb-1.5">
            Keyword filter <span className="text-gray-600">— only trigger when title contains any of these (comma-separated, leave blank for all)</span>
          </label>
          <input
            type="text"
            value={keywordText}
            onChange={e => setKeywordText(e.target.value)}
            className="w-full px-3 py-2 bg-[#0d1117] border border-[#30363d] rounded-lg text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500"
            placeholder="bug, crash, error"
          />
        </div>
      </AutomationSection>

      {/* Pull Requests */}
      <AutomationSection title="Pull Requests" expanded={expanded.pull_request} onToggle={() => toggleSection('pull_request')}>
        <ToggleRow
          label="Post welcome comment"
          description="Automatically comment on every new PR"
          checked={pr.post_comment ?? true}
          onChange={v => set('pull_request', 'post_comment', v)}
        >
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">
              Comment text
              <span className="ml-2 text-gray-600">— supports {'{{author}}'}, {'{{title}}'}, {'{{ai_summary}}'}</span>
            </label>
            <textarea
              rows={3}
              value={pr.comment_text ?? ''}
              onChange={e => set('pull_request', 'comment_text', e.target.value)}
              className="w-full px-3 py-2 bg-[#0d1117] border border-[#30363d] rounded-lg text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 resize-none"
              placeholder="Thanks for the PR, @{{author}}! The bot has logged this event."
            />
            <p className="text-xs text-gray-600 mt-1">Leave blank to use the AI-generated review summary.</p>
          </div>
        </ToggleRow>

        <ToggleRow
          label="Send Slack notification"
          description="Post a Slack message when a new PR is opened"
          checked={pr.slack_notify ?? true}
          onChange={v => set('pull_request', 'slack_notify', v)}
        />

        <ToggleRow
          label="AI Analysis"
          description="Summarize the PR, estimate complexity, and flag risks using Gemini"
          checked={pr.ai_analysis ?? true}
          onChange={v => set('pull_request', 'ai_analysis', v)}
        >
          <ToggleRow
            label="Show complexity in Slack"
            description="Include the complexity rating (small/medium/large) in the Slack message"
            checked={pr.ai_show_complexity ?? true}
            onChange={v => set('pull_request', 'ai_show_complexity', v)}
          />
          <ToggleRow
            label="Flag risky PRs"
            description="Highlight breaking changes, missing tests, or security issues"
            checked={pr.ai_flag_risks ?? true}
            onChange={v => set('pull_request', 'ai_flag_risks', v)}
          />
        </ToggleRow>

        <ToggleRow
          label="Auto-label PRs"
          description="Automatically apply a label when a new PR is opened"
          checked={pr.auto_label ?? false}
          onChange={v => set('pull_request', 'auto_label', v)}
        >
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Label name</label>
            <input
              type="text"
              value={pr.label_name ?? 'needs-review'}
              onChange={e => set('pull_request', 'label_name', e.target.value)}
              className="w-full px-3 py-2 bg-[#0d1117] border border-[#30363d] rounded-lg text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500"
              placeholder="needs-review"
            />
          </div>
        </ToggleRow>

        <div>
          <label className="block text-xs text-gray-400 mb-1.5">
            Skip authors <span className="text-gray-600">— skip all actions for these GitHub usernames (comma-separated, e.g. dependabot[bot])</span>
          </label>
          <input
            type="text"
            value={skipAuthorsText}
            onChange={e => setSkipAuthorsText(e.target.value)}
            className="w-full px-3 py-2 bg-[#0d1117] border border-[#30363d] rounded-lg text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500"
            placeholder="dependabot[bot], renovate"
          />
        </div>
      </AutomationSection>

      {/* Pushes */}
      <AutomationSection title="Pushes" expanded={expanded.push} onToggle={() => toggleSection('push')}>
        <ToggleRow
          label="Send Slack notification"
          description="Post a Slack message when commits are pushed"
          checked={psh.slack_notify ?? true}
          onChange={v => set('push', 'slack_notify', v)}
        />

        <ToggleRow
          label="AI Changelog summary"
          description="Summarize commit messages into a readable changelog using Gemini"
          checked={psh.ai_changelog ?? true}
          onChange={v => set('push', 'ai_changelog', v)}
        />

        <div>
          <label className="block text-xs text-gray-400 mb-1.5">
            Branch filter <span className="text-gray-600">— only notify for pushes to these branches (comma-separated, leave blank for all branches)</span>
          </label>
          <input
            type="text"
            value={branchText}
            onChange={e => setBranchText(e.target.value)}
            className="w-full px-3 py-2 bg-[#0d1117] border border-[#30363d] rounded-lg text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500"
            placeholder="main, master"
          />
        </div>
      </AutomationSection>

      {/* Save button */}
      <div className="flex items-center gap-4 pt-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-xl transition cursor-pointer disabled:opacity-50 flex items-center gap-2"
        >
          {saving && <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
          {saving ? 'Saving…' : 'Save Settings'}
        </button>
        {saveMsg && (
          <span className={`text-sm ${saveMsg.type === 'success' ? 'text-green-400' : 'text-red-400'}`}>
            {saveMsg.text}
          </span>
        )}
      </div>
    </div>
  )
}

// ── Sidebar ───────────────────────────────────────────────────

const NAV_ITEMS = [
  { id: 'overview',   icon: <GridIcon className="w-4 h-4" />,     label: 'Overview' },
  { id: 'repos',      icon: <FolderIcon className="w-4 h-4" />,   label: 'Repositories' },
  { id: 'events',     icon: <ActivityIcon className="w-4 h-4" />, label: 'Events' },
  { id: 'automation', icon: <BotIcon className="w-4 h-4" />,      label: 'Automation' },
  { id: 'settings',   icon: <SettingsIcon className="w-4 h-4" />, label: 'Settings' },
]

function Sidebar({ active, onChange, username, onLogout }) {
  return (
    <aside className="w-56 flex-shrink-0 bg-[#161b22] border-r border-[#30363d] min-h-screen flex flex-col">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-[#30363d]">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-lg flex items-center justify-center shadow">
            <GitBotLogoIcon className="w-4 h-4 text-white" />
          </div>
          <span className="text-white font-bold text-base tracking-tight">GitBot</span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {NAV_ITEMS.map(item => (
          <button
            key={item.id}
            onClick={() => onChange(item.id)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition cursor-pointer ${
              active === item.id
                ? 'bg-[#21262d] text-white'
                : 'text-gray-400 hover:text-white hover:bg-[#21262d]/60'
            }`}
          >
            <span className="flex-shrink-0">{item.icon}</span>
            {item.label}
          </button>
        ))}
      </nav>

      {/* User */}
      <div className="px-4 py-4 border-t border-[#30363d]">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-gray-600 to-gray-800 flex items-center justify-center text-xs text-white font-bold flex-shrink-0">
            {username?.[0]?.toUpperCase() || '?'}
          </div>
          <span className="text-sm text-gray-300 flex-1 truncate">{username}</span>
          <button
            onClick={onLogout}
            title="Sign out"
            className="text-gray-600 hover:text-red-400 transition cursor-pointer"
          >
            <LogOutIcon className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  )
}

// ── Main Dashboard ────────────────────────────────────────────

export default function DashboardPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const token = localStorage.getItem('token')

  const [activeTab, setActiveTab] = useState('overview')
  const [repos, setRepos] = useState([])
  const [events, setEvents] = useState([])
  const [username, setUsername] = useState('')
  const [slackUrl, setSlackUrl] = useState('')
  const [slackConfigured, setSlackConfigured] = useState(false)
  const [slackOAuthAvailable, setSlackOAuthAvailable] = useState(false)
  const [loading, setLoading] = useState(true)
  const [showPicker, setShowPicker] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState(null)
  const [webhookSetup, setWebhookSetup] = useState(null)
  const [repoToDelete, setRepoToDelete] = useState(null)

  // Auth guard
  useEffect(() => {
    if (!token) {
      navigate('/', { replace: true })
    }
  }, [token, navigate])

  const fetchData = useCallback(async () => {
    if (!token) return
    try {
      const [reposRes, eventsRes, settingsRes] = await Promise.all([
        apiFetch('/repos'),
        apiFetch('/events?limit=50'),
        apiFetch('/settings/'),
      ])
      if (reposRes.ok) setRepos((await reposRes.json()).repos || [])
      if (eventsRes.ok) setEvents((await eventsRes.json()).events || [])
      if (settingsRes.ok) {
        const s = await settingsRes.json()
        setUsername(s.user?.username || '')
        setSlackConfigured(s.slack_configured || false)
        setSlackOAuthAvailable(s.slack_oauth_available || false)
        setSlackUrl(s.slack_configured ? (s.slack_webhook_url_preview || '') : '')
      }
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    if (token) {
      fetchData()
    }
  }, [fetchData, token])

  // Handle ?slack=connected redirect
  useEffect(() => {
    if (!token) return
    const slackParam = searchParams.get('slack')
    const channel = searchParams.get('channel')
    if (slackParam === 'connected') {
      setMessage({ type: 'success', text: `Slack connected${channel ? ` to ${channel}` : ''}.` })
      setActiveTab('settings')
      fetchData()
      window.history.replaceState({}, '', '/dashboard')
    }
  }, [searchParams, fetchData, token])

  if (!token) return null

  const handleLogout = () => {
    localStorage.removeItem('token')
    navigate('/', { replace: true })
  }

  const handleRepoSelect = async (repoFullName) => {
    setShowPicker(false)
    setSubmitting(true)
    setMessage(null)
    setWebhookSetup(null)
    try {
      const res = await apiFetch('/repos/connect', {
        method: 'POST',
        body: JSON.stringify({ repo_full_name: repoFullName }),
      })
      const data = await res.json()
      if (res.ok) {
        if (data.webhook_created) {
          setMessage({ type: 'success', text: data.message })
        } else {
          setWebhookSetup({ repo: repoFullName, url: data.webhook_url, secretHint: data.webhook_secret_hint })
          setMessage({ type: 'success', text: `${repoFullName} connected — see webhook setup below.` })
        }
        fetchData()
      } else {
        setMessage({ type: 'error', text: data.detail || 'Failed to connect repo.' })
      }
    } catch (err) {
      setMessage({ type: 'error', text: err.message })
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeleteRepo = async (repoId, repoFullName) => {
    setSubmitting(true)
    setMessage(null)
    try {
      const res = await apiFetch(`/repos/${repoId}`, { method: 'DELETE' })
      const data = await res.json()
      if (res.ok) {
        setMessage({ type: 'success', text: `Disconnected ${repoFullName}.` })
        setRepoToDelete(null)
        fetchData()
      } else {
        setMessage({ type: 'error', text: data.detail || 'Failed to disconnect repository.' })
      }
    } catch (err) {
      setMessage({ type: 'error', text: err.message || 'Failed to disconnect repository.' })
    } finally {
      setSubmitting(false)
    }
  }

  const handleSaveSlack = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      const res = await apiFetch('/settings/slack', {
        method: 'POST',
        body: JSON.stringify({ slack_webhook_url: slackUrl }),
      })
      const data = await res.json()
      setMessage({ type: res.ok ? 'success' : 'error', text: res.ok ? 'Slack connected.' : (data.detail || 'Failed.') })
      if (res.ok) { setSlackConfigured(true); fetchData() }
    } catch (err) {
      setMessage({ type: 'error', text: err.message })
    } finally {
      setSubmitting(false)
    }
  }

  const handleRemoveSlack = async () => {
    setSubmitting(true)
    try {
      await apiFetch('/settings/slack', { method: 'DELETE' })
      setSlackConfigured(false)
      setSlackUrl('')
      setMessage({ type: 'success', text: 'Slack disconnected.' })
    } catch {
      // silent
    } finally {
      setSubmitting(false)
    }
  }

  const lastEvent = events[0]
  const processedCount = events.filter(e => e.status === 'processed').length

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0d1117] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-gray-500">
          <div className="w-8 h-8 border-2 border-gray-700 border-t-blue-400 rounded-full animate-spin" />
          <p className="text-sm">Loading dashboard...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0d1117] text-white flex">

      {/* Sidebar */}
      <Sidebar
        active={activeTab}
        onChange={setActiveTab}
        username={username}
        onLogout={handleLogout}
      />

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <div className="max-w-5xl mx-auto px-8 py-8 space-y-8">

          {/* Page title */}
          <div>
            <h1 className="text-xl font-bold text-white capitalize">
              {NAV_ITEMS.find(n => n.id === activeTab)?.label}
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {activeTab === 'overview'   && 'Your automation at a glance'}
              {activeTab === 'repos'      && 'Manage connected GitHub repositories'}
              {activeTab === 'events'     && 'All processed GitHub events'}
              {activeTab === 'automation' && 'Configure automation rules'}
              {activeTab === 'settings'   && 'Configure Slack and integrations'}
            </p>
          </div>

          {/* Toast message */}
          {message && (
            <div className={`flex items-start justify-between gap-3 px-4 py-3 rounded-xl border text-sm ${
              message.type === 'success'
                ? 'bg-green-900/20 border-green-800/50 text-green-300'
                : 'bg-red-900/20 border-red-800/50 text-red-300'
            }`}>
              <span>{message.text}</span>
              <button onClick={() => setMessage(null)} className="text-current opacity-60 hover:opacity-100 cursor-pointer flex-shrink-0">
                <XIcon className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* ══ OVERVIEW TAB ══════════════════════════════════ */}
          {activeTab === 'overview' && (
            <div className="space-y-8">
              <div className="grid grid-cols-3 gap-4">
                <StatCard
                  icon={<FolderIcon className="w-5 h-5" />}
                  label="Connected Repos"
                  value={repos.length}
                  sub={repos.length === 0 ? 'None yet' : `${repos.filter(r => r.webhook_id).length} with active webhook`}
                />
                <StatCard
                  icon={<ActivityIcon className="w-5 h-5" />}
                  label="Events Processed"
                  value={processedCount}
                  sub={`${events.length} total received`}
                />
                <StatCard
                  icon={<Icon className="w-5 h-5"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></Icon>}
                  label="Last Event"
                  value={lastEvent ? timeAgo(lastEvent.created_at) : '—'}
                  sub={lastEvent ? lastEvent.event_type : 'No events yet'}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* Repos summary */}
                <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-semibold text-gray-300">Repositories</h3>
                    <button onClick={() => setActiveTab('repos')} className="text-xs text-blue-400 hover:text-blue-300 cursor-pointer">
                      View all
                    </button>
                  </div>
                  {repos.length === 0 ? (
                    <p className="text-sm text-gray-500">No repos connected yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {repos.slice(0, 3).map(repo => (
                        <div key={repo.id} className="flex items-center justify-between text-sm">
                          <span className="text-gray-300 truncate max-w-[160px]">{repo.repo_full_name}</span>
                          {repo.webhook_id
                            ? <span className="flex items-center gap-1 text-green-400 text-xs"><span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />Active</span>
                            : <span className="flex items-center gap-1 text-yellow-400 text-xs"><span className="w-1.5 h-1.5 rounded-full bg-yellow-400 inline-block" />No webhook</span>
                          }
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Slack status */}
                <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-semibold text-gray-300">Slack</h3>
                    <button onClick={() => setActiveTab('settings')} className="text-xs text-blue-400 hover:text-blue-300 cursor-pointer">
                      Settings
                    </button>
                  </div>
                  {slackConfigured ? (
                    <div className="flex items-center gap-2.5">
                      <span className="w-2 h-2 rounded-full bg-green-400 flex-shrink-0" />
                      <div>
                        <p className="text-sm text-green-300 font-medium">Connected</p>
                        <p className="text-xs text-gray-500 mt-0.5">Notifications are active</p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2.5">
                      <span className="w-2 h-2 rounded-full bg-gray-600 flex-shrink-0" />
                      <div>
                        <p className="text-sm text-gray-400">Not connected</p>
                        <p className="text-xs text-gray-600 mt-0.5">Go to Settings to connect</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Recent events preview */}
              {events.length > 0 && (
                <div className="bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden">
                  <div className="flex items-center justify-between px-5 py-4 border-b border-[#30363d]">
                    <h3 className="text-sm font-semibold text-gray-300">Recent Events</h3>
                    <button onClick={() => setActiveTab('events')} className="text-xs text-blue-400 hover:text-blue-300 cursor-pointer">View all</button>
                  </div>
                  <div className="divide-y divide-[#21262d]">
                    {events.slice(0, 5).map(ev => {
                      const cfg = EVENT_CONFIG[ev.event_type] || { label: ev.event_type, color: 'bg-gray-700/40 text-gray-400 border-gray-600', border: 'border-l-gray-600' }
                      return (
                        <div key={ev.id} className={`flex items-center gap-4 px-5 py-3.5 border-l-2 ${cfg.border}`}>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border ${cfg.color} flex-shrink-0`}>
                            {cfg.label}
                          </span>
                          <span className="text-sm text-gray-300 flex-1 truncate">{ev.repo?.repo_full_name || '—'}</span>
                          <span className="text-xs text-gray-500 truncate max-w-[200px] hidden md:block">{ev.action_taken}</span>
                          <span className={`text-xs flex-shrink-0 ${ev.status === 'processed' ? 'text-green-400' : 'text-red-400'}`}>{ev.status}</span>
                          <span className="text-xs text-gray-600 flex-shrink-0">{timeAgo(ev.created_at)}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ══ REPOS TAB ════════════════════════════════════ */}
          {activeTab === 'repos' && (
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-500">{repos.length} {repos.length === 1 ? 'repo' : 'repos'} connected</p>
                <button
                  onClick={() => setShowPicker(true)}
                  disabled={submitting}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition cursor-pointer disabled:opacity-50"
                >
                  {submitting
                    ? <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    : <PlusIcon className="w-4 h-4" />
                  }
                  Connect Repo
                </button>
              </div>

              {showPicker && (
                <RepoPicker
                  onSelect={handleRepoSelect}
                  onClose={() => setShowPicker(false)}
                  alreadyConnected={repos}
                />
              )}

              {/* Webhook setup panel */}
              {webhookSetup && (
                <div className="bg-yellow-950/30 border border-yellow-800/50 rounded-xl p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-yellow-300">Add Webhook Manually</h3>
                    <button onClick={() => setWebhookSetup(null)} className="text-gray-500 hover:text-white text-xs cursor-pointer">dismiss</button>
                  </div>
                  <p className="text-xs text-gray-400">
                    GitHub can't reach localhost. Go to{' '}
                    <a href={`https://github.com/${webhookSetup.repo}/settings/hooks/new`} target="_blank" rel="noopener noreferrer" className="text-blue-400 underline">
                      {webhookSetup.repo} → Settings → Webhooks
                    </a>{' '}
                    and fill in:
                  </p>
                  <div className="space-y-2 text-xs">
                    {[
                      { label: 'Payload URL', value: webhookSetup.url },
                      { label: 'Content type', value: 'application/json' },
                      { label: 'Events', value: 'Issues, Pull requests, Pushes' },
                    ].map(({ label, value }) => (
                      <div key={label} className="flex items-center gap-3">
                        <span className="text-gray-500 w-28 flex-shrink-0">{label}</span>
                        <code className="flex-1 bg-[#0d1117] px-3 py-1.5 rounded-lg font-mono text-green-300 select-all border border-[#30363d]">{value}</code>
                        <button onClick={() => navigator.clipboard.writeText(value)} className="text-xs text-gray-400 hover:text-white cursor-pointer px-2 py-1 bg-[#21262d] rounded border border-[#30363d]">Copy</button>
                      </div>
                    ))}
                    <div className="flex items-center gap-3">
                      <span className="text-gray-500 w-28 flex-shrink-0">Secret</span>
                      <code className="flex-1 bg-[#0d1117] px-3 py-1.5 rounded-lg font-mono text-green-300 border border-[#30363d]">{webhookSetup.secretHint || '••••••••...'}</code>
                      <button
                        onClick={async () => {
                          try {
                            const res = await apiFetch('/settings/webhook-secret')
                            const data = await res.json()
                            await navigator.clipboard.writeText(data.webhook_secret)
                          } catch { /* silent */ }
                        }}
                        className="text-xs text-gray-400 hover:text-white cursor-pointer px-2 py-1 bg-[#21262d] rounded border border-[#30363d]"
                      >
                        Copy
                      </button>
                    </div>
                  </div>
                  <p className="text-xs text-gray-600">Once deployed to Render, webhooks auto-create with your public URL.</p>
                </div>
              )}

              {/* Delete Repo Confirmation Modal */}
              {repoToDelete && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                  <div className="bg-[#161b22] border border-[#30363d] rounded-2xl w-full max-w-md shadow-2xl p-6 space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-red-900/30 border border-red-800/40 flex items-center justify-center flex-shrink-0">
                        <AlertTriangleIcon className="w-5 h-5 text-red-400" />
                      </div>
                      <div>
                        <h3 className="text-base font-semibold text-white">Disconnect Repository?</h3>
                        <p className="text-xs text-gray-500 mt-0.5">This action cannot be undone.</p>
                      </div>
                    </div>
                    <p className="text-sm text-gray-300">
                      Are you sure you want to disconnect <span className="font-semibold text-white">{repoToDelete.repo_full_name}</span>? GitBot will remove the webhook from GitHub and stop tracking events.
                    </p>
                    <div className="flex items-center justify-end gap-3 pt-2">
                      <button
                        onClick={() => setRepoToDelete(null)}
                        disabled={submitting}
                        className="px-4 py-2 bg-[#21262d] hover:bg-[#30363d] text-gray-300 hover:text-white rounded-lg text-sm font-medium transition cursor-pointer disabled:opacity-50"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => handleDeleteRepo(repoToDelete.id, repoToDelete.repo_full_name)}
                        disabled={submitting}
                        className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg text-sm font-medium transition cursor-pointer flex items-center gap-2 disabled:opacity-50"
                      >
                        {submitting && <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
                        {submitting ? 'Deleting...' : 'Disconnect'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Repos table */}
              <div className="bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden">
                {repos.length === 0 ? (
                  <div className="py-16 text-center text-gray-500">
                    <FolderIcon className="w-10 h-10 mx-auto mb-3 opacity-30" />
                    <p className="text-sm font-medium text-gray-400">No repositories connected</p>
                    <p className="text-xs mt-1">Click "Connect Repo" to get started.</p>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-5 gap-4 px-5 py-3 border-b border-[#30363d] text-xs font-medium text-gray-500 uppercase tracking-wide">
                      <span className="col-span-2">Repository</span>
                      <span>Webhook</span>
                      <span>Connected</span>
                      <span className="text-right">Action</span>
                    </div>
                    <div className="divide-y divide-[#21262d]">
                      {repos.map(repo => (
                        <div key={repo.id} className="grid grid-cols-5 gap-4 px-5 py-4 items-center hover:bg-[#21262d]/40 transition">
                          <div className="col-span-2 min-w-0">
                            <p className="text-sm font-medium text-white truncate">{repo.repo_full_name}</p>
                          </div>
                          <div>
                            {repo.webhook_id ? (
                              <span className="inline-flex items-center gap-1.5 text-xs text-green-400">
                                <span className="w-1.5 h-1.5 rounded-full bg-green-400" />Active
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 text-xs text-yellow-400">
                                <span className="w-1.5 h-1.5 rounded-full bg-yellow-400" />No webhook
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-gray-500">{formatDate(repo.created_at)}</div>
                          <div className="text-right">
                            <button
                              onClick={() => setRepoToDelete(repo)}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-red-400 hover:text-red-300 hover:bg-red-950/40 border border-red-900/40 rounded-lg transition cursor-pointer"
                              title="Disconnect repository"
                            >
                              <TrashIcon className="w-3.5 h-3.5" />
                              Disconnect
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* ══ EVENTS TAB ═══════════════════════════════════ */}
          {activeTab === 'events' && (
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-500">{events.length} events received</p>
                <button
                  onClick={fetchData}
                  className="inline-flex items-center gap-2 px-3 py-1.5 text-xs text-gray-400 hover:text-white bg-[#21262d] border border-[#30363d] rounded-lg transition cursor-pointer"
                >
                  <RefreshIcon className="w-3.5 h-3.5" />
                  Refresh
                </button>
              </div>

              <div className="bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden">
                {events.length === 0 ? (
                  <div className="py-16 text-center text-gray-500">
                    <ActivityIcon className="w-10 h-10 mx-auto mb-3 opacity-30" />
                    <p className="text-sm font-medium text-gray-400">No events yet</p>
                    <p className="text-xs mt-1">Events will appear here when GitHub triggers your webhooks.</p>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-5 gap-4 px-5 py-3 border-b border-[#30363d] text-xs font-medium text-gray-500 uppercase tracking-wide">
                      <span>Type</span>
                      <span>Repository</span>
                      <span className="col-span-2">Action</span>
                      <span>Time</span>
                    </div>
                    <EventList events={events} />
                  </>
                )}
              </div>
            </div>
          )}

          {/* ══ AUTOMATION TAB ════════════════════════════════ */}
          {activeTab === 'automation' && (
            <AutomationTab />
          )}

          {/* ══ SETTINGS TAB ═════════════════════════════════ */}
          {activeTab === 'settings' && (
            <div className="space-y-5 max-w-xl">

              {/* Slack section */}
              <div className="bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-[#30363d]">
                  <h3 className="text-sm font-semibold text-white">Slack Notifications</h3>
                  <p className="text-xs text-gray-500 mt-0.5">Receive alerts when GitHub events occur on your repos.</p>
                </div>
                <div className="px-5 py-5">
                  {slackConfigured ? (
                    <div className="space-y-4">
                      <div className="flex items-center gap-3 p-4 bg-green-900/20 border border-green-800/40 rounded-xl">
                        <div className="w-8 h-8 bg-green-900/40 rounded-lg flex items-center justify-center flex-shrink-0">
                          <CheckIcon className="w-4 h-4 text-green-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-green-300 font-medium">Slack connected</p>
                          <p className="text-xs text-gray-500 mt-0.5 truncate">{slackUrl}</p>
                        </div>
                        <button
                          onClick={handleRemoveSlack}
                          disabled={submitting}
                          className="flex-shrink-0 px-3 py-1.5 text-xs text-gray-400 hover:text-white bg-[#21262d] border border-[#30363d] rounded-lg transition cursor-pointer disabled:opacity-50"
                        >
                          Disconnect
                        </button>
                      </div>
                    </div>
                  ) : slackOAuthAvailable ? (
                    <div className="space-y-4">
                      <button
                        onClick={async () => {
                          try {
                            const res = await apiFetch('/auth/slack')
                            const data = await res.json()
                            if (data.redirect_url) window.location.href = data.redirect_url
                          } catch (err) {
                            setMessage({ type: 'error', text: 'Failed to start Slack OAuth: ' + err.message })
                          }
                        }}
                        className="inline-flex items-center gap-3 px-5 py-3 bg-[#4A154B] hover:bg-[#611f69] text-white rounded-xl text-sm font-medium transition cursor-pointer"
                      >
                        <svg width="18" height="18" viewBox="0 0 122.8 122.8" fill="currentColor">
                          <path d="M25.8 77.6c0 7.1-5.8 12.9-12.9 12.9S0 84.7 0 77.6s5.8-12.9 12.9-12.9h12.9v12.9zm6.5 0c0-7.1 5.8-12.9 12.9-12.9s12.9 5.8 12.9 12.9v32.3c0 7.1-5.8 12.9-12.9 12.9s-12.9-5.8-12.9-12.9V77.6z" />
                          <path d="M45.2 25.8c-7.1 0-12.9-5.8-12.9-12.9S38.1 0 45.2 0s12.9 5.8 12.9 12.9v12.9H45.2zm0 6.5c7.1 0 12.9 5.8 12.9 12.9s-5.8 12.9-12.9 12.9H12.9C5.8 58.1 0 52.3 0 45.2s5.8-12.9 12.9-12.9h32.3z" />
                          <path d="M97 45.2c0-7.1 5.8-12.9 12.9-12.9s12.9 5.8 12.9 12.9-5.8 12.9-12.9 12.9H97V45.2zm-6.5 0c0 7.1-5.8 12.9-12.9 12.9s-12.9-5.8-12.9-12.9V12.9C64.7 5.8 70.5 0 77.6 0s12.9 5.8 12.9 12.9v32.3z" />
                          <path d="M77.6 97c7.1 0 12.9 5.8 12.9 12.9s-5.8 12.9-12.9 12.9-12.9-5.8-12.9-12.9V97h12.9zm0-6.5c-7.1 0-12.9-5.8-12.9-12.9s5.8-12.9 12.9-12.9h32.3c7.1 0 12.9 5.8 12.9 12.9s-5.8 12.9-12.9 12.9H77.6z" />
                        </svg>
                        Add to Slack
                      </button>
                      <p className="text-xs text-gray-500">Pick your workspace and channel — we'll handle the rest.</p>
                    </div>
                  ) : (
                    <form onSubmit={handleSaveSlack} className="space-y-3">
                      <div>
                        <label className="block text-xs text-gray-400 mb-2">Webhook URL</label>
                        <input
                          type="url"
                          value={slackUrl}
                          onChange={e => setSlackUrl(e.target.value)}
                          placeholder="https://hooks.slack.com/services/..."
                          className="w-full px-4 py-2.5 bg-[#0d1117] border border-[#30363d] rounded-xl text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 text-sm"
                          required
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={submitting}
                        className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-medium transition cursor-pointer disabled:opacity-50"
                      >
                        {submitting ? 'Saving...' : 'Save'}
                      </button>
                      <p className="text-xs text-gray-600">Slack → Apps → Incoming Webhooks → Add New Webhook to Channel</p>
                    </form>
                  )}
                </div>
              </div>

              {/* Account section */}
              <div className="bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-[#30363d]">
                  <h3 className="text-sm font-semibold text-white">Account</h3>
                </div>
                <div className="px-5 py-5 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-gray-600 to-gray-800 border border-[#30363d] flex items-center justify-center text-sm font-bold">
                      {username?.[0]?.toUpperCase() || '?'}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white">@{username}</p>
                      <p className="text-xs text-gray-500">GitHub account</p>
                    </div>
                  </div>
                  <button
                    onClick={handleLogout}
                    className="px-4 py-2 text-xs text-red-400 hover:text-white hover:bg-red-900/30 border border-red-900/50 rounded-lg transition cursor-pointer"
                  >
                    Sign out
                  </button>
                </div>
              </div>
            </div>
          )}

        </div>
      </main>
    </div>
  )
}
