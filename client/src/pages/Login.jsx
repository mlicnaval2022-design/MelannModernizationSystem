import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ username: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(''); setLoading(true)
    try {
      await login(form.username, form.password)
      navigate('/')
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed. Please try again.')
    } finally { setLoading(false) }
  }

  return (
    <div className="login-page">
      <div className="login-bg-grid" />
      <div className="login-glow" />
      <div className="login-card">
        <div className="login-logo">
          <div className="login-logo-icon">🏦</div>
          <h1>Melann Lending System</h1>
          <p>Version 2 — Modernized Platform</p>
        </div>
        <form className="login-form" onSubmit={handleSubmit}>
          {error && <div className="login-error">⚠️ {error}</div>}
          <div className="form-group">
            <label className="form-label">Username</label>
            <input
              id="username"
              className="form-control"
              type="text"
              placeholder="Enter your username"
              value={form.username}
              onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
              autoFocus
              required
            />
          </div>
          <div className="form-group">
            <label className="form-label">Password</label>
            <input
              id="password"
              className="form-control"
              type="password"
              placeholder="Enter your password"
              value={form.password}
              onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              required
            />
          </div>
          <button id="login-submit" className="login-btn" type="submit" disabled={loading}>
            {loading ? '⏳ Signing in...' : '→ Sign In'}
          </button>
        </form>
        <div className="login-creds">
          <strong>Demo Credentials</strong>
          admin / admin123 &nbsp;|&nbsp; teller / teller123<br />
          manager / manager123 &nbsp;|&nbsp; accounting / accounting123
        </div>
      </div>
    </div>
  )
}
