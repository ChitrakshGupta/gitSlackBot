/**
 * Onboarding wizard — shown to new users after first login.
 * Steps:
 *   0. Welcome (GitHub already connected via OAuth)
 *   1. Connect a GitHub repo
 *   2. Connect Slack
 *   3. All set → go to dashboard
 *
 * Bug fix: moved the second useEffect above the conditional return
 * so all hooks are called unconditionally (Rules of Hooks).
 */

import { useEffect, useState, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { apiFetch } from '../api'

// ── SVG icons ─────────────────────────────────────────────────

function CheckIcon({ className = 'w-4 h-4' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

function GitBotLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-white">
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      <circle cx="12" cy="16" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  )
}

function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  )
}

// ── Step indicator ────────────────────────────────────────────

function StepIndicator({ current, total }) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
            i < current
              ? 'bg-green-500 text-white'
              : i === current
              ? 'bg-blue-600 text-white ring-4 ring-blue-500/20'
              : 'bg-[#21262d] text-gray-500 border border-[#30363d]'
          }`}>
            {i < current ? <CheckIcon className="w-3.5 h-3.5" /> : i + 1}
          </div>
          {i < total - 1 && (
            <div className={`w-10 h-0.5 rounded-full transition-all ${i < current ? 'bg-green-500' : 'bg-[#30363d]'}`} />
          )}
        </div>
      ))}
    </div>
  )
}

// ── Repo Picker ────────────────────────────────────────────────

function RepoList({ onSelect, alreadyConnected }) {
  const [search, setSearch] = useState('')
  const [ghRepos, setGhRepos] = useState([])
  const [loading, setLoading] = useState(true)
  const inputRef = useRef(null)

  useEffect(() => {
    apiFetch('/repos/github')
      .then(r => r.json())
      .then(data => { setGhRepos(data.repos || []); setLoading(false) })
      .catch(() => setLoading(false))
    setTimeout(() => inputRef.current?.focus(), 100)
  }, [])

  const connectedNames = new Set(alreadyConnected.map(r => r.repo_full_name))
  const filtered = ghRepos.filter(r =>
    r.full_name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-3">
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">
          <SearchIcon />
        </span>
        <input
          ref={inputRef}
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search your GitHub repositories..."
          className="w-full pl-9 pr-4 py-2.5 bg-[#0d1117] border border-[#30363d] rounded-xl text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 text-sm"
        />
      </div>
      <div className="max-h-64 overflow-y-auto rounded-xl border border-[#30363d] bg-[#0d1117] divide-y divide-[#21262d]">
        {loading ? (
          <div className="flex flex-col items-center py-10 gap-3 text-gray-500 text-sm">
            <div className="w-5 h-5 border-2 border-gray-600 border-t-blue-400 rounded-full animate-spin" />
            Loading your repos...
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-8 text-center text-gray-500 text-sm">No repos found</div>
        ) : (
          filtered.map(repo => {
            const connected = connectedNames.has(repo.full_name)
            return (
              <button
                key={repo.full_name}
                onClick={() => !connected && onSelect(repo.full_name)}
                disabled={connected}
                className={`w-full flex items-center justify-between px-4 py-3.5 text-left transition ${
                  connected ? 'opacity-40 cursor-not-allowed' : 'hover:bg-[#21262d] cursor-pointer'
                }`}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-white">{repo.full_name}</span>
                    {repo.private && (
                      <span className="text-xs bg-[#21262d] border border-[#30363d] text-gray-400 px-1.5 py-0.5 rounded-md">Private</span>
                    )}
                  </div>
                  {repo.description && (
                    <p className="text-xs text-gray-500 mt-0.5 truncate">{repo.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 ml-4 flex-shrink-0 text-xs">
                  {repo.language && <span className="text-gray-500">{repo.language}</span>}
                  {connected
                    ? <span className="text-green-400 font-medium flex items-center gap-1"><CheckIcon className="w-3 h-3" /> Connected</span>
                    : <span className="text-blue-400">Select</span>
                  }
                </div>
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}

// ── Feature cards data (no emoji) ─────────────────────────────

const FEATURE_CARDS = [
  { title: 'Auto-label', desc: 'Issues get tagged automatically' },
  { title: 'PR Comments', desc: 'Welcome message on every PR' },
  { title: 'Slack Alerts', desc: 'Real-time push notifications' },
]

// ── Main Onboarding ───────────────────────────────────────────

export default function OnboardingPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const token = localStorage.getItem('token')

  const [step, setStep] = useState(0)
  const [username, setUsername] = useState('')
  const [repos, setRepos] = useState([])
  const [slackConfigured, setSlackConfigured] = useState(false)
  const [slackOAuthAvailable, setSlackOAuthAvailable] = useState(false)
  const [slackUrl, setSlackUrl] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [connectedRepo, setConnectedRepo] = useState(null)
  const [webhookCreated, setWebhookCreated] = useState(false)
  const [checking, setChecking] = useState(true)

  // Auth guard — must be before any conditional return
  useEffect(() => {
    if (!token) {
      navigate('/', { replace: true })
    }
  }, [token, navigate])

  // On mount: fetch state, decide if onboarding is needed
  // Must be before any conditional return (Rules of Hooks)
  useEffect(() => {
    if (!token) return
    async function check() {
      try {
        const [reposRes, settingsRes] = await Promise.all([
          apiFetch('/repos'),
          apiFetch('/settings/'),
        ])
        const reposData = reposRes.ok ? await reposRes.json() : {}
        const settingsData = settingsRes.ok ? await settingsRes.json() : {}

        const userRepos = reposData.repos || []
        const slack = settingsData.slack_configured || false
        const slackOAuth = settingsData.slack_oauth_available || false
        const user = settingsData.user?.username || ''

        setRepos(userRepos)
        setSlackConfigured(slack)
        setSlackOAuthAvailable(slackOAuth)
        setUsername(user)

        // Coming back from Slack OAuth → advance to Done
        if (searchParams.get('slack') === 'connected') {
          setSlackConfigured(true)
          window.history.replaceState({}, '', '/onboarding')
          setStep(3)
          setChecking(false)
          return
        }

        // Returning user: already set up → skip to dashboard
        if (userRepos.length > 0 && slack) {
          navigate('/dashboard', { replace: true })
          return
        }

        // Partially set up: already has repos but no slack → jump to slack step
        if (userRepos.length > 0 && !slack) {
          setStep(2)
          return
        }

        // New user: start from welcome
        setStep(0)
      } catch {
        setStep(0)
      } finally {
        setChecking(false)
      }
    }
    check()
  }, [navigate, searchParams, token])

  if (!token) return null

  const handleRepoConnect = async (repoFullName) => {
    setSubmitting(true)
    setError(null)
    try {
      const res = await apiFetch('/repos/connect', {
        method: 'POST',
        body: JSON.stringify({ repo_full_name: repoFullName }),
      })
      const data = await res.json()
      if (res.ok) {
        setConnectedRepo(repoFullName)
        setWebhookCreated(data.webhook_created)
        setRepos(prev => [...prev, { repo_full_name: repoFullName, webhook_id: data.webhook_id }])
        setStep(2)
      } else {
        setError(data.detail || 'Failed to connect repo')
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleSlackOAuth = async () => {
    try {
      const res = await apiFetch('/auth/slack')
      const data = await res.json()
      if (data.redirect_url) window.location.href = data.redirect_url
    } catch (err) {
      setError('Failed to start Slack OAuth: ' + err.message)
    }
  }

  const handleSlackManual = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const res = await apiFetch('/settings/slack', {
        method: 'POST',
        body: JSON.stringify({ slack_webhook_url: slackUrl }),
      })
      if (res.ok) {
        setSlackConfigured(true)
        setStep(3)
      } else {
        const data = await res.json()
        setError(data.detail || 'Failed to save Slack URL')
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (checking) {
    return (
      <div className="min-h-screen bg-[#0d1117] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-gray-500">
          <div className="w-8 h-8 border-2 border-gray-700 border-t-blue-400 rounded-full animate-spin" />
          <p className="text-sm">Setting up...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0d1117] flex items-center justify-center p-4">
      {/* Decorative dots */}
      <div className="fixed top-10 right-10 grid grid-cols-5 gap-3 opacity-[0.07] pointer-events-none">
        {Array.from({ length: 25 }).map((_, i) => <div key={i} className="w-1 h-1 rounded-full bg-gray-400" />)}
      </div>
      <div className="fixed bottom-10 left-10 grid grid-cols-5 gap-3 opacity-[0.07] pointer-events-none">
        {Array.from({ length: 25 }).map((_, i) => <div key={i} className="w-1 h-1 rounded-full bg-gray-400" />)}
      </div>

      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2.5 mb-6">
            <div className="w-9 h-9 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-xl flex items-center justify-center shadow-lg">
              <GitBotLogo />
            </div>
            <span className="text-white text-xl font-bold tracking-tight">GitBot</span>
          </div>
          <StepIndicator current={step} total={4} />
        </div>

        {/* Card */}
        <div className="bg-[#161b22] border border-[#30363d] rounded-2xl shadow-2xl overflow-hidden">

          {/* ── STEP 0: Welcome ── */}
          {step === 0 && (
            <div className="p-8 text-center space-y-6">
              <div className="w-16 h-16 bg-green-900/30 border border-green-700/40 rounded-2xl flex items-center justify-center mx-auto">
                <CheckIcon className="w-8 h-8 text-green-400" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">Welcome, @{username}!</h2>
                <p className="text-gray-400 text-sm mt-2">
                  Your GitHub account is connected. Now let's set up your automation in 2 quick steps.
                </p>
              </div>

              {/* Feature cards */}
              <div className="grid grid-cols-3 gap-3 text-left">
                {FEATURE_CARDS.map(({ title, desc }) => (
                  <div key={title} className="bg-[#0d1117] border border-[#30363d] rounded-xl p-3 text-center">
                    <p className="text-xs font-semibold text-white">{title}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
                  </div>
                ))}
              </div>

              <button
                onClick={() => setStep(1)}
                className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl transition cursor-pointer"
              >
                Get started
              </button>
            </div>
          )}

          {/* ── STEP 1: Connect Repo ── */}
          {step === 1 && (
            <div className="p-8 space-y-6">
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-sm font-bold text-white">1</div>
                  <h2 className="text-lg font-bold text-white">Connect a repository</h2>
                </div>
                <p className="text-gray-400 text-sm ml-11">
                  Pick a GitHub repo to monitor. GitBot will auto-create a webhook.
                </p>
              </div>

              {error && (
                <div className="bg-red-900/30 border border-red-800/50 text-red-300 rounded-xl px-4 py-3 text-sm">
                  {error}
                </div>
              )}

              {submitting ? (
                <div className="flex flex-col items-center py-10 gap-3 text-gray-400 text-sm">
                  <div className="w-8 h-8 border-2 border-gray-600 border-t-blue-400 rounded-full animate-spin" />
                  Connecting repo and creating webhook...
                </div>
              ) : (
                <RepoList onSelect={handleRepoConnect} alreadyConnected={repos} />
              )}

              <div className="flex justify-between pt-2">
                <button onClick={() => setStep(0)} className="text-sm text-gray-500 hover:text-white transition cursor-pointer">Back</button>
                <button onClick={() => setStep(2)} className="text-sm text-gray-500 hover:text-white transition cursor-pointer">Skip for now</button>
              </div>
            </div>
          )}

          {/* ── STEP 2: Connect Slack ── */}
          {step === 2 && (
            <div className="p-8 space-y-6">
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-sm font-bold text-white">2</div>
                  <h2 className="text-lg font-bold text-white">Connect Slack</h2>
                </div>
                <p className="text-gray-400 text-sm ml-11">
                  Get real-time notifications when GitHub events happen.
                </p>
              </div>

              {/* Repo connected status */}
              {connectedRepo && (
                <div className="flex items-center gap-2.5 px-4 py-3 bg-green-900/20 border border-green-800/40 rounded-xl text-sm">
                  <CheckIcon className="w-4 h-4 text-green-400 flex-shrink-0" />
                  <span className="text-green-300 font-medium">{connectedRepo}</span>
                  <span className="text-gray-500">— {webhookCreated ? 'webhook active' : 'connected'}</span>
                </div>
              )}

              {error && (
                <div className="bg-red-900/30 border border-red-800/50 text-red-300 rounded-xl px-4 py-3 text-sm">
                  {error}
                </div>
              )}

              {slackConfigured ? (
                <div className="flex items-center gap-3 p-4 bg-green-900/20 border border-green-800/40 rounded-xl">
                  <CheckIcon className="w-5 h-5 text-green-400 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-green-300">Slack already connected</p>
                    <p className="text-xs text-gray-500 mt-0.5">You're all set.</p>
                  </div>
                </div>
              ) : slackOAuthAvailable ? (
                <div className="space-y-3">
                  <button
                    onClick={handleSlackOAuth}
                    className="w-full inline-flex items-center justify-center gap-3 py-3.5 bg-[#4A154B] hover:bg-[#611f69] text-white rounded-xl text-sm font-semibold transition cursor-pointer"
                  >
                    <svg width="20" height="20" viewBox="0 0 122.8 122.8" fill="currentColor">
                      <path d="M25.8 77.6c0 7.1-5.8 12.9-12.9 12.9S0 84.7 0 77.6s5.8-12.9 12.9-12.9h12.9v12.9zm6.5 0c0-7.1 5.8-12.9 12.9-12.9s12.9 5.8 12.9 12.9v32.3c0 7.1-5.8 12.9-12.9 12.9s-12.9-5.8-12.9-12.9V77.6z" />
                      <path d="M45.2 25.8c-7.1 0-12.9-5.8-12.9-12.9S38.1 0 45.2 0s12.9 5.8 12.9 12.9v12.9H45.2zm0 6.5c7.1 0 12.9 5.8 12.9 12.9s-5.8 12.9-12.9 12.9H12.9C5.8 58.1 0 52.3 0 45.2s5.8-12.9 12.9-12.9h32.3z" />
                      <path d="M97 45.2c0-7.1 5.8-12.9 12.9-12.9s12.9 5.8 12.9 12.9-5.8 12.9-12.9 12.9H97V45.2zm-6.5 0c0 7.1-5.8 12.9-12.9 12.9s-12.9-5.8-12.9-12.9V12.9C64.7 5.8 70.5 0 77.6 0s12.9 5.8 12.9 12.9v32.3z" />
                      <path d="M77.6 97c7.1 0 12.9 5.8 12.9 12.9s-5.8 12.9-12.9 12.9-12.9-5.8-12.9-12.9V97h12.9zm0-6.5c-7.1 0-12.9-5.8-12.9-12.9s5.8-12.9 12.9-12.9h32.3c7.1 0 12.9 5.8 12.9 12.9s-5.8 12.9-12.9 12.9H77.6z" />
                    </svg>
                    Add to Slack
                  </button>
                  <p className="text-xs text-gray-500 text-center">Pick your workspace and channel — we'll handle the rest.</p>
                </div>
              ) : (
                <form onSubmit={handleSlackManual} className="space-y-3">
                  <input
                    type="url"
                    value={slackUrl}
                    onChange={e => setSlackUrl(e.target.value)}
                    placeholder="https://hooks.slack.com/services/..."
                    className="w-full px-4 py-2.5 bg-[#0d1117] border border-[#30363d] rounded-xl text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 text-sm"
                    required
                  />
                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full py-2.5 bg-[#4A154B] hover:bg-[#611f69] text-white rounded-xl text-sm font-semibold transition cursor-pointer disabled:opacity-50"
                  >
                    {submitting ? 'Connecting...' : 'Connect Slack'}
                  </button>
                </form>
              )}

              <div className="flex justify-between pt-2">
                <button onClick={() => setStep(1)} className="text-sm text-gray-500 hover:text-white transition cursor-pointer">Back</button>
                <button
                  onClick={() => setStep(3)}
                  className="text-sm text-gray-500 hover:text-white transition cursor-pointer"
                >
                  {slackConfigured ? 'Continue' : 'Skip for now'}
                </button>
              </div>
            </div>
          )}

          {/* ── STEP 3: Done ── */}
          {step === 3 && (
            <div className="p-8 text-center space-y-6">
              <div className="w-16 h-16 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl flex items-center justify-center mx-auto shadow-lg shadow-blue-500/20">
                <CheckIcon className="w-8 h-8 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">You're all set!</h2>
                <p className="text-gray-400 text-sm mt-2">GitBot is ready to automate your GitHub workflow.</p>
              </div>

              {/* Summary */}
              <div className="space-y-2 text-left">
                <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-sm ${
                  repos.length > 0
                    ? 'bg-green-900/20 border-green-800/40 text-green-300'
                    : 'bg-[#21262d] border-[#30363d] text-gray-500'
                }`}>
                  {repos.length > 0
                    ? <CheckIcon className="w-4 h-4 flex-shrink-0" />
                    : <span className="w-4 h-4 rounded-full border border-gray-600 flex-shrink-0" />
                  }
                  <span>{repos.length > 0 ? `${repos.length} repo connected` : 'No repo connected yet'}</span>
                </div>
                <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-sm ${
                  slackConfigured
                    ? 'bg-green-900/20 border-green-800/40 text-green-300'
                    : 'bg-[#21262d] border-[#30363d] text-gray-500'
                }`}>
                  {slackConfigured
                    ? <CheckIcon className="w-4 h-4 flex-shrink-0" />
                    : <span className="w-4 h-4 rounded-full border border-gray-600 flex-shrink-0" />
                  }
                  <span>{slackConfigured ? 'Slack connected' : 'Slack not connected'}</span>
                </div>
              </div>

              <button
                onClick={() => navigate('/dashboard', { replace: true })}
                className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl transition cursor-pointer"
              >
                Go to Dashboard
              </button>

              {(!repos.length || !slackConfigured) && (
                <p className="text-xs text-gray-600">You can finish setup anytime from the Settings panel.</p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-gray-700 mt-6">
          Already set up?{' '}
          <button onClick={() => navigate('/dashboard')} className="text-gray-500 hover:text-gray-300 underline cursor-pointer">
            Go to dashboard
          </button>
        </p>
      </div>
    </div>
  )
}
