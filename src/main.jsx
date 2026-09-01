import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'

const root = ReactDOM.createRoot(document.getElementById('root'))

const Recovery = ({ message = 'Loading Art Flow Creative…' }) => (
  <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: 'system-ui, sans-serif' }}>
    <div style={{ width: '100%', maxWidth: 420, textAlign: 'center' }}>
      <h1 style={{ fontSize: 24, marginBottom: 12 }}>Art Flow Creative</h1>
      <p style={{ marginBottom: 18, color: '#555' }}>{message}</p>
      <button
        onClick={() => {
          try {
            localStorage.removeItem('base44_access_token')
            localStorage.removeItem('token')
            localStorage.removeItem('base44_clear_access_token')
          } catch {}
          window.location.href = '/login?recovery=' + Date.now()
        }}
        style={{ padding: '12px 18px', borderRadius: 10, border: '1px solid #bbb', background: '#fff', fontSize: 16 }}
      >
        Open login
      </button>
    </div>
  </div>
)

class StartupErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error) {
    console.error('App failed to start:', error)
  }

  render() {
    if (this.state.hasError) {
      return <Recovery message="The app could not start. Tap below to reopen the login screen safely." />
    }
    return this.props.children
  }
}

root.render(
  <StartupErrorBoundary>
    <App />
  </StartupErrorBoundary>
)
