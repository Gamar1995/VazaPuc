-- ============================================================
-- EXTENSÃO NECESSÁRIA
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- PROFILES
-- ============================================================
CREATE TABLE public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  name TEXT NOT NULL,
  handle TEXT UNIQUE NOT NULL,
  bio TEXT DEFAULT '',
  avatar_url TEXT DEFAULT '',
  followers_count INT DEFAULT 0,
  following_count INT DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================
-- RLS (COMEÇA DESATIVADO PRA NÃO DAR ERRO)
-- ============================================================
ALTER TABLE public.profiles DISABLE ROW LEVEL SECURITY;

-- ============================================================
-- POSTS
-- ============================================================
CREATE TABLE public.posts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  author_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  content TEXT NOT NULL,
  likes_count INT DEFAULT 0,
  replies_count INT DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================
-- LIKES
-- ============================================================
CREATE TABLE public.likes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  post_id UUID REFERENCES posts(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, post_id)
);

-- ============================================================
-- COMMENTS
-- ============================================================
CREATE TABLE public.comments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id UUID REFERENCES posts(id) ON DELETE CASCADE NOT NULL,
  author_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================
-- FOLLOWS
-- ============================================================
CREATE TABLE public.follows (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  follower_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  following_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(follower_id, following_id)
);

-- ============================================================
-- CONVERSATIONS
-- ============================================================
CREATE TABLE public.conversations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_a UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  user_b UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_a, user_b)
);

-- ============================================================
-- MESSAGES
-- ============================================================
CREATE TABLE public.messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE NOT NULL,
  sender_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  content TEXT NOT NULL,
  read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================
-- TRIGGER (CORRIGIDO DE VERDADE)
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, name, handle, avatar_url, bio, curso, periodo, bloco)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', 'Usuário'),
    COALESCE(
      NEW.raw_user_meta_data->>'handle',
      'user_' || substr(NEW.id::text, 1, 8)
    ),
    COALESCE(
      NEW.raw_user_meta_data->>'avatar_url', 
      'https://api.dicebear.com/7.x/avataaars/svg?seed=' || COALESCE(NEW.raw_user_meta_data->>'handle', NEW.id::text)
    ),
    COALESCE(NEW.raw_user_meta_data->>'bio', ''),
    NEW.raw_user_meta_data->>'curso',
    NEW.raw_user_meta_data->>'periodo',
    NEW.raw_user_meta_data->>'bloco'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Atualiza perfis existentes com dados do user_metadata
UPDATE public.profiles p
SET 
  curso = (SELECT raw_user_meta_data->>'curso' FROM auth.users WHERE id = p.id),
  periodo = (SELECT raw_user_meta_data->>'periodo' FROM auth.users WHERE id = p.id),
  bloco = (SELECT raw_user_meta_data->>'bloco' FROM auth.users WHERE id = p.id),
  bio = COALESCE(
    (SELECT raw_user_meta_data->>'bio' FROM auth.users WHERE id = p.id),
    p.bio
  )
WHERE curso IS NULL OR periodo IS NULL OR bloco IS NULL;
-- ============================================================
-- AGORA ATIVA RLS CORRETAMENTE
-- ============================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Profiles SELECT"
ON public.profiles FOR SELECT USING (true);

CREATE POLICY "Profiles INSERT"
ON public.profiles FOR INSERT WITH CHECK (true);

CREATE POLICY "Profiles UPDATE"
ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- ============================================================
-- RLS OUTRAS TABELAS
-- ============================================================
// ============================================================
// SQL — Rode no editor do Supabase para criar a tabela
// ============================================================
 

CREATE TABLE IF NOT EXISTS notifications (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID REFERENCES profiles(id) ON DELETE CASCADE,
  actor_id    UUID REFERENCES profiles(id) ON DELETE CASCADE,
  type        TEXT NOT NULL CHECK (type IN ('like', 'reply', 'follow', 'mention')),
  post_id     UUID REFERENCES posts(id) ON DELETE CASCADE,
  read        BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
 
-- Índice para busca rápida por usuário
CREATE INDEX ON notifications (user_id, created_at DESC);
 
-- RLS (Row Level Security)
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
 
CREATE POLICY "Usuário vê só suas notificações"
  ON notifications FOR SELECT
  USING (auth.uid() = user_id);
 
CREATE POLICY "Qualquer usuário logado pode criar notificações"
  ON notifications FOR INSERT
  WITH CHECK (auth.uid() = actor_id);
 
CREATE POLICY "Usuário atualiza só as suas"
  ON notifications FOR UPDATE
  USING (auth.uid() = user_id);
 
-- Ativar Realtime para a tabela
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;

ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Posts SELECT" ON posts FOR SELECT USING (true);
CREATE POLICY "Posts INSERT" ON posts FOR INSERT WITH CHECK (auth.uid() = author_id);
CREATE POLICY "Posts DELETE" ON posts FOR DELETE USING (auth.uid() = author_id);

ALTER TABLE likes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Likes SELECT" ON likes FOR SELECT USING (true);
CREATE POLICY "Likes INSERT" ON likes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Likes DELETE" ON likes FOR DELETE USING (auth.uid() = user_id);

ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Comments SELECT" ON comments FOR SELECT USING (true);
CREATE POLICY "Comments INSERT" ON comments FOR INSERT WITH CHECK (auth.uid() = author_id);
CREATE POLICY "Comments DELETE" ON comments FOR DELETE USING (auth.uid() = author_id);

ALTER TABLE follows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Follows SELECT" ON follows FOR SELECT USING (true);
CREATE POLICY "Follows INSERT" ON follows FOR INSERT WITH CHECK (auth.uid() = follower_id);
CREATE POLICY "Follows DELETE" ON follows FOR DELETE USING (auth.uid() = follower_id);

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Conversations SELECT"
ON conversations FOR SELECT
USING (auth.uid() = user_a OR auth.uid() = user_b);

CREATE POLICY "Conversations INSERT"
ON conversations FOR INSERT
WITH CHECK (auth.uid() = user_a OR auth.uid() = user_b);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Messages SELECT"
ON messages FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM conversations c
    WHERE c.id = conversation_id
    AND (c.user_a = auth.uid() OR c.user_b = auth.uid())
  )
);

