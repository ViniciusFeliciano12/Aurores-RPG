import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { resolveAvatarUrl, uploadAvatar } from '../lib/avatar';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import PasswordInput from './PasswordInput';
import AvatarCropperModal from './AvatarCropperModal';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';

export function dispatchProfileUpdated(detail: { displayName?: string; avatarPath?: string | null }) {
  window.dispatchEvent(new CustomEvent('profile-updated', { detail }));
}

export default function ProfileForm() {
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [, setAvatarPath] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  const [nameSaving, setNameSaving] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [nameInfo, setNameInfo] = useState<string | null>(null);

  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [avatarSaving, setAvatarSaving] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordInfo, setPasswordInfo] = useState<string | null>(null);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const user = data.user;
      if (!user) return;

      setUserId(user.id);
      setEmail(user.email ?? '');
      setDisplayName((user.user_metadata?.display_name as string | undefined) ?? '');

      const path = (user.user_metadata?.avatar_path as string | undefined) ?? null;
      setAvatarPath(path);
      setAvatarUrl(await resolveAvatarUrl(path));
    })();
  }, []);

  async function handleNameSubmit(e: FormEvent) {
    e.preventDefault();
    setNameError(null);
    setNameInfo(null);

    const trimmed = displayName.trim();
    if (!trimmed) {
      setNameError('O nome não pode ficar em branco.');
      return;
    }

    setNameSaving(true);

    const { error: authError } = await supabase.auth.updateUser({ data: { display_name: trimmed } });
    if (authError) {
      setNameError(authError.message);
      setNameSaving(false);
      return;
    }

    if (userId) {
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ display_name: trimmed })
        .eq('id', userId);
      if (profileError) {
        setNameError(profileError.message);
        setNameSaving(false);
        return;
      }
    }

    dispatchProfileUpdated({ displayName: trimmed });
    setNameInfo('Nome atualizado.');
    setNameSaving(false);
  }

  function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) setPendingFile(file);
    e.target.value = '';
  }

  async function handleAvatarConfirm(blob: Blob) {
    setPendingFile(null);
    setAvatarError(null);

    if (!userId) return;

    setAvatarSaving(true);
    try {
      const path = await uploadAvatar(userId, blob);

      const { error: authError } = await supabase.auth.updateUser({ data: { avatar_path: path } });
      if (authError) throw authError;

      // Atualiza o perfil no banco de dados
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ avatar_path: path })
        .eq('id', userId);

      if (profileError) throw profileError;

      // Gera a URL assinada da nova imagem
      const signedUrl = await resolveAvatarUrl(path);

      // Atualiza os estados de uma vez
      setAvatarPath(path);
      setAvatarUrl(signedUrl);
      dispatchProfileUpdated({ avatarPath: path });
    } catch (err) {
      setAvatarError(err instanceof Error ? err.message : 'Não foi possível salvar a foto.');
    } finally {
      setAvatarSaving(false);
    }
  }

  async function handlePasswordSubmit(e: FormEvent) {
    e.preventDefault();
    setPasswordError(null);
    setPasswordInfo(null);

    if (newPassword !== confirmPassword) {
      setPasswordError('As senhas novas não coincidem.');
      return;
    }
    if (newPassword.length < 6) {
      setPasswordError('A nova senha precisa ter ao menos 6 caracteres.');
      return;
    }

    setPasswordSaving(true);

    const { error: verifyError } = await supabase.auth.signInWithPassword({ email, password: currentPassword });
    if (verifyError) {
      setPasswordError('Senha atual incorreta.');
      setPasswordSaving(false);
      return;
    }

    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
    if (updateError) {
      setPasswordError(updateError.message);
      setPasswordSaving(false);
      return;
    }

    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setPasswordInfo('Senha atualizada.');
    setPasswordSaving(false);
  }

  async function handleDeleteConfirm() {
    setDeleteError(null);
    setDeleteLoading(true);

    const { error: verifyError } = await supabase.auth.signInWithPassword({ email, password: deletePassword });
    if (verifyError) {
      setDeleteError('Senha atual incorreta.');
      setDeleteLoading(false);
      return;
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) {
      setDeleteError('Sessão expirada, faça login novamente.');
      setDeleteLoading(false);
      return;
    }

    try {
      const response = await fetch('/api/delete-account', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? 'Não foi possível excluir a conta.');
      }

      await supabase.auth.signOut();
      window.location.href = '/';
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Não foi possível excluir a conta.');
      setDeleteLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Foto e nome de exibição</CardTitle>
          <CardDescription>Como você aparece para outros jogadores.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <div className="flex items-center gap-4">
            <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-primary/20 text-2xl font-bold text-primary ring-1 ring-border">
              {avatarUrl ? (
                <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <span>{(displayName || email).trim().charAt(0).toUpperCase() || '?'}</span>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={avatarSaving}>
                {avatarSaving ? 'Salvando…' : 'Trocar foto'}
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileSelected}
              />
            </div>
          </div>

          {avatarError && <ErrorLabel message={avatarError} />}

          <form onSubmit={handleNameSubmit} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="displayName">Nome de usuário</Label>
              <Input
                id="displayName"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
              />
            </div>

            {nameError && <ErrorLabel message={nameError} />}
            {nameInfo && <InfoLabel message={nameInfo} />}

            <Button type="submit" disabled={nameSaving} className="self-start">
              {nameSaving ? 'Salvando…' : 'Salvar nome'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Alterar senha</CardTitle>
          <CardDescription>Confirme sua senha atual para definir uma nova.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handlePasswordSubmit} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="currentPassword">Senha atual</Label>
              <PasswordInput
                id="currentPassword"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="newPassword">Nova senha</Label>
              <PasswordInput
                id="newPassword"
                required
                minLength={6}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="confirmNewPassword">Confirmar nova senha</Label>
              <PasswordInput
                id="confirmNewPassword"
                required
                minLength={6}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>

            {passwordError && <ErrorLabel message={passwordError} />}
            {passwordInfo && <InfoLabel message={passwordInfo} />}

            <Button type="submit" disabled={passwordSaving} className="self-start">
              {passwordSaving ? 'Salvando…' : 'Salvar nova senha'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="ring-destructive/30">
        <CardHeader>
          <CardTitle className="text-destructive">Excluir conta</CardTitle>
          <CardDescription>Essa ação é permanente e remove todos os seus dados.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button type="button" variant="destructive" onClick={() => setDeleteOpen(true)}>
            Excluir minha conta
          </Button>
        </CardContent>
      </Card>

      {pendingFile && (
        <AvatarCropperModal
          file={pendingFile}
          open={!!pendingFile}
          onCancel={() => setPendingFile(null)}
          onConfirm={handleAvatarConfirm}
        />
      )}

      <Dialog
        open={deleteOpen}
        onOpenChange={(next) => {
          setDeleteOpen(next);
          if (!next) {
            setDeletePassword('');
            setDeleteError(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir conta</DialogTitle>
            <DialogDescription>
              Digite sua senha atual para confirmar. Essa ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="deletePassword">Senha atual</Label>
            <PasswordInput
              id="deletePassword"
              value={deletePassword}
              onChange={(e) => setDeletePassword(e.target.value)}
            />
          </div>

          {deleteError && <ErrorLabel message={deleteError} />}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteOpen(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={!deletePassword || deleteLoading}
              onClick={handleDeleteConfirm}
            >
              {deleteLoading ? 'Excluindo…' : 'Excluir permanentemente'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ErrorLabel({ message }: { message: string }) {
  return (
    <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {message}
    </p>
  );
}

function InfoLabel({ message }: { message: string }) {
  return (
    <p className="rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-sm text-primary">{message}</p>
  );
}
