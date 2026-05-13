import { useQuery } from '@tanstack/react-query';
import { supabase } from '../supabaseClient';
import { SavedMnemonic, Profile, SubscriptionTier } from '../types';

const PREVIEW_SIZE = 50;
const BATCH_SIZE = 1000;

function mapRows(rows: any[]): SavedMnemonic[] {
  return rows
    .filter((uw) => uw.mnemonics)
    .map((uw) => ({
      id: uw.id,
      mnemonicId: uw.mnemonics.id,
      word: uw.mnemonics.word,
      data: {
        ...(uw.mnemonics.data as any),
        nuance_data:
          uw.mnemonics.nuance_data ||
          (uw.mnemonics.data as any)?.nuance_data,
      },
      imageUrl: uw.mnemonics.image_url,
      audio_url: uw.mnemonics.audio_url,
      timestamp: new Date(uw.created_at).getTime(),
      language: uw.mnemonics.language,
      isHard: uw.is_hard,
      isMastered: uw.is_mastered,
    }));
}

const WORD_SELECT = `
  id,
  created_at,
  is_hard,
  is_mastered,
  mnemonics (id, word, data, image_url, audio_url, language, nuance_data)
`;

async function fetchWordCount(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from('user_words')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);
  if (error) throw error;
  return count ?? 0;
}

async function fetchWordsPreview(userId: string): Promise<SavedMnemonic[]> {
  const { data, error } = await supabase
    .from('user_words')
    .select(WORD_SELECT)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(0, PREVIEW_SIZE - 1);
  if (error) throw error;
  return mapRows(data || []);
}

async function fetchAllWords(userId: string): Promise<SavedMnemonic[]> {
  let all: any[] = [];
  let from = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from('user_words')
      .select(WORD_SELECT)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(from, from + BATCH_SIZE - 1);

    if (error) throw error;
    const rows = data || [];
    all = [...all, ...rows];
    hasMore = rows.length === BATCH_SIZE;
    from += BATCH_SIZE;
  }

  return mapRows(all);
}

async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
  if (error) throw error;
  if (data && !data.subscription_tier) {
    data.subscription_tier = SubscriptionTier.FREE;
  }
  return data as Profile;
}

export const useUserQueries = (userId?: string) => {
  const countQuery = useQuery({
    queryKey: ['user_words_count', userId],
    queryFn: () => fetchWordCount(userId!),
    enabled: !!userId,
    staleTime: 1000 * 60 * 2,
  });

  const previewQuery = useQuery({
    queryKey: ['user_words_preview', userId],
    queryFn: () => fetchWordsPreview(userId!),
    enabled: !!userId,
    staleTime: 1000 * 60 * 5,
  });

  const allWordsQuery = useQuery({
    queryKey: ['user_words', userId],
    queryFn: () => fetchAllWords(userId!),
    enabled: !!userId,
    staleTime: 1000 * 60 * 10,
    placeholderData: previewQuery.data,
  });

  const profileQuery = useQuery({
    queryKey: ['profile', userId],
    queryFn: () => fetchProfile(userId!),
    enabled: !!userId,
    staleTime: 1000 * 60 * 10,
  });

  const words = allWordsQuery.data ?? previewQuery.data ?? [];
  const wordsPreview = previewQuery.data ?? [];
  const wordCount = countQuery.data ?? words.length;

  return {
    profile: profileQuery.data,
    profileLoading: profileQuery.isLoading,
    words,
    wordsPreview,
    wordCount,
    masteredCount: words.filter((w) => w.isMastered).length,
    wordsLoading: previewQuery.isLoading,
    isLoadingAll: allWordsQuery.isFetching,
    refetchProfile: profileQuery.refetch,
    refetchWords: () => {
      countQuery.refetch();
      previewQuery.refetch();
      allWordsQuery.refetch();
    },
  };
};
