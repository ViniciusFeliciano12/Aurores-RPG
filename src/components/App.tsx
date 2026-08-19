import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import AuthForm from './AuthForm';

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setCheckingSession(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => subscription.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session) {
      window.location.href = '/personagens';
    }
  }, [session]);

  if (checkingSession || session) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <span className="h-3 w-3 animate-spin rounded-full border-2 border-slate-600 border-t-emerald-400" />
        Carregando…
      </div>
    );
  }

  return <AuthForm />;
}
