import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

var SUPABASE_URL = 'https://ocaizkdbdpmijljgxorh.supabase.co';
var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9jYWl6a2RiZHBtaWpsamd4b3JoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4MjM0NTIsImV4cCI6MjA5MDM5OTQ1Mn0.TD7qI0xoLfUrnFvBvmJByJbE3TNJ4W6JHlC1tSRymvU';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================================
// AUTENTICAÇÃO
// ============================================================

export async function signUp(email, password, name, handle) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { name, handle }
    }
  });
  if (error) throw error;
  return data;
}

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;

  // ── Reativação automática ──────────────────────────────────
  // Se a conta estava desativada, reativa ela silenciosamente ao logar
  if (data?.user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_deactivated')
      .eq('id', data.user.id)
      .single();

    if (profile?.is_deactivated) {
      await supabase
        .from('profiles')
        .update({ is_deactivated: false })
        .eq('id', data.user.id);
    }
  }

  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getCurrentUser() {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function getCurrentProfile() {
  const user = await getCurrentUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (error) throw error;
  return data;
}

export function onAuthChange(callback) {
  return supabase.auth.onAuthStateChange((_event, session) => {
    callback(session);
  });
}