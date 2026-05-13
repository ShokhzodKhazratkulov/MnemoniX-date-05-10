
import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import { supabase } from '../supabaseClient';
import { SavedMnemonic, Profile, SubscriptionTier } from '../types';

const WORDS_PER_PAGE = 50;

export const useUserQueries = (userId?: string) => {
  const queryClient = useQueryClient();

  const fetchProfile = async () => {
    if (!userId) return null;
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) throw error;
    
    // Default tier logic
    if (data && !data.subscription_tier) {
      data.subscription_tier = SubscriptionTier.FREE;
    }
    
    return data as Profile;
  };

  const fetchUserWordsPage = async ({ pageParam = 0 }) => {
    if (!userId) return [];
    
    const from = pageParam * WORDS_PER_PAGE;
    const to = from + WORDS_PER_PAGE - 1;

    const { data, error } = await supabase
      .from('user_words')
      .select(`
        id,
        created_at,
        is_hard,
        is_mastered,
        mnemonics (id, word, data, image_url, audio_url, language, nuance_data)
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) throw error;

    return (data || []).map((uw: any) => ({
      id: uw.id,
      mnemonicId: uw.mnemonics.id,
      word: uw.mnemonics.word,
      data: {
        ...(uw.mnemonics.data as any),
        nuance_data: uw.mnemonics.nuance_data || (uw.mnemonics.data as any).nuance_data
      },
      imageUrl: uw.mnemonics.image_url,
      audio_url: uw.mnemonics.audio_url,
      timestamp: new Date(uw.created_at).getTime(),
      language: uw.mnemonics.language,
      isHard: uw.is_hard,
      isMastered: uw.is_mastered
    })) as SavedMnemonic[];
  };

  const profileQuery = useQuery({
    queryKey: ['profile', userId],
    queryFn: fetchProfile,
    enabled: !!userId,
    staleTime: 1000 * 60 * 10, // 10 min
  });

  const wordsQuery = useInfiniteQuery({
    queryKey: ['user_words', userId],
    queryFn: fetchUserWordsPage,
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      return lastPage.length === WORDS_PER_PAGE ? allPages.length : undefined;
    },
    enabled: !!userId,
    staleTime: 1000 * 60 * 5, // 5 min
  });

  const words = wordsQuery.data?.pages.flat() || [];

  return {
    profile: profileQuery.data,
    profileLoading: profileQuery.isLoading,
    words,
    wordsLoading: wordsQuery.isLoading,
    isFetchingMoreWords: wordsQuery.isFetchingNextPage,
    hasMoreWords: !!wordsQuery.hasNextPage,
    refetchProfile: profileQuery.refetch,
    refetchWords: wordsQuery.refetch,
    loadMoreWords: wordsQuery.fetchNextPage
  };
};
