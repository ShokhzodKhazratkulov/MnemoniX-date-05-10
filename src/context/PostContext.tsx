import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { Post, Language } from '../types';
import { supabase } from '../supabaseClient';
import { safeSetLocalStorage } from '../utils/storageUtils';
import { useInfiniteQuery, useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { useSync, SyncOperation } from './SyncContext';

interface PostContextType {
  posts: Post[];
  addPost: (post: Partial<Post>) => Promise<void>;
  deletePost: (postId: string) => Promise<void>;
  hidePost: (postId: string) => void;
  updatePost: (postId: string, updater: (post: Post) => Post) => Promise<void>;
  toggleLike: (postId: string, userId: string) => Promise<void>;
  toggleDislike: (postId: string, userId: string) => Promise<void>;
  toggleEmoji: (postId: string, userId: string, emoji: string) => Promise<void>;
  isLoading: boolean;
  isFetchingMore: boolean;
  hasMore: boolean;
  hiddenPosts: string[];
  fetchPosts: (silent?: boolean, reset?: boolean, viewMode?: string, language?: Language, bypassCache?: boolean) => Promise<void>;
  loadMore: () => Promise<void>;
}

const PostContext = createContext<PostContextType | undefined>(undefined);

const POSTS_PER_PAGE = 20;

export const PostProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const queryClient = useQueryClient();
  const { enqueue, isOnline } = useSync();
  const [hiddenPosts, setHiddenPosts] = useState<string[]>([]);
  const [lastViewMode, setLastViewMode] = useState('all');
  const [lastLanguage, setLastLanguage] = useState(Language.UZBEK);

  const { data: currentUser } = useQuery({
    queryKey: ['auth_user'],
    queryFn: async () => {
      const { data } = await supabase.auth.getSession();
      return data.session?.user || null;
    }
  });

  const fetchPostsPage = async ({ pageParam = 0 }) => {
    const from = pageParam * POSTS_PER_PAGE;
    const to = from + POSTS_PER_PAGE - 1;

    let query = supabase
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
      .eq('language', lastLanguage)
      .order('created_at', { ascending: false })
      .range(from, to);

    const { data: postsData, error: postsError } = await query;
    if (postsError) throw postsError;

    let userReactions: any[] = [];
    if (currentUser?.id && postsData && postsData.length > 0) {
      const { data: reactionsData } = await supabase
        .from('reactions')
        .select('post_id, reaction_type')
        .eq('user_id', currentUser.id)
        .in('post_id', postsData.map(p => p.id));
      
      if (reactionsData) userReactions = reactionsData;
    }

    return postsData.map((p: any) => {
      const postReactions = userReactions.filter(r => r.post_id === p.id);
      const user_liked = postReactions.some(r => r.reaction_type === 'like');
      const user_disliked = postReactions.some(r => r.reaction_type === 'dislike');
      const user_emoji = postReactions.find(r => !['like', 'dislike'].includes(r.reaction_type))?.reaction_type;

      const defaultEmojis = [
        { emoji: "🧠", count: 0 }, { emoji: "🔥", count: 0 },
        { emoji: "🌸", count: 0 }, { emoji: "💡", count: 0 }
      ];
      const serverEmojis = p.impression_emojis || [];
      const impression_emojis = defaultEmojis.map(de => {
        const se = serverEmojis.find((e: any) => e.emoji === de.emoji);
        return se ? { ...de, count: se.count || 0 } : de;
      });

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
        impression_emojis,
        is_updated: p.is_updated
      };
    }) as Post[];
  };

  const queryKey = useMemo(() => ['posts', lastLanguage, lastViewMode, currentUser?.id || 'guest'], [lastLanguage, lastViewMode, currentUser?.id]);

  const infinitePostsQuery = useInfiniteQuery({
    queryKey,
    queryFn: fetchPostsPage,
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      return lastPage.length === POSTS_PER_PAGE ? allPages.length : undefined;
    },
    staleTime: 1000 * 60 * 5,
  });

  const posts = useMemo(() => {
    return infinitePostsQuery.data?.pages.flat() || [];
  }, [infinitePostsQuery.data]);

  const isLoading = infinitePostsQuery.isPending && !infinitePostsQuery.isPlaceholderData;
  const isFetchingMore = infinitePostsQuery.isFetchingNextPage;
  const hasMore = !!infinitePostsQuery.hasNextPage;

  const fetchPosts = useCallback(async (silent: boolean = false, reset: boolean = false, viewMode: string = 'all', language: Language = Language.UZBEK, bypassCache: boolean = false) => {
    if (reset) {
      setLastViewMode(viewMode);
      setLastLanguage(language);
      if (bypassCache) {
        queryClient.invalidateQueries({ queryKey: ['posts'] });
      }
    } else {
      infinitePostsQuery.refetch();
    }
  }, [infinitePostsQuery, queryClient]);

  const loadMore = useCallback(async () => {
    if (hasMore && !isFetchingMore) {
      infinitePostsQuery.fetchNextPage();
    }
  }, [hasMore, isFetchingMore, infinitePostsQuery]);

  useEffect(() => {
    const savedHidden = localStorage.getItem('mnemonix_hidden_posts');
    if (savedHidden) {
      try { setHiddenPosts(JSON.parse(savedHidden)); }
      catch (e) { console.error('Error parsing hidden posts:', e); }
    }
  }, []);

  const addPostMutation = useMutation({
    mutationFn: async (postData: Partial<Post>) => {
      if (!currentUser) throw new Error("Tizimga kiring");
      const { data, error } = await supabase.from('posts').insert({
        user_id: currentUser.id,
        ...postData,
        likes_count: 0, dislikes_count: 0,
        impression_emojis: [{ emoji: "🧠", count: 0 }, { emoji: "🔥", count: 0 }, { emoji: "🌸", count: 0 }, { emoji: "💡", count: 0 }]
      }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['posts'] });
    }
  });

  const toggleLikeMutation = useMutation({
    mutationFn: async ({ postId, userId, wasLiked }: { postId: string, userId: string, wasLiked: boolean }) => {
      if (!isOnline) {
        if (wasLiked) {
          await enqueue('reactions', SyncOperation.DELETE, { post_id: postId, user_id: userId, reaction_type: 'like' });
        } else {
          await enqueue('reactions', SyncOperation.DELETE, { post_id: postId, user_id: userId, reaction_type: 'dislike' });
          await enqueue('reactions', SyncOperation.CREATE, { post_id: postId, user_id: userId, reaction_type: 'like' });
        }
        return;
      }
      if (wasLiked) {
        await supabase.from('reactions').delete().eq('post_id', postId).eq('user_id', userId).eq('reaction_type', 'like');
      } else {
        await supabase.from('reactions').delete().eq('post_id', postId).eq('user_id', userId).eq('reaction_type', 'dislike');
        await supabase.from('reactions').insert({ post_id: postId, user_id: userId, reaction_type: 'like' });
      }
    },
    onMutate: async ({ postId, wasLiked }) => {
      await queryClient.cancelQueries({ queryKey });
      const previousData = queryClient.getQueryData<any>(queryKey);
      queryClient.setQueryData(queryKey, (old: any) => ({
        ...old,
        pages: old?.pages?.map((page: Post[]) => page.map(p => {
          if (p.id !== postId) return p;
          const wasDisliked = p.user_disliked;
          return {
            ...p,
            likes_count: wasLiked ? p.likes_count - 1 : p.likes_count + 1,
            dislikes_count: wasDisliked ? p.dislikes_count - 1 : p.dislikes_count,
            user_liked: !wasLiked,
            user_disliked: false
          };
        })) || []
      }));
      return { previousData };
    },
    onError: (err, variables, context) => {
      if (context?.previousData) queryClient.setQueryData(queryKey, context.previousData);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey })
  });

  const toggleDislikeMutation = useMutation({
    mutationFn: async ({ postId, userId, wasDisliked }: { postId: string, userId: string, wasDisliked: boolean }) => {
      if (!isOnline) {
        if (wasDisliked) {
          await enqueue('reactions', SyncOperation.DELETE, { post_id: postId, user_id: userId, reaction_type: 'dislike' });
        } else {
          await enqueue('reactions', SyncOperation.DELETE, { post_id: postId, user_id: userId, reaction_type: 'like' });
          await enqueue('reactions', SyncOperation.CREATE, { post_id: postId, user_id: userId, reaction_type: 'dislike' });
        }
        return;
      }
      if (wasDisliked) {
        await supabase.from('reactions').delete().eq('post_id', postId).eq('user_id', userId).eq('reaction_type', 'dislike');
      } else {
        await supabase.from('reactions').delete().eq('post_id', postId).eq('user_id', userId).eq('reaction_type', 'like');
        await supabase.from('reactions').insert({ post_id: postId, user_id: userId, reaction_type: 'dislike' });
      }
    },
    onMutate: async ({ postId, wasDisliked }) => {
      await queryClient.cancelQueries({ queryKey });
      const previousData = queryClient.getQueryData<any>(queryKey);
      queryClient.setQueryData(queryKey, (old: any) => ({
        ...old,
        pages: old?.pages?.map((page: Post[]) => page.map(p => {
          if (p.id !== postId) return p;
          const wasLiked = p.user_liked;
          return {
            ...p,
            dislikes_count: wasDisliked ? p.dislikes_count - 1 : p.dislikes_count + 1,
            likes_count: wasLiked ? p.likes_count - 1 : p.likes_count,
            user_disliked: !wasDisliked,
            user_liked: false
          };
        })) || []
      }));
      return { previousData };
    },
    onError: (err, variables, context) => {
      if (context?.previousData) queryClient.setQueryData(queryKey, context.previousData);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey })
  });

  const toggleEmojiMutation = useMutation({
    mutationFn: async ({ postId, userId, emoji, wasSelected, prevEmoji }: { postId: string, userId: string, emoji: string, wasSelected: boolean, prevEmoji?: string }) => {
      if (!isOnline) {
        if (wasSelected) {
          await enqueue('reactions', SyncOperation.DELETE, { post_id: postId, user_id: userId, reaction_type: emoji });
        } else {
          if (prevEmoji) {
            await enqueue('reactions', SyncOperation.DELETE, { post_id: postId, user_id: userId, reaction_type: prevEmoji });
          }
          await enqueue('reactions', SyncOperation.CREATE, { post_id: postId, user_id: userId, reaction_type: emoji });
        }
        return;
      }
      if (wasSelected) {
        await supabase.from('reactions').delete().eq('post_id', postId).eq('user_id', userId).eq('reaction_type', emoji);
      } else {
        if (prevEmoji) {
          await supabase.from('reactions').delete().eq('post_id', postId).eq('user_id', userId).eq('reaction_type', prevEmoji);
        }
        await supabase.from('reactions').insert({ post_id: postId, user_id: userId, reaction_type: emoji });
      }
    },
    onMutate: async ({ postId, emoji, wasSelected, prevEmoji }) => {
      await queryClient.cancelQueries({ queryKey });
      const previousData = queryClient.getQueryData<any>(queryKey);
      queryClient.setQueryData(queryKey, (old: any) => ({
        ...old,
        pages: old?.pages?.map((page: Post[]) => page.map(p => {
          if (p.id !== postId) return p;
          return {
            ...p,
            impression_emojis: p.impression_emojis.map(e => {
              if (e.emoji === emoji) return { ...e, count: wasSelected ? Math.max(0, e.count - 1) : e.count + 1 };
              if (prevEmoji && e.emoji === prevEmoji) return { ...e, count: Math.max(0, e.count - 1) };
              return e;
            }),
            user_emoji: wasSelected ? undefined : emoji
          };
        })) || []
      }));
      return { previousData };
    },
    onError: (err, variables, context) => {
      if (context?.previousData) queryClient.setQueryData(queryKey, context.previousData);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey })
  });

  const updatePostMutation = useMutation({
    mutationFn: async ({ postId, updatedData }: { postId: string, updatedData: Partial<Post> }) => {
      const { error } = await supabase.from('posts').update({
        word: updatedData.word,
        keyword: updatedData.keyword,
        story: updatedData.story,
        image_url: updatedData.image_url,
        is_updated: true,
        updated_at: new Date().toISOString()
      }).eq('id', postId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['posts'] })
  });

  const addPost = async (postData: Partial<Post>) => {
    await addPostMutation.mutateAsync(postData);
  };

  const deletePost = useCallback(async (postId: string) => {
    try {
      const { error } = await supabase.from('posts').delete().eq('id', postId);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['posts'] });
    } catch (err) {
      console.error('Error deleting post:', err);
    }
  }, [queryClient]);

  const hidePost = useCallback((postId: string) => {
    setHiddenPosts(prev => {
      const newHidden = [...prev, postId];
      safeSetLocalStorage('mnemonix_hidden_posts', JSON.stringify(newHidden));
      return newHidden;
    });
  }, []);

  const toggleLike = async (postId: string, userId: string) => {
    const post = posts.find(p => p.id === postId);
    if (!post) return;
    await toggleLikeMutation.mutateAsync({ postId, userId, wasLiked: post.user_liked || false });
  };

  const toggleDislike = async (postId: string, userId: string) => {
    const post = posts.find(p => p.id === postId);
    if (!post) return;
    await toggleDislikeMutation.mutateAsync({ postId, userId, wasDisliked: post.user_disliked || false });
  };

  const toggleEmoji = async (postId: string, userId: string, emoji: string) => {
    const post = posts.find(p => p.id === postId);
    if (!post) return;
    await toggleEmojiMutation.mutateAsync({ postId, userId, emoji, wasSelected: post.user_emoji === emoji, prevEmoji: post.user_emoji });
  };

  const updatePost = async (postId: string, updater: (post: Post) => Post) => {
    const post = posts.find(p => p.id === postId);
    if (!post) return;
    const updatedPost = updater(post);
    await updatePostMutation.mutateAsync({ postId, updatedData: updatedPost });
  };

  const contextValue = React.useMemo(() => ({ 
    posts, addPost, deletePost, hidePost, updatePost, 
    toggleLike, toggleDislike, toggleEmoji, 
    isLoading, isFetchingMore, hasMore, hiddenPosts, fetchPosts, loadMore
  }), [posts, isLoading, isFetchingMore, hasMore, hiddenPosts, fetchPosts, loadMore, deletePost]);

  return (
    <PostContext.Provider value={contextValue}>
      {children}
    </PostContext.Provider>
  );
};


export const usePosts = () => {
  const context = useContext(PostContext);
  if (context === undefined) {
    throw new Error('usePosts must be used within a PostProvider');
  }
  return context;
};

