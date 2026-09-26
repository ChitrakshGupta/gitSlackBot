/**
 * Login page — professional dark theme, no decorative emoji.
 */

import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

const API_BASE = import.meta.env.VITE_API_BASE_URL || ''

// Simple SVG icons used inline — no emoji
function GitBotLogo() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-white">
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      <circle cx="12" cy="16" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  )
}

function WarningIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 mt-0.5">
      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  )
}

const FEATURES = [
  { label: 'Auto-label Issues' },
  { label: 'PR Comments' },
  { label: 'Slack Alerts' },
]

export default function LoginPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (token) navigate('/dashboard', { replace: true })
    const err = searchParams.get('error')
    if (err) setError(decodeURIComponent(err))
  }, [navigate, searchParams])

  const handleLogin = () => {
    setLoading(true)
    window.location.href = `${API_BASE}/auth/github`
  }

  return (
    <div className="min-h-screen bg-[#0d1117] flex items-center justify-center relative overflow-hidden">

      {/* Subtle dot grid — top right */}
      <div className="absolute top-12 right-12 grid grid-cols-6 gap-3 opacity-[0.08] pointer-events-none select-none">
        {Array.from({ length: 36 }).map((_, i) => (
          <div key={i} className="w-1 h-1 rounded-full bg-gray-400" />
        ))}
      </div>

      {/* Subtle dot grid — bottom left */}
      <div className="absolute bottom-12 left-12 grid grid-cols-6 gap-3 opacity-[0.08] pointer-events-none select-none">
        {Array.from({ length: 36 }).map((_, i) => (
          <div key={i} className="w-1 h-1 rounded-full bg-gray-400" />
        ))}
      </div>

      {/* Card */}
      <div className="relative z-10 w-full max-w-md mx-4">
        <div className="bg-[#161b22] border border-[#30363d] rounded-2xl p-10 shadow-2xl text-center space-y-7">

          {/* Logo */}
          <div className="flex items-center justify-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-xl flex items-center justify-center shadow-lg">
              <GitBotLogo />
            </div>
            <span className="text-white text-2xl font-bold tracking-tight">GitBot</span>
          </div>

          {/* Headline */}
          <div className="space-y-2">
            <h1 className="text-white text-3xl font-bold leading-tight">
              Automate your<br />GitHub workflow
            </h1>
            <p className="text-gray-400 text-sm leading-relaxed">
              Connect repos, auto-label issues, comment on PRs,<br />
              and get Slack notifications — all in one place.
            </p>
          </div>

          {/* Error banner */}
          {error && (
            <div className="flex items-start gap-2.5 bg-red-900/30 text-red-300 border border-red-800/60 rounded-lg px-4 py-3 text-sm text-left">
              <WarningIcon />
              <span>Login failed: {error}</span>
            </div>
          )}

          {/* Sign in button */}
          <button
            onClick={handleLogin}
            disabled={loading}
            className="w-full inline-flex items-center justify-center gap-3 px-6 py-3.5 bg-white text-gray-900 font-semibold rounded-xl hover:bg-gray-100 active:bg-gray-200 transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed shadow-sm"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-gray-400 border-t-gray-900 rounded-full animate-spin" />
            ) : (
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
              </svg>
            )}
            {loading ? 'Redirecting to GitHub...' : 'Sign in with GitHub'}
          </button>

          {/* Feature pills */}
          <div className="flex items-center justify-center gap-2 flex-wrap">
            {FEATURES.map(({ label }) => (
              <span
                key={label}
                className="inline-flex items-center px-3 py-1.5 bg-[#21262d] border border-[#30363d] rounded-full text-xs text-gray-400"
              >
                {label}
              </span>
            ))}
          </div>

          {/* Footer */}
          <p className="text-xs text-gray-600">
            No credit card required · Free forever
          </p>
        </div>
      </div>
    </div>
  )
}
