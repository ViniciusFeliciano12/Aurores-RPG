import { supabase } from './supabase';

const SIGNED_URL_TTL_SECONDS = 3600;

export async function resolveAvatarUrl(avatarPath: string | null | undefined): Promise<string | null> {
  if (!avatarPath) return null;

  const { data, error } = await supabase.storage.from('avatars').createSignedUrl(avatarPath, SIGNED_URL_TTL_SECONDS);
  if (error || !data) return null;

  return data.signedUrl;
}

export async function uploadAvatar(userId: string, blob: Blob): Promise<string> {
  const fileName = `avatar_${Date.now()}.jpeg`;
  const path = `${userId}/${fileName}`;

  const { error } = await supabase.storage.from('avatars').upload(path, blob, {
    contentType: 'image/jpeg',
    upsert: true,
  });

  if (error) throw error;

  return path;
}
