import { useEffect, useMemo, useState } from 'react'
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

  useEffect(() => {
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

  const user = mapSupabaseUser(session?.user ?? null)
  const isVerified = Boolean(user?.email_confirmed_at)

  const signOut = async () => {
    if (!supabase) return
    await supabase.auth.signOut()
    setSession(null)
    setMode('login')
    setPassword('')
    setRepeatPassword('')
  }

  const authValue = useMemo(() => ({
    user: user as AuthUser,
    storageMode: 'online' as const,
    refreshProfile: async () => {
      if (!supabase) return
      const { data } = await supabase.auth.getUser()
      if (data.user && session) {
        setSession({ ...session, user: data.user })
      }
    },
    signOut,
  }), [session, user])

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
        setMessage('Ese correo está registrado, pero falta confirmar el email. Abre el correo de Supabase y pulsa el enlace de confirmación.')
      } else {
        setMessage(text.includes('invalid') ? 'Correo o contraseña incorrectos.' : 'No se pudo iniciar sesión. Revisa la conexión.')
      }
    }
    setIsSubmitting(false)
  }

  const handleRegister = async (event: FormEvent) => {
    event.preventDefault()
    if (!supabase) return
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
      setMessage('Cuenta creada. Revisa tu correo y confirma el email antes de entrar desde cualquier dispositivo.')
      setMode('login')
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
          <p>No voy a permitir más registros locales porque luego fallan en otro dispositivo. En cuanto esas variables estén puestas, aparecerá el registro real.</p>
        </div>
      </div>
    )
  }

  if (user && !isVerified) {
    return (
      <div className="auth-shell">
        <div className="auth-card">
          <span className="auth-kicker">Correo pendiente</span>
          <h1>Verifica tu email</h1>
          <p>Hemos iniciado sesión con {user.email}, pero falta confirmar el correo para proteger tu cuenta.</p>
          {message ? <div className="auth-message">{message}</div> : null}
          <button className="button-primary auth-submit" type="button" disabled={isSubmitting} onClick={() => void resendVerification()}>Reenviar correo</button>
          <button className="button-secondary auth-submit" type="button" onClick={() => void signOut()}>Salir</button>
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
        <p>{mode === 'login' ? 'Entra con tu correo y contraseña. Tus datos estarán disponibles desde cualquier dispositivo.' : 'Crea tu usuario online para guardar tus registros en la nube.'}</p>

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
          {isSubmitting ? 'Procesando...' : mode === 'login' ? 'Iniciar sesión' : mode === 'register' ? 'Crear cuenta' : mode === 'forgot' ? 'Enviar correo' : 'Guardar contraseña'}
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
