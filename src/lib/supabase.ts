import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase environment variables!')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Signs the visitor in anonymously (once) and returns their verified user id.
// The session is kept in the browser, so the same browser keeps the same identity.
let sessionPromise: Promise<string> | null = null

export function ensureSession(): Promise<string> {
  if (!sessionPromise) {
    sessionPromise = (async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user) return session.user.id

      const { data, error } = await supabase.auth.signInAnonymously()
      if (error || !data.user) {
        sessionPromise = null // allow a retry
        throw error ?? new Error('Anonymous sign-in failed')
      }
      return data.user.id
    })()
  }
  return sessionPromise
}