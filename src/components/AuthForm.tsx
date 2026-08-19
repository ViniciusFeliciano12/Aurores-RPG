import { useState } from 'react';
import type { FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import PasswordInput from './PasswordInput';
import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';

type Mode = 'login' | 'signup';

export default function AuthForm() {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setInfo(null);
    setConfirmPassword('');
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);

    if (mode === 'signup' && password !== confirmPassword) {
      setError('As senhas não coincidem.');
      return;
    }

    setLoading(true);

    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError(error.message);
    } else {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { display_name: displayName || email.split('@')[0] } },
      });
      if (error) setError(error.message);
      else setInfo('Conta criada! Verifique seu e-mail para confirmar o cadastro antes de entrar.');
    }

    setLoading(false);
  }

  return (
    <Card className="w-full max-w-sm">
      <CardContent className="flex flex-col gap-6">
        <div className="flex gap-1 rounded-lg bg-muted p-1">
          <Button
            type="button"
            variant={mode === 'login' ? 'default' : 'ghost'}
            onClick={() => switchMode('login')}
            className="flex-1"
          >
            Entrar
          </Button>
          <Button
            type="button"
            variant={mode === 'signup' ? 'default' : 'ghost'}
            onClick={() => switchMode('signup')}
            className="flex-1"
          >
            Criar conta
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {mode === 'signup' && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="displayName">Nome de exibição</Label>
              <Input
                id="displayName"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Como os outros jogadores vão te ver"
              />
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">E-mail</Label>
            <Input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password">Senha</Label>
            <PasswordInput
              id="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {mode === 'signup' && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="confirmPassword">Confirmar senha</Label>
              <PasswordInput
                id="confirmPassword"
                required
                minLength={6}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
          )}

          {error && (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
          {info && (
            <p className="rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-sm text-primary">
              {info}
            </p>
          )}

          <Button type="submit" disabled={loading} className="mt-2 h-10">
            {loading ? 'Aguarde…' : mode === 'login' ? 'Entrar' : 'Criar conta'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
