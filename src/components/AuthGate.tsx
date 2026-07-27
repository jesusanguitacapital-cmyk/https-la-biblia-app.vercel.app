import { useEffect, useMemo, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { AuthContext } from '../contexts/AuthContext'
import type { AuthUser } from '../contexts/AuthContext'
import { supabase } from '../services/supabase'

type AuthMode = 'login' | 'register' | 'forgot' | 'reset'

interface AuthGateProps {
  children: ReactNode
}

interface LocalUserRecord {
  id: string
  email: string
  name: string
  passwordHash: string
  createdAt: string
}

const PASSWORD_RULE = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/
const LOCAL_USERS_KEY = 'la-biblia-local-users-v1'
const LOCAL_SESSION_KEY = 'la-biblia-local-session-v1'

const getAuthRedirectUrl = () => `${window.location.origin}${window.location.pathname}`
const normalizeEmail = (value: string) => value.trim().toLowerCase()

const readLocalUsers = (): LocalUserRecord[] => {
  try {
    const raw = window.localStorage.getItem(LOCAL_USERS_KEY)
    return raw ? JSON.parse(raw) as LocalUserRecord[] : []
  } catch {
    return []
  }
}

const writeLocalUsers = (users: LocalUserRecord[]) => {
  window.localStorage.setItem(LOCAL_USERS_KEY, JSON.stringify(users))
}

const toLocalAuthUser = (record: LocalUserRecord): AuthUser => ({
  id: record.id,
  email: record.email,
  created_at: record.createdAt,
  email_confirmed_at: record.createdAt,
  user_metadata: { full_name: record.name, business_name: record.name, auth_mode: 'local' },
})

const hashPassword = async (password: string) => {
  if (window.crypto?.subtle) {
    const encoded = new TextEncoder().encode(password)
    const digest = await window.crypto.subtle.digest('SHA-256', encoded)
    return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('')
  }
  return btoa(password)
}

const mapSupabaseUser = (user: Session['user'] | null): AuthUser | null => user
  ? {
    id: user.id,
    email: user.email,
    created_at: user.created_at,
    email_confirmed_at: user.email_confirmed_at,
    user_metadata: user.user_metadata,
  }
  : null

export function AuthGate({ children }: AuthGateProps) {
  const [session, setSession] = useState<Session | null>(null)
  const [localUser, setLocalUser] = useState<AuthUser | null>(null)
  const [isChecking, setIsChecking] = useState(true)
  const [mode, setMode] = useState<AuthMode>('login')
  const [message, setMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [repeatPassword, setRepeatPassword] = useState('')
  const [name, setName] = useState('')
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [resetEmail, setResetEmail] = useState('')

  useEffect(() => {
    if (!supabase) {
      const sessionId = window.localStorage.getItem(LOCAL_SESSION_KEY)
      const record = sessionId ? readLocalUsers().find((item) => item.id === sessionId) : null
      setLocalUser(record ? toLocalAuthUser(record) : null)
      setIsChecking(false)
      return
    }

    let mounted = true
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return
      setSession(data.session)
      const isRecovery = window.location.hash.includes('type=recovery') || window.location.search.includes('type=recovery')
      if (isRecovery) setMode('reset')
      setIsChecking(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession)
      if (event === 'PASSWORD_RECOVERY') setMode('reset')
    })

    return () => {
      mounted = false
      listener.subscription.unsubscribe()
    }
  }, [])

  const user = supabase ? mapSupabaseUser(session?.user ?? null) : localUser
  const isVerified = Boolean(user?.email_confirmed_at)

  const resetFormFeedback = () => setMessage('')

  const handleLogin = async (event: FormEvent) => {
    event.preventDefault()
    if (!email.trim() || !password) {
      setMessage('Introduce el correo y la contraseña.')
      return
    }

    setIsSubmitting(true)
    setMessage('')

    if (!supabase) {
      const normalized = normalizeEmail(email)
      const record = readLocalUsers().find((item) => item.email === normalized)
      const passwordHash = await hashPassword(password)
      if (!record || record.passwordHash !== passwordHash) {
        setMessage('Correo o contraseña incorrectos.')
      } else {
        window.localStorage.setItem(LOCAL_SESSION_KEY, record.id)
        setLocalUser(toLocalAuthUser(record))
        setPassword('')
      }
      setIsSubmitting(false)
      return
    }

    const { error } = await supabase.auth.signInWithPassword({ email: normalizeEmail(email), password })
    if (error) {
      setMessage(error.message.toLowerCase().includes('invalid') ? 'Correo o contraseña incorrectos.' : 'No se pudo iniciar sesión. Revisa la conexión.')
    }
    setIsSubmitting(false)
  }

  const handleRegister = async (event: FormEvent) => {
    event.preventDefault()
    if (!name.trim() || !email.trim() || !password || !repeatPassword) {
      setMessage('Completa todos los campos obligatorios.')
      return
    }
    if (!PASSWORD_RULE.test(password)) {
      setMessage('La contraseña debe tener mínimo 8 caracteres, una letra y un número.')
      return
    }
    if (password !== repeatPassword) {
      setMessage('Las contraseñas no coinciden.')
      return
    }
    if (!acceptedTerms) {
      setMessage('Debes aceptar los términos y privacidad.')
      return
    }

    setIsSubmitting(true)
    setMessage('')

    if (!supabase) {
      const normalized = normalizeEmail(email)
      const users = readLocalUsers()
      if (users.some((item) => item.email === normalized)) {
        setMessage('Este correo ya está registrado.')
        setIsSubmitting(false)
        return
      }
      const createdAt = new Date().toISOString()
      const record: LocalUserRecord = {
        id: `local-${normalized}`,
        email: normalized,
        name: name.trim(),
        passwordHash: await hashPassword(password),
        createdAt,
      }
      writeLocalUsers([...users, record])
      window.localStorage.setItem(LOCAL_SESSION_KEY, record.id)
      setLocalUser(toLocalAuthUser(record))
      setPassword('')
      setRepeatPassword('')
      setIsSubmitting(false)
      return
    }

    const { error } = await supabase.auth.signUp({
      email: normalizeEmail(email),
      password,
      options: {
        emailRedirectTo: getAuthRedirectUrl(),
        data: { full_name: name.trim(), business_name: name.trim() },
      },
    })
    if (error) {
      setMessage(error.message.toLowerCase().includes('already') ? 'Este correo ya está registrado.' : 'No se pudo crear la cuenta.')
    } else {
      setMessage('Cuenta creada. Revisa tu correo y confirma el email antes de entrar.')
      setMode('login')
    }
    setIsSubmitting(false)
  }

  const handleForgot = async (event: FormEvent) => {
    event.preventDefault()
    if (!email.trim()) {
      setMessage('Introduce tu correo electrónico.')
      return
    }
    setIsSubmitting(true)
    setMessage('')

    if (!supabase) {
      const normalized = normalizeEmail(email)
      const exists = readLocalUsers().some((item) => item.email === normalized)
      if (!exists) {
        setMessage('No existe ninguna cuenta con ese correo.')
      } else {
        setResetEmail(normalized)
        setMode('reset')
        setMessage('Introduce una nueva contraseña para esa cuenta.')
      }
      setIsSubmitting(false)
      return
    }

    const { error } = await supabase.auth.resetPasswordForEmail(normalizeEmail(email), {
      redirectTo: getAuthRedirectUrl(),
    })
    setMessage(error ? 'No se pudo enviar el correo de recuperación.' : 'Te he enviado un correo para crear una nueva contraseña.')
    setIsSubmitting(false)
  }

  const handleReset = async (event: FormEvent) => {
    event.preventDefault()
    if (!PASSWORD_RULE.test(password)) {
      setMessage('La nueva contraseña debe tener mínimo 8 caracteres, una letra y un número.')
      return
    }
    if (password !== repeatPassword) {
      setMessage('Las contraseñas no coinciden.')
      return
    }
    setIsSubmitting(true)

    if (!supabase) {
      const targetEmail = resetEmail || normalizeEmail(email)
      const users = readLocalUsers()
      const nextUsers = await Promise.all(users.map(async (item) => item.email === targetEmail ? { ...item, passwordHash: await hashPassword(password) } : item))
      writeLocalUsers(nextUsers)
      setMessage('Contraseña actualizada correctamente.')
      setMode('login')
      setPassword('')
      setRepeatPassword('')
      setIsSubmitting(false)
      return
    }

    const { error } = await supabase.auth.updateUser({ password })
    setMessage(error ? 'No se pudo cambiar la contraseña.' : 'Contraseña actualizada correctamente.')
    if (!error) setMode('login')
    setIsSubmitting(false)
  }

  const resendVerification = async () => {
    if (!supabase || !user?.email) return
    setIsSubmitting(true)
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: user.email,
      options: { emailRedirectTo: getAuthRedirectUrl() },
    })
    setMessage(error ? 'No se pudo reenviar el correo.' : 'Correo de verificación reenviado.')
    setIsSubmitting(false)
  }

  const logout = async () => {
    if (!supabase) {
      window.localStorage.removeItem(LOCAL_SESSION_KEY)
      setLocalUser(null)
    } else {
      await supabase.auth.signOut()
      setSession(null)
    }
    setMode('login')
    setPassword('')
    setRepeatPassword('')
  }

  const authValue = useMemo(() => ({
    user: user as AuthUser,
    storageMode: supabase ? 'online' as const : 'local' as const,
    refreshProfile: async () => {
      if (!supabase) return
      const { data } = await supabase.auth.getUser()
      if (data.user && session) {
        setSession({ ...session, user: data.user })
      }
    },
    signOut: logout,
  }), [session, user])

  if (isChecking) {
    return <div className="auth-shell"><div className="auth-card"><p>Comprobando sesión...</p></div></div>
  }

  if (supabase && user && !isVerified) {
    return (
      <div className="auth-shell">
        <div className="auth-card">
          <span className="auth-kicker">Correo pendiente</span>
          <h1>Verifica tu email</h1>
          <p>Hemos iniciado sesión con {user.email}, pero falta confirmar el correo para proteger tu cuenta.</p>
          {message ? <div className="auth-message">{message}</div> : null}
          <button className="button-primary auth-submit" type="button" disabled={isSubmitting} onClick={() => void resendVerification()}>Reenviar correo</button>
          <button className="button-secondary auth-submit" type="button" onClick={() => void logout()}>Salir</button>
        </div>
      </div>
    )
  }

  if (user) {
    const displayName = typeof user.user_metadata?.full_name === 'string' ? user.user_metadata.full_name : user.email
    return (
      <AuthContext.Provider value={authValue}>
        <div className="account-session-bar">
          <span>{displayName} · {user.email}</span>
        </div>
        {children}
      </AuthContext.Provider>
    )
  }

  return (
    <div className="auth-shell">
      <form className="auth-card" onSubmit={mode === 'login' ? handleLogin : mode === 'register' ? handleRegister : mode === 'forgot' ? handleForgot : handleReset}>
        <span className="auth-kicker">La Biblia Trading Journal</span>
        <h1>{mode === 'login' ? 'Accede a tu cuenta' : mode === 'register' ? 'Crea tu cuenta' : mode === 'forgot' ? 'Recuperar contraseña' : 'Nueva contraseña'}</h1>
        <p>{mode === 'login' ? 'Entra con tu correo y contraseña. Tus registros se guardarán para volver otro día en este navegador.' : 'Crea tu usuario para separar tus registros por correo.'}</p>

        {mode === 'register' ? (
          <label className="auth-field">
            Nombre o usuario
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Ej: Jesús Trading" />
          </label>
        ) : null}

        {mode !== 'reset' ? (
          <label className="auth-field">
            Correo electrónico
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="tu@email.com" autoComplete="email" />
          </label>
        ) : null}

        {mode !== 'forgot' ? (
          <label className="auth-field">
            Contraseña
            <div className="auth-password-row">
              <input type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Mínimo 8 caracteres" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
              <button type="button" onClick={() => setShowPassword((current) => !current)}>{showPassword ? 'Ocultar' : 'Ver'}</button>
            </div>
          </label>
        ) : null}

        {mode === 'register' || mode === 'reset' ? (
          <label className="auth-field">
            Repetir contraseña
            <input type={showPassword ? 'text' : 'password'} value={repeatPassword} onChange={(event) => setRepeatPassword(event.target.value)} placeholder="Repite la contraseña" autoComplete="new-password" />
          </label>
        ) : null}

        {mode === 'register' ? (
          <label className="auth-check">
            <input type="checkbox" checked={acceptedTerms} onChange={(event) => setAcceptedTerms(event.target.checked)} />
            Acepto los términos básicos de uso y privacidad.
          </label>
        ) : null}

        {message ? <div className="auth-message">{message}</div> : null}

        <button className="button-primary auth-submit" disabled={isSubmitting} type="submit">
          {isSubmitting ? 'Procesando...' : mode === 'login' ? 'Iniciar sesión' : mode === 'register' ? 'Crear cuenta' : mode === 'forgot' ? 'Continuar' : 'Guardar contraseña'}
        </button>

        <div className="auth-links">
          {mode !== 'login' ? <button type="button" onClick={() => { setMode('login'); resetFormFeedback() }}>Volver al inicio</button> : null}
          {mode === 'login' ? <button type="button" onClick={() => { setMode('forgot'); resetFormFeedback() }}>He olvidado mi contraseña</button> : null}
          {mode === 'login' ? <button type="button" onClick={() => { setMode('register'); resetFormFeedback() }}>Crear una cuenta</button> : null}
        </div>
      </form>
    </div>
  )
}