CREATE POLICY "Messages INSERT"
ON messages FOR INSERT
WITH CHECK (auth.uid() = sender_id);

CREATE TABLE IF NOT EXISTS replies (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id     UUID REFERENCES posts(id) ON DELETE CASCADE,
  author_id   UUID REFERENCES profiles(id) ON DELETE CASCADE,
  content     TEXT NOT NULL,
  is_private  BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS replies_post_id_idx ON replies (post_id, created_at DESC);

ALTER TABLE replies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Qualquer um pode ver replies publicas"
  ON replies FOR SELECT
  USING (
    is_private = FALSE
    OR author_id = auth.uid()
    OR post_id IN (
      SELECT id FROM posts WHERE author_id = auth.uid()
    )
  );

CREATE POLICY "Usuario logado pode criar reply"
  ON replies FOR INSERT
  WITH CHECK (auth.uid() = author_id);

ALTER TABLE posts ADD COLUMN IF NOT EXISTS replies_count INT DEFAULT 0;

CREATE OR REPLACE FUNCTION increment_replies(post_id UUID)
RETURNS void AS $$
  UPDATE posts
  SET replies_count = COALESCE(replies_count, 0) + 1
  WHERE id = post_id;
$$ LANGUAGE sql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION decrement_likes(post_id UUID)
  RETURNS void AS $$
    UPDATE posts
    SET likes_count = GREATEST(0, COALESCE(likes_count, 0) - 1)
    WHERE id = post_id;
  $$ LANGUAGE sql SECURITY DEFINER;
 
  CREATE OR REPLACE FUNCTION increment_likes(post_id UUID)
  RETURNS void AS $$
    UPDATE posts
    SET likes_count = COALESCE(likes_count, 0) + 1
    WHERE id = post_id;
  $$ LANGUAGE sql SECURITY DEFINER;
 
  -- Adicione unique constraint em likes para evitar curtidas duplicadas:
  ALTER TABLE likes ADD CONSTRAINT likes_unique UNIQUE (post_id, user_id);

  ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS is_private BOOLEAN DEFAULT FALSE;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT FALSE;

ALTER TABLE posts ADD COLUMN is_archived boolean DEFAULT false;
ALTER TABLE posts ADD COLUMN is_private boolean DEFAULT false;
ALTER TABLE posts ADD COLUMN reposts_count integer DEFAULT 0;

// ============================================================
// SQL NECESSÁRIO (execute no Supabase SQL Editor)
// ============================================================
/*
-- Colunas na tabela posts para mídia
ALTER TABLE posts ADD COLUMN IF NOT EXISTS media_urls TEXT[] DEFAULT '{}';
ALTER TABLE posts ADD COLUMN IF NOT EXISTS has_media BOOLEAN DEFAULT FALSE;

-- Bucket no Supabase Storage
-- Crie um bucket chamado "posts-media" com acesso público no dashboard do Supabase.
-- Storage > New Bucket > Name: posts-media > Public: true

-- Política de storage para upload autenticado
CREATE POLICY "upload_media" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'posts-media' AND auth.uid() IS NOT NULL
  );

CREATE POLICY "read_media" ON storage.objects
  FOR SELECT USING (bucket_id = 'posts-media');

CREATE POLICY "delete_own_media" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'posts-media' AND auth.uid()::text = (storage.foldername(name))[1]
  );
*/


// ============================================================
// SQL NECESSÁRIO (execute no Supabase SQL Editor)
// ============================================================
/*
-- Tabela de reposts simples
CREATE TABLE IF NOT EXISTS reposts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  original_post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, original_post_id)
);

-- Coluna para quote posts na tabela posts
ALTER TABLE posts ADD COLUMN IF NOT EXISTS quoted_post_id UUID REFERENCES posts(id) ON DELETE SET NULL;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS is_quote BOOLEAN DEFAULT FALSE;

-- Função para incrementar reposts_count
CREATE OR REPLACE FUNCTION increment_reposts_count(post_id UUID)
RETURNS VOID AS $$
  UPDATE posts SET reposts_count = COALESCE(reposts_count, 0) + 1 WHERE id = post_id;
$$ LANGUAGE SQL;

-- Função para decrementar reposts_count
CREATE OR REPLACE FUNCTION decrement_reposts_count(post_id UUID)
RETURNS VOID AS $$
  UPDATE posts SET reposts_count = GREATEST(COALESCE(reposts_count, 0) - 1, 0) WHERE id = post_id;
$$ LANGUAGE SQL;

-- RLS
ALTER TABLE reposts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reposts_select" ON reposts FOR SELECT USING (true);
CREATE POLICY "reposts_insert" ON reposts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "reposts_delete" ON reposts FOR DELETE USING (auth.uid() = user_id);
*/