import { useEffect, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { AuthContext } from '../contexts/AuthContext'
import type { AuthUser } from '../contexts/AuthContext'
import { isSupabaseConfigured, supabase } from '../services/supabase'

type AuthMode = 'login' | 'register' | 'forgot' | 'reset'

interface AuthGateProps {
  children: ReactNode
}

const PASSWORD_RULE = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/
const getAuthRedirectUrl = () => `${window.location.origin}${window.location.pathname}`
const normalizeEmail = (value: string) => value.trim().toLowerCase()
const LOCAL_DEVICE_SESSION_KEY = 'la-biblia-local-device-session-v1'
const LOCAL_DEVICE_EMAIL = 'local@este-dispositivo.app'

const resolveLocalEmail = (value: string) => {
  const trimmed = value.trim()
  return trimmed.includes('@') ? normalizeEmail(trimmed) : LOCAL_DEVICE_EMAIL
}

const buildLocalUser = (draftEmail = ''): AuthUser => {
  const resolvedEmail = resolveLocalEmail(draftEmail)
  const createdAt = new Date().toISOString()
  const displayName = resolvedEmail === LOCAL_DEVICE_EMAIL ? 'Acceso local' : (resolvedEmail.split('@')[0] || 'Acceso local')

  return {
    id: 'local-device-user',
    email: resolvedEmail,
    created_at: createdAt,
    email_confirmed_at: createdAt,
    user_metadata: {
      full_name: displayName,
      business_name: displayName,
      auth_mode: 'local',
    },
  }
}

const readLocalSession = (): AuthUser | null => {
  try {
    const raw = window.localStorage.getItem(LOCAL_DEVICE_SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<AuthUser>
    const resolvedEmail = typeof parsed.email === 'string' ? resolveLocalEmail(parsed.email) : LOCAL_DEVICE_EMAIL
    const createdAt = typeof parsed.created_at === 'string' ? parsed.created_at : new Date().toISOString()
    const metadata = parsed.user_metadata && typeof parsed.user_metadata === 'object' ? parsed.user_metadata : {}
    const displayName = typeof metadata.full_name === 'string'
      ? metadata.full_name
      : resolvedEmail === LOCAL_DEVICE_EMAIL
        ? 'Acceso local'
        : (resolvedEmail.split('@')[0] || 'Acceso local')

    return {
      id: typeof parsed.id === 'string' ? parsed.id : 'local-device-user',
      email: resolvedEmail,
      created_at: createdAt,
      email_confirmed_at: typeof parsed.email_confirmed_at === 'string' ? parsed.email_confirmed_at : createdAt,
      user_metadata: {
        ...metadata,
        full_name: displayName,
        business_name: typeof metadata.business_name === 'string' ? metadata.business_name : displayName,
        auth_mode: 'local',
      },
    }
  } catch {
    return null
  }
}

const writeLocalSession = (user: AuthUser) => {
  window.localStorage.setItem(LOCAL_DEVICE_SESSION_KEY, JSON.stringify(user))
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

  useEffect(() => {
    const storedLocalUser = readLocalSession()
    if (storedLocalUser) {
      setLocalUser(storedLocalUser)
    }

    if (!supabase) {
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

  const onlineUser = mapSupabaseUser(session?.user ?? null)
  const user = localUser ?? onlineUser
  const storageMode = localUser ? 'local' as const : 'online' as const
  const signOut = async () => {
    window.localStorage.removeItem(LOCAL_DEVICE_SESSION_KEY)
    setLocalUser(null)
    if (supabase && session) {
      await supabase.auth.signOut()
    }
    setSession(null)
    setMode('login')
    setMessage('')
    setPassword('')
    setRepeatPassword('')
  }

  const handleLocalDeviceAccess = async () => {
    const nextLocalUser = buildLocalUser(email)
    writeLocalSession(nextLocalUser)
    setLocalUser(nextLocalUser)
    if (supabase && session) {
      await supabase.auth.signOut()
      setSession(null)
    }
    setMode('login')
    setMessage('')
    setPassword('')
    setRepeatPassword('')
  }

  const authValue = {
    user: user as AuthUser,
    storageMode,
    refreshProfile: async () => {
      if (localUser || !supabase) return
      const { data } = await supabase.auth.getUser()
      if (data.user && session) {
        setSession({ ...session, user: data.user })
      }
    },
    signOut,
  }

  const resetFormFeedback = () => setMessage('')

  const handleLogin = async (event: FormEvent) => {
    event.preventDefault()
    if (!supabase) return
    if (!email.trim() || !password) {
      setMessage('Introduce el correo y la contraseña.')
      return
    }

    setIsSubmitting(true)
    setMessage('')
    const { error } = await supabase.auth.signInWithPassword({ email: normalizeEmail(email), password })
    if (error) {
      const text = error.message.toLowerCase()
      if (text.includes('confirm') || text.includes('verified')) {
        setMessage('Tu cuenta existe, pero Supabase tiene activada la confirmación por email. Desactiva “Confirm email” en Supabase para entrar sin esperar correo.')
      } else {
        setMessage(text.includes('invalid') ? 'Correo o contraseña incorrectos.' : 'No se pudo iniciar sesión. Revisa la conexión.')
      }
    }
    setIsSubmitting(false)
  }

  const handleRegister = async (event: FormEvent) => {
    event.preventDefault()
    if (!supabase) return
    if (!email.trim() || !password || !repeatPassword) {
      setMessage('Introduce tu correo y la contraseña.')
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
    setIsSubmitting(true)
    setMessage('')
    const normalizedEmail = normalizeEmail(email)
    const displayName = normalizedEmail.split('@')[0] || 'Usuario'
    const { data, error } = await supabase.auth.signUp({
      email: normalizedEmail,
      password,
      options: {
        emailRedirectTo: getAuthRedirectUrl(),
        data: { full_name: displayName, business_name: displayName },
      },
    })
    if (error) {
      setMessage(error.message.toLowerCase().includes('already') ? 'Este correo ya está registrado.' : 'No se pudo crear la cuenta.')
    } else {
      if (data.session) {
        setSession(data.session)
        setMessage('Cuenta creada. Ya estás dentro y tus datos se guardarán online.')
      } else {
        setMessage('Cuenta creada. Si no te deja entrar, desactiva “Confirm email” en Supabase Authentication > Providers > Email.')
        setMode('login')
      }
      setPassword('')
      setRepeatPassword('')
    }
    setIsSubmitting(false)
  }

  const handleForgot = async (event: FormEvent) => {
    event.preventDefault()
    if (!supabase) return
    if (!email.trim()) {
      setMessage('Introduce tu correo electrónico.')
      return
    }
    setIsSubmitting(true)
    setMessage('')
    const { error } = await supabase.auth.resetPasswordForEmail(normalizeEmail(email), {
      redirectTo: getAuthRedirectUrl(),
    })
    setMessage(error ? 'No se pudo enviar el correo de recuperación.' : 'Te he enviado un correo para crear una nueva contraseña.')
    setIsSubmitting(false)
  }

  const handleReset = async (event: FormEvent) => {
    event.preventDefault()
    if (!supabase) return
    if (!PASSWORD_RULE.test(password)) {
      setMessage('La nueva contraseña debe tener mínimo 8 caracteres, una letra y un número.')
      return
    }
    if (password !== repeatPassword) {
      setMessage('Las contraseñas no coinciden.')
      return
    }
    setIsSubmitting(true)
    const { error } = await supabase.auth.updateUser({ password })
    setMessage(error ? 'No se pudo cambiar la contraseña.' : 'Contraseña actualizada correctamente.')
    if (!error) {
      setMode('login')
      setPassword('')
      setRepeatPassword('')
    }
    setIsSubmitting(false)
  }

  if (isChecking) {
    return <div className="auth-shell"><div className="auth-card"><p>Comprobando sesión...</p></div></div>
  }

  if (!isSupabaseConfigured || !supabase) {
    return (
      <div className="auth-shell">
        <div className="auth-card auth-card-wide">
          <span className="auth-kicker">Base de datos online pendiente</span>
          <h1>Falta conectar el acceso mundial</h1>
          <p>Para que el mismo correo funcione en ordenador, móvil y cualquier navegador, la app necesita Supabase configurado en Vercel.</p>
          <code>VITE_SUPABASE_URL</code>
          <code>VITE_SUPABASE_ANON_KEY</code>
          <p>Mientras arreglamos el acceso online, puedes entrar en modo local y seguir trabajando desde este dispositivo.</p>
          <button className="button-primary auth-submit" type="button" onClick={() => void handleLocalDeviceAccess()}>
            Entrar en este dispositivo
          </button>
        </div>
      </div>
    )
  }

  if (user) {
    const displayName = typeof user.user_metadata?.full_name === 'string' ? user.user_metadata.full_name : (user.email ?? 'Usuario')
    const sessionLabel = localUser ? 'Modo local en este dispositivo' : (user.email ?? 'Cuenta online')
    return (
      <AuthContext.Provider value={authValue}>
        <div className="account-session-bar">
          <span>{displayName} · {sessionLabel}</span>
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
        <p>{mode === 'login' ? 'Entra con tu correo y contraseña. Tus datos estarán disponibles desde cualquier dispositivo.' : 'Solo necesitas correo y contraseña. Tus registros quedarán ligados a ese correo.'}</p>

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

        {message ? <div className="auth-message">{message}</div> : null}

        <button className="button-primary auth-submit" disabled={isSubmitting} type="submit">
          {isSubmitting ? 'Procesando...' : mode === 'login' ? 'Iniciar sesión' : mode === 'register' ? 'Crear cuenta' : mode === 'forgot' ? 'Enviar correo' : 'Guardar contraseña'}
        </button>

        {mode === 'login' ? (
          <>
            <button className="button-secondary auth-submit" type="button" onClick={() => void handleLocalDeviceAccess()}>
              Entrar en este dispositivo
            </button>
            <p>Si el correo o la recuperación fallan, puedes seguir usando la app en modo local en este navegador.</p>
          </>
        ) : null}

        <div className="auth-links">
          {mode !== 'login' ? <button type="button" onClick={() => { setMode('login'); resetFormFeedback() }}>Volver al inicio</button> : null}
          {mode === 'login' ? <button type="button" onClick={() => { setMode('forgot'); resetFormFeedback() }}>He olvidado mi contraseña</button> : null}
          {mode === 'login' ? <button type="button" onClick={() => { setMode('register'); resetFormFeedback() }}>Crear una cuenta</button> : null}
        </div>
      </form>
    </div>
  )
}
