/**
 * OAuth callback page — extracts the JWT from the URL and stores it.
 * After GitHub OAuth: backend redirects here with ?token=...
 * This page grabs the token, saves to localStorage, and redirects to /dashboard.
 */

import { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

export default function AuthCallbackPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  useEffect(() => {
    const token = searchParams.get('token')

    if (token) {
      localStorage.setItem('token', token)
      // Redirect to onboarding — it will auto-skip to dashboard for returning users
      navigate('/onboarding', { replace: true })
    } else {
      // No token — something went wrong, go back to login
      navigate('/', { replace: true })
    }
  }, [searchParams, navigate])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950 text-white">
      <div className="text-center space-y-4">
        <div className="animate-spin w-8 h-8 border-4 border-white border-t-transparent rounded-full mx-auto"></div>
        <p className="text-gray-400">Signing you in...</p>
      </div>
    </div>
  )
}
