import axios from 'axios'

const TOKEN_KEY = 'transfer_auth_token'

const client = axios.create({
  // Set VITE_API_URL at build time for deployed environments
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:4000/api',
  headers: {
    'Content-Type': 'application/json'
  }
})

// Request interceptor: attach token
client.interceptors.request.use(
  config => {
    const token = localStorage.getItem(TOKEN_KEY)
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  error => Promise.reject(error)
)

// Response interceptor: handle 401
client.interceptors.response.use(
  response => response,
  error => {
    // Backend errors are { error: { code, message } }; expose the message where pages look for it
    const body = error.response?.data
    if (body?.error?.message && !body.message) body.message = body.error.message

    if (error.response?.status === 401) {
      localStorage.removeItem(TOKEN_KEY)
      localStorage.removeItem('transfer_user')
      // Redirect to login only if not already there
      const publicPage = ['/login', '/status', '/track', '/apply'].some(p => window.location.pathname.startsWith(p)) || window.location.pathname === '/'
      if (!publicPage) {
        window.location.href = '/login'
      }
    }
    return Promise.reject(error)
  }
)

export default client
