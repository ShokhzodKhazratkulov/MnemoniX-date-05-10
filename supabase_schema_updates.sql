
-- PHASE 2: SUPABASE INFRASTRUCTURE TRIGGERS
-- Run this in your Supabase SQL Editor (https://supabase.com/dashboard/project/_/sql)

-- 1. Create a function to handle reaction counts and emoji impressions atomically
CREATE OR REPLACE FUNCTION update_post_reaction_stats()
RETURNS TRIGGER AS $$
DECLARE
    emoji_found BOOLEAN := FALSE;
    elem RECORD;
    new_emojis JSONB := '[]'::JSONB;
    current_emojis JSONB;
BEGIN
    -- Handle Likes / Dislikes
    IF (TG_OP = 'INSERT') THEN
        IF (NEW.reaction_type = 'like') THEN
            UPDATE posts SET likes_count = likes_count + 1 WHERE id = NEW.post_id;
        ELSIF (NEW.reaction_type = 'dislike') THEN
            UPDATE posts SET dislikes_count = dislikes_count + 1 WHERE id = NEW.post_id;
        ELSE
            -- Handle Emojis
            SELECT impression_emojis INTO current_emojis FROM posts WHERE id = NEW.post_id;
            IF current_emojis IS NULL THEN current_emojis := '[]'::JSONB; END IF;
            
            FOR elem IN SELECT * FROM jsonb_array_elements(current_emojis) LOOP
                IF (elem.value->>'emoji' = NEW.reaction_type) THEN
                    new_emojis := new_emojis || jsonb_build_object('emoji', NEW.reaction_type, 'count', (elem.value->>'count')::int + 1);
                    emoji_found := TRUE;
                ELSE
                    new_emojis := new_emojis || elem.value;
                END IF;
            END LOOP;
            
            IF NOT emoji_found THEN
                new_emojis := new_emojis || jsonb_build_object('emoji', NEW.reaction_type, 'count', 1);
            END IF;
            
            UPDATE posts SET impression_emojis = new_emojis WHERE id = NEW.post_id;
        END IF;
    ELSIF (TG_OP = 'DELETE') THEN
        IF (OLD.reaction_type = 'like') THEN
            UPDATE posts SET likes_count = GREATEST(0, likes_count - 1) WHERE id = OLD.post_id;
        ELSIF (OLD.reaction_type = 'dislike') THEN
            UPDATE posts SET dislikes_count = GREATEST(0, dislikes_count - 1) WHERE id = OLD.post_id;
        ELSE
            -- Handle Emojis
            SELECT impression_emojis INTO current_emojis FROM posts WHERE id = OLD.post_id;
            IF current_emojis IS NULL THEN current_emojis := '[]'::JSONB; END IF;
            
            FOR elem IN SELECT * FROM jsonb_array_elements(current_emojis) LOOP
                IF (elem.value->>'emoji' = OLD.reaction_type) THEN
                    new_emojis := new_emojis || jsonb_build_object('emoji', OLD.reaction_type, 'count', GREATEST(0, (elem.value->>'count')::int - 1));
                ELSE
                    new_emojis := new_emojis || elem.value;
                END IF;
            END LOOP;
            
            UPDATE posts SET impression_emojis = new_emojis WHERE id = OLD.post_id;
        END IF;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Attach trigger (Combined for all stats)
DROP TRIGGER IF EXISTS on_reaction_change ON reactions;
CREATE TRIGGER on_reaction_change
AFTER INSERT OR DELETE ON reactions
FOR EACH ROW EXECUTE FUNCTION update_post_reaction_stats();

-- 3. Optimization: Add indexes for pagination performance
CREATE INDEX IF NOT EXISTS idx_posts_language_created_at ON posts (language, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_words_user_id_created_at ON user_words (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reactions_post_id ON reactions (post_id);
CREATE INDEX IF NOT EXISTS idx_reactions_user_id_post_id ON reactions (user_id, post_id);

DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'unique_user_word') THEN 
    ALTER TABLE user_words ADD CONSTRAINT unique_user_word UNIQUE (user_id, word_id); 
  END IF; 
END $$;

-- 4. Impression Emojis Atomic Increment Function (Alternative to JSONB overwrite)
CREATE OR REPLACE FUNCTION increment_post_emoji(post_id_param UUID, emoji_param TEXT)
RETURNS void AS $$
DECLARE
    current_emojis JSONB;
    new_emojis JSONB;
    emoji_found BOOLEAN := FALSE;
    elem RECORD;
BEGIN
    SELECT impression_emojis INTO current_emojis FROM posts WHERE id = post_id_param;
    
    -- Initialize if null
    IF current_emojis IS NULL THEN
        current_emojis := '[]'::JSONB;
    END IF;

    -- Iterate and increment
    FOR elem IN SELECT * FROM jsonb_array_elements(current_emojis) LOOP
        IF (elem.value->>'emoji' = emoji_param) THEN
            new_emojis := COALESCE(new_emojis, '[]'::JSONB) || jsonb_build_object('emoji', emoji_param, 'count', (elem.value->>'count')::int + 1);
            emoji_found := TRUE;
        ELSE
            new_emojis := COALESCE(new_emojis, '[]'::JSONB) || elem.value;
        END IF;
    END LOOP;

    -- Add if not found
    IF NOT emoji_found THEN
        new_emojis := COALESCE(new_emojis, '[]'::JSONB) || jsonb_build_object('emoji', emoji_param, 'count', 1);
    END IF;

    UPDATE posts SET impression_emojis = new_emojis WHERE id = post_id_param;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. RLS POLICIES FOR PRODUCTION SECURITY
-- Enable RLS on core tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_words ENABLE ROW LEVEL SECURITY;
ALTER TABLE reactions ENABLE ROW LEVEL SECURITY;

-- Profiles: Users can READ their own
DROP POLICY IF EXISTS "Users can read own profile" ON profiles;
CREATE POLICY "Users can read own profile" ON profiles FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile" ON profiles 
FOR UPDATE USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- 6. PROTECT SENSITIVE FIELDS (Tier/Trial) via Trigger
-- RLS doesn't support OLD/NEW comparison, so we use a BEFORE UPDATE trigger.
CREATE OR REPLACE FUNCTION protect_profile_tier()
RETURNS TRIGGER AS $$
BEGIN
    -- Prevent users from upgrading their own tier directly
    IF (OLD.subscription_tier IS DISTINCT FROM NEW.subscription_tier OR 
        OLD.trial_started_at IS DISTINCT FROM NEW.trial_started_at) THEN
        -- Allow updates if they come from a service_role or admin (auth.uid() is null or specific)
        -- But block if it's the user themselves trying to bypass via client SDK
        IF (auth.uid() = NEW.id) THEN
            RAISE EXCEPTION 'Restricted: You cannot modify subscription_tier or trial dates directly.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_profile_update_security ON profiles;
CREATE TRIGGER on_profile_update_security
BEFORE UPDATE ON profiles
FOR EACH ROW EXECUTE FUNCTION protect_profile_tier();

-- User Words: Strict ownership
DROP POLICY IF EXISTS "Users can manage own words" ON user_words;
CREATE POLICY "Users can manage own words" ON user_words
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Reactions: Ownership check
DROP POLICY IF EXISTS "Users can manage own reactions" ON reactions;
CREATE POLICY "Users can manage own reactions" ON reactions
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Posts: Public read, no unauthorized write
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read posts" ON posts;
CREATE POLICY "Public read posts" ON posts FOR SELECT USING (true);

-- 7. CONNECT PAYMENTS TO PROFILES (Foreign Key & Indexes)
-- Fix type mismatch: payments.id is uuid, so profiles.subscription_id must be uuid
DO $$ 
BEGIN 
  -- Attempt to convert column type safely
  ALTER TABLE profiles 
  ALTER COLUMN subscription_id TYPE uuid USING (NULLIF(subscription_id, '')::uuid);

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_subscription_id_fkey') THEN 
    ALTER TABLE profiles 
    ADD CONSTRAINT profiles_subscription_id_fkey 
    FOREIGN KEY (subscription_id) 
    REFERENCES payments(id) 
    ON DELETE SET NULL; 
  END IF; 
EXCEPTION WHEN OTHERS THEN
  -- Fallback if casting fails due to non-uuid data
  RAISE NOTICE 'Could not convert subscription_id to uuid. Ensure all values are valid UUIDs or NULL.';
END $$;

-- Speed up joins and lookups
CREATE INDEX IF NOT EXISTS idx_profiles_subscription_id ON profiles(subscription_id);
CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
