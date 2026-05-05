

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

// ⚠️ SUBSTITUA ESSES VALORES PELOS SEUS DO SUPABASE DASHBOARD
var SUPABASE_URL = 'https://ocaizkdbdpmijljgxorh.supabase.co';
  var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9jYWl6a2RiZHBtaWpsamd4b3JoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4MjM0NTIsImV4cCI6MjA5MDM5OTQ1Mn0.TD7qI0xoLfUrnFvBvmJByJbE3TNJ4W6JHlC1tSRymvU';

// Cria e exporta o cliente — é como abrir uma "conexão" com o banco
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================================
// HELPERS DE AUTENTICAÇÃO
// Funções simples que encapsulam as chamadas ao Supabase Auth
// ============================================================

// Cadastra um novo usuário com e-mail e senha
// metadata = { name, handle } — são salvos no profile automaticamente (via trigger SQL)
export async function signUp(email, password, name, handle) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { name, handle } // vai para o trigger handle_new_user() no banco
    }
  });
  if (error) throw error;
  return data;
}

// Faz login com e-mail e senha
export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

// Faz logout
export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

// Retorna o usuário logado atualmente (ou null se não estiver logado)
export async function getCurrentUser() {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

// Retorna o profile completo do usuário logado (nome, handle, bio, etc.)
export async function getCurrentProfile() {
  const user = await getCurrentUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single(); // .single() retorna um objeto ao invés de array

  if (error) throw error;
  return data;
}

// ============================================================
// OBSERVA MUDANÇAS DE SESSÃO
// Útil para saber quando o usuário loga/desloga
// Uso: onAuthChange((session) => { ... })
// ============================================================
export function onAuthChange(callback) {
  return supabase.auth.onAuthStateChange((_event, session) => {
    callback(session);
  });
}