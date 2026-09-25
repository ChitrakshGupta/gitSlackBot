/**
 * Dashboard — professional redesign.
 * Sidebar navigation + stat cards + tabbed content.
 */

import { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { apiFetch } from '../api'




// ── Helpers ───────────────────────────────────────────────────

const EVENT_CONFIG = {
  issues:       { emoji: '🐛', label: 'Issue',   color: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30', border: 'border-l-yellow-500' },
  pull_request: { emoji: '🔀', label: 'PR',       color: 'bg-purple-500/20 text-purple-300 border-purple-500/30', border: 'border-l-purple-500' },
  push:         { emoji: '🚀', label: 'Push',     color: 'bg-blue-500/20 text-blue-300 border-blue-500/30',       border: 'border-l-blue-500' },
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

// ── Stat Card ────────────────────────────────────────────────

function StatCard({ icon, label, value, sub }) {
  return (
    <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-5 flex items-center gap-4">
      <div className="w-10 h-10 rounded-lg bg-[#21262d] border border-[#30363d] flex items-center justify-center text-lg flex-shrink-0">
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

// ── Repo Picker ───────────────────────────────────────────────

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
          <button onClick={onClose} className="text-gray-500 hover:text-white transition cursor-pointer text-lg leading-none">✕</button>
        </div>

        {/* Search */}
        <div className="px-4 py-3 border-b border-[#30363d]">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">🔍</span>
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
                      ? <span className="text-green-400 font-medium">✓ Connected</span>
                      : <span className="text-blue-400">Connect →</span>
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

// ── Sidebar ───────────────────────────────────────────────────

const NAV_ITEMS = [
  { id: 'overview',  icon: '⊞', label: 'Overview' },
  { id: 'repos',     icon: '📁', label: 'Repositories' },
  { id: 'events',    icon: '⚡', label: 'Events' },
  { id: 'settings',  icon: '⚙', label: 'Settings' },
]

function Sidebar({ active, onChange, username, onLogout }) {
  return (
    <aside className="w-56 flex-shrink-0 bg-[#161b22] border-r border-[#30363d] min-h-screen flex flex-col">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-[#30363d]">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center text-sm">
            🤖
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
            <span className="text-base">{item.icon}</span>
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
            className="text-gray-600 hover:text-red-400 transition cursor-pointer text-sm"
          >
            ↩
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

  // Auth guard
  if (!token) { navigate('/', { replace: true }); return null }

  const fetchData = useCallback(async () => {
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
      // silent — loading errors handled by empty state UI
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => { fetchData() }, [fetchData])

  // Handle ?slack=connected redirect from Slack OAuth
  useEffect(() => {
    const slackParam = searchParams.get('slack')
    const channel = searchParams.get('channel')
    if (slackParam === 'connected') {
      setMessage({ type: 'success', text: `✅ Slack connected${channel ? ` to ${channel}` : ''}!` })
      setActiveTab('settings')
      fetchData()
      window.history.replaceState({}, '', '/dashboard')
    }
  }, [searchParams, fetchData])

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
          setMessage({ type: 'success', text: `✅ ${repoFullName} connected — see webhook setup below.` })
        }
        fetchData()
      } else {
        setMessage({ type: 'error', text: data.detail || 'Failed to connect repo' })
      }
    } catch (err) {
      setMessage({ type: 'error', text: err.message })
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
      setMessage({ type: res.ok ? 'success' : 'error', text: res.ok ? '✅ Slack connected!' : (data.detail || 'Failed') })
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

  // Derived stats
  const lastEvent = events[0]
  const processedCount = events.filter(e => e.status === 'processed').length

  // ── Loading skeleton ──
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
              {activeTab === 'overview' && 'Your automation at a glance'}
              {activeTab === 'repos' && 'Manage connected GitHub repositories'}
              {activeTab === 'events' && 'All processed GitHub events'}
              {activeTab === 'settings' && 'Configure Slack and integrations'}
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
              <button onClick={() => setMessage(null)} className="text-current opacity-60 hover:opacity-100 cursor-pointer flex-shrink-0">✕</button>
            </div>
          )}

          {/* ══ OVERVIEW TAB ══════════════════════════════════ */}
          {activeTab === 'overview' && (
            <div className="space-y-8">
              {/* Stat cards */}
              <div className="grid grid-cols-3 gap-4">
                <StatCard icon="📁" label="Connected Repos" value={repos.length} sub={repos.length === 0 ? 'None yet' : `${repos.filter(r => r.webhook_id).length} with active webhook`} />
                <StatCard icon="⚡" label="Events Processed" value={processedCount} sub={`${events.length} total received`} />
                <StatCard icon="🕐" label="Last Event" value={lastEvent ? timeAgo(lastEvent.created_at) : '—'} sub={lastEvent ? lastEvent.event_type : 'No events yet'} />
              </div>

              {/* Quick status */}
              <div className="grid grid-cols-2 gap-4">
                {/* Repos summary */}
                <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-semibold text-gray-300">Repositories</h3>
                    <button
                      onClick={() => setActiveTab('repos')}
                      className="text-xs text-blue-400 hover:text-blue-300 cursor-pointer"
                    >
                      View all →
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
                            ? <span className="flex items-center gap-1 text-green-400 text-xs"><span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block"></span>Active</span>
                            : <span className="flex items-center gap-1 text-yellow-400 text-xs"><span className="w-1.5 h-1.5 rounded-full bg-yellow-400 inline-block"></span>No webhook</span>
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
                    <button
                      onClick={() => setActiveTab('settings')}
                      className="text-xs text-blue-400 hover:text-blue-300 cursor-pointer"
                    >
                      Settings →
                    </button>
                  </div>
                  {slackConfigured ? (
                    <div className="flex items-center gap-2.5">
                      <span className="w-2 h-2 rounded-full bg-green-400 flex-shrink-0"></span>
                      <div>
                        <p className="text-sm text-green-300 font-medium">Connected</p>
                        <p className="text-xs text-gray-500 mt-0.5">Notifications are active</p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2.5">
                      <span className="w-2 h-2 rounded-full bg-gray-600 flex-shrink-0"></span>
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
                    <button onClick={() => setActiveTab('events')} className="text-xs text-blue-400 hover:text-blue-300 cursor-pointer">View all →</button>
                  </div>
                  <div className="divide-y divide-[#21262d]">
                    {events.slice(0, 5).map(ev => {
                      const cfg = EVENT_CONFIG[ev.event_type] || { emoji: '📌', label: ev.event_type, color: 'bg-gray-700/40 text-gray-400 border-gray-600', border: 'border-l-gray-600' }
                      return (
                        <div key={ev.id} className={`flex items-center gap-4 px-5 py-3.5 border-l-2 ${cfg.border}`}>
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium border ${cfg.color} flex-shrink-0`}>
                            {cfg.emoji} {cfg.label}
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
              {/* Connect button */}
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-500">{repos.length} {repos.length === 1 ? 'repo' : 'repos'} connected</p>
                <button
                  onClick={() => setShowPicker(true)}
                  disabled={submitting}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition cursor-pointer disabled:opacity-50"
                >
                  {submitting
                    ? <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    : <span>+</span>
                  }
                  Connect Repo
                </button>
              </div>

              {/* Repo picker modal */}
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
                    <h3 className="text-sm font-semibold text-yellow-300">⚙ Add Webhook Manually</h3>
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
                    {/* Secret — fetched on copy */}
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

              {/* Repos table */}
              <div className="bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden">
                {repos.length === 0 ? (
                  <div className="py-16 text-center text-gray-500">
                    <p className="text-4xl mb-3">📁</p>
                    <p className="text-sm font-medium text-gray-400">No repositories connected</p>
                    <p className="text-xs mt-1">Click "Connect Repo" to get started</p>
                  </div>
                ) : (
                  <>
                    {/* Table header */}
                    <div className="grid grid-cols-4 gap-4 px-5 py-3 border-b border-[#30363d] text-xs font-medium text-gray-500 uppercase tracking-wide">
                      <span className="col-span-2">Repository</span>
                      <span>Webhook</span>
                      <span>Connected</span>
                    </div>
                    <div className="divide-y divide-[#21262d]">
                      {repos.map(repo => (
                        <div key={repo.id} className="grid grid-cols-4 gap-4 px-5 py-4 items-center hover:bg-[#21262d]/40 transition">
                          <div className="col-span-2">
                            <p className="text-sm font-medium text-white">{repo.repo_full_name}</p>
                          </div>
                          <div>
                            {repo.webhook_id ? (
                              <span className="inline-flex items-center gap-1.5 text-xs text-green-400">
                                <span className="w-1.5 h-1.5 rounded-full bg-green-400"></span>Active
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 text-xs text-yellow-400">
                                <span className="w-1.5 h-1.5 rounded-full bg-yellow-400"></span>No webhook
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-gray-500">{formatDate(repo.created_at)}</div>
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
                <button onClick={fetchData} className="inline-flex items-center gap-2 px-3 py-1.5 text-xs text-gray-400 hover:text-white bg-[#21262d] border border-[#30363d] rounded-lg transition cursor-pointer">
                  ↺ Refresh
                </button>
              </div>

              <div className="bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden">
                {events.length === 0 ? (
                  <div className="py-16 text-center text-gray-500">
                    <p className="text-4xl mb-3">⚡</p>
                    <p className="text-sm font-medium text-gray-400">No events yet</p>
                    <p className="text-xs mt-1">Events will appear here when GitHub triggers your webhooks</p>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-5 gap-4 px-5 py-3 border-b border-[#30363d] text-xs font-medium text-gray-500 uppercase tracking-wide">
                      <span>Type</span>
                      <span>Repository</span>
                      <span className="col-span-2">Action</span>
                      <span>Time</span>
                    </div>
                    <div className="divide-y divide-[#21262d]">
                      {events.map(ev => {
                        const cfg = EVENT_CONFIG[ev.event_type] || { emoji: '📌', label: ev.event_type, color: 'bg-gray-700/40 text-gray-400 border-gray-600', border: 'border-l-gray-600' }
                        return (
                          <div key={ev.id} className={`grid grid-cols-5 gap-4 px-5 py-3.5 items-center border-l-2 ${cfg.border} hover:bg-[#21262d]/40 transition`}>
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium border ${cfg.color} w-fit`}>
                              {cfg.emoji} {cfg.label}
                            </span>
                            <span className="text-sm text-gray-300 truncate">{ev.repo?.repo_full_name || '—'}</span>
                            <span className="col-span-2 text-xs text-gray-500 truncate">{ev.action_taken || '—'}</span>
                            <div className="flex flex-col">
                              <span className={`text-xs font-medium ${ev.status === 'processed' ? 'text-green-400' : 'text-red-400'}`}>{ev.status}</span>
                              <span className="text-xs text-gray-600">{timeAgo(ev.created_at)}</span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* ══ SETTINGS TAB ═════════════════════════════════ */}
          {activeTab === 'settings' && (
            <div className="space-y-5 max-w-xl">

              {/* Slack section */}
              <div className="bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-[#30363d]">
                  <h3 className="text-sm font-semibold text-white">Slack Notifications</h3>
                  <p className="text-xs text-gray-500 mt-0.5">Receive alerts when GitHub events occur on your repos</p>
                </div>
                <div className="px-5 py-5">
                  {slackConfigured ? (
                    /* Connected state */
                    <div className="space-y-4">
                      <div className="flex items-center gap-3 p-4 bg-green-900/20 border border-green-800/40 rounded-xl">
                        <div className="w-8 h-8 bg-green-900/40 rounded-lg flex items-center justify-center text-green-400 flex-shrink-0">✓</div>
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
                    /* OAuth button */
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
                    /* Manual input fallback */
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
