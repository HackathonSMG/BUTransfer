import React, { createContext, useState, useEffect, useCallback } from 'react'
import client from '../api/client'
import notify from '../lib/notify'

export const AuthContext = createContext(null)

const TOKEN_KEY = 'transfer_auth_token'
const USER_KEY = 'transfer_user'

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY))
  const [loading, setLoading] = useState(true)

  // On mount: verify stored token
  useEffect(() => {
    const storedToken = localStorage.getItem(TOKEN_KEY)
    let storedUser = null
    try {
      storedUser = JSON.parse(localStorage.getItem(USER_KEY))
    } catch {
      // Corrupt value (e.g. "undefined" left by an earlier failed login)
    }

    if (storedToken && storedToken !== 'undefined' && storedUser) {
      setToken(storedToken)
      setUser(storedUser)
      // Verify token is still valid
      client.get('/auth/me', {
        headers: { Authorization: `Bearer ${storedToken}` }
      })
        .then(res => {
          const me = res.data.data
          setUser(me)
          localStorage.setItem(USER_KEY, JSON.stringify(me))
        })
        .catch(() => {
          // Token invalid — clear auth
          clearAuth()
        })
        .finally(() => setLoading(false))
    } else {
      clearAuth()
      setLoading(false)
    }
  }, [])

  const clearAuth = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
    setUser(null)
    setToken(null)
  }, [])

  // The API client signals an expired or rejected session (401); forget the signed-in user straight away
  useEffect(() => {
    window.addEventListener('auth:expired', clearAuth)
    return () => window.removeEventListener('auth:expired', clearAuth)
  }, [clearAuth])

  const login = useCallback(async (email, password) => {
    const res = await client.post('/auth/login', { email, password })
    const { access_token: newToken, user: newUser } = res.data.data
    localStorage.setItem(TOKEN_KEY, newToken)
    localStorage.setItem(USER_KEY, JSON.stringify(newUser))
    setToken(newToken)
    setUser(newUser)
    return newUser
  }, [])

  const logout = useCallback(async () => {
    try {
      await client.post('/auth/logout')
    } catch {
      // Ignore logout errors
    }
    clearAuth()
    // Shown on the page the user lands on after signing out
    notify.success('You have signed out.', { keepOnNavigate: true })
  }, [clearAuth])

  const isAuthenticated = Boolean(user && token)

  return (
    <AuthContext.Provider value={{ user, token, login, logout, isAuthenticated, loading }}>
      {children}
    </AuthContext.Provider>
  )
}
