
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../supabaseClient';
import { Post, Language } from '../types';

const POSTS_PER_PAGE = 20;

export const usePostQueries = (language: Language = Language.UZBEK) => {
  const queryClient = useQueryClient();

  const fetchPosts = async ({ pageParam = 0 }) => {
    const from = pageParam * POSTS_PER_PAGE;
    const to = from + POSTS_PER_PAGE - 1;

    const { data: postsData, error: postsError } = await supabase
      .from('posts')
      .select(`
        id, created_at, user_id, language, parent_post_id, word, keyword, story, image_url,
        likes_count, dislikes_count, impression_emojis, is_updated,
        profiles!user_id (username, full_name, avatar_url),
        parent:parent_post_id (
          user_id,
          profiles:user_id (username, full_name, avatar_url)
        )
      `)
      .eq('language', language)
      .order('created_at', { ascending: false })
      .range(from, to);

    if (postsError) throw postsError;

    // Fetch user reactions if logged in
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
    
    let userReactions: any[] = [];
    if (user && postsData && postsData.length > 0) {
      const { data: reactionsData } = await supabase
        .from('reactions')
        .select('post_id, reaction_type')
        .eq('user_id', user.id)
        .in('post_id', postsData.map(p => p.id));
      
      if (reactionsData) userReactions = reactionsData;
    }

    return postsData.map((p: any) => {
      const postReactions = userReactions.filter(r => r.post_id === p.id);
      const user_liked = postReactions.some(r => r.reaction_type === 'like');
      const user_disliked = postReactions.some(r => r.reaction_type === 'dislike');
      const user_emoji = postReactions.find(r => !['like', 'dislike'].includes(r.reaction_type))?.reaction_type;

      return {
        id: p.id,
        user_id: p.user_id,
        username: p.profiles?.username || p.profiles?.full_name || 'Unknown',
        avatar_url: p.profiles?.avatar_url,
        word: p.word || '',
        keyword: p.keyword || '',
        story: p.story || '',
        image_url: p.image_url,
        language: p.language as Language,
        parent_post_id: p.parent_post_id,
        parent_username: p.parent?.profiles?.username || p.parent?.profiles?.full_name || 'Original',
        created_at: new Date(p.created_at).getTime(),
        likes_count: p.likes_count || 0,
        dislikes_count: p.dislikes_count || 0,
        user_liked,
        user_disliked,
        user_emoji,
        impression_emojis: p.impression_emojis || [],
        is_updated: p.is_updated
      };
    }) as Post[];
  };

  return useQuery({
    queryKey: ['posts', language],
    queryFn: () => fetchPosts({ pageParam: 0 }),
    staleTime: 1000 * 60 * 5, // 5 min
  });
};
