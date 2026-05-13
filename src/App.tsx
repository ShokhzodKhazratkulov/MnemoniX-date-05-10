
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import imageCompression from 'browser-image-compression';
import { 
  Search, 
  Sparkles, 
  LayoutDashboard, 
  Layers, 
  User as UserIcon, 
  Mic, 
  MessageSquare, 
  LogOut,
  Loader2,
  AlertCircle,
  X,
  ChevronRight,
  ChevronLeft,
  Brain,
  Moon,
  Sun,
  Languages,
  Home,
  Globe,
  Instagram,
  Send,
  Mail,
  Phone,
  MoreVertical
} from 'lucide-react';

import { Language, AppState, AppView, MnemonicResponse, SavedMnemonic, Post, AppTheme, SubscriptionTier } from './types';
import { GeminiService } from './services/geminiService';
import { usePosts } from './context/PostContext';
import { supabase, getStorageUrl } from './services/supabase';
import { useMonetization } from './hooks/useMonetization';
import { decode, decodeAudioData } from './utils/audioUtils';
import { safeSetLocalStorage } from './utils/storageUtils';

// Components
const QuickTour = React.lazy(() => import('./components/QuickTour').then(m => ({ default: m.QuickTour })));
const Dashboard = React.lazy(() => import('./components/Dashboard').then(m => ({ default: m.Dashboard })));
const Flashcards = React.lazy(() => import('./components/Flashcards').then(m => ({ default: m.Flashcards })));
const MnemonicCard = React.lazy(() => import('./components/MnemonicCard').then(m => ({ default: m.MnemonicCard })));
const VoiceMode = React.lazy(() => import('./components/VoiceMode').then(m => ({ default: m.VoiceMode })));
const Auth = React.lazy(() => import('./components/Auth').then(m => ({ default: m.Auth })));
const Profile = React.lazy(() => import('./components/Profile').then(m => ({ default: m.Profile })));
const AboutSection = React.lazy(() => import('./components/AboutSection'));
const SearchPage = React.lazy(() => import('./components/SearchPage').then(m => ({ default: m.SearchPage })));
const FeedbackModal = React.lazy(() => import('./components/FeedbackModal').then(m => ({ default: m.FeedbackModal })));
const Posts = React.lazy(() => import('./components/Posts').then(m => ({ default: m.Posts })));
const CategoriesPage = React.lazy(() => import('./components/CategoriesPage').then(m => ({ default: m.CategoriesPage })));
const CategoryDetailPage = React.lazy(() => import('./components/CategoryDetailPage').then(m => ({ default: m.CategoryDetailPage })));
const PracticePartner = React.lazy(() => import('./components/PracticePartner').then(m => ({ default: m.PracticePartner })));
const Personalization = React.lazy(() => import('./components/Personalization').then(m => ({ default: m.Personalization })));
const SubscriptionPage = React.lazy(() => import('./components/SubscriptionPage').then(m => ({ default: m.SubscriptionPage })));
const PrivacyPolicy = React.lazy(() => import('./components/PrivacyPolicy').then(m => ({ default: m.PrivacyPolicy })));
const TermsOfService = React.lazy(() => import('./components/TermsOfService').then(m => ({ default: m.TermsOfService })));

import { TRANSLATIONS } from './constants/translations';
import { Profile as UserProfileType } from './types';
import { useUserQueries } from './hooks/useUserQueries';
import { useQueryClient } from '@tanstack/react-query';
import { useSync, SyncOperation } from './context/SyncContext';

/**
 * MAIN APPLICATION STATE & INITIALIZATION
 */
export default function App() {
  const queryClient = useQueryClient();
  const { enqueue, isOnline } = useSync();
  // Authentication & User State
  const [user, setUser] = useState<any>(null); // Current Supabase Auth user object
  const [isGuest, setIsGuest] = useState(true); // Toggle for authenticated vs guest sessions
  const [hasKey, setHasKey] = useState(true);
  const [isAuthReady, setIsAuthReady] = useState(false); // Ensures auth check completes before rendering UI

  // Core Service Instances (Memoized to prevent recreation)
  const gemini = React.useMemo(() => new GeminiService(), []);

  // UI Navigation & View State
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<AppView>(AppView.HOME); // Controls which main feature is visible
  const [viewHistory, setViewHistory] = useState<AppView[]>([]); // Navigation history for "Back" functionality
  const [state, setState] = useState<AppState>(AppState.IDLE); // High-level app state (IDLE, SEARCHING, RESULTS, etc.)
  const [isFlashcardDetailOpen, setIsFlashcardDetailOpen] = useState(false);
  const [isFlashcardReviewOpen, setIsFlashcardReviewOpen] = useState(false);
  const [forceCloseFlashcardDetail, setForceCloseFlashcardDetail] = useState(false);
  const [forceCloseFlashcardReview, setForceCloseFlashcardReview] = useState(false);
  const [language, setLanguage] = useState<Language>(() => {
    const saved = localStorage.getItem('mnemonix_ui_language');
    return (saved as Language) || Language.ENGLISH;
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [mnemonic, setMnemonic] = useState<MnemonicResponse | null>(null);
  const [mnemonicId, setMnemonicId] = useState<string | undefined>(undefined);
  const [imageUrl, setImageUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { posts, fetchPosts } = usePosts();
  const [showFeedback, setShowFeedback] = useState(false);
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);

  // TanStack Query for User Data
  const { profile: userProfile, words: savedMnemonics, refetchProfile, refetchWords } = useUserQueries(user?.id);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [view]);

  useEffect(() => {
    const handleResize = () => {
      const threshold = window.screen.height * 0.75;
      setIsKeyboardOpen(window.innerHeight < threshold);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedMnemonicForReview, setSelectedMnemonicForReview] = useState<SavedMnemonic | null>(null);
  const { currentTier, isPremium, isDeviceAuthorized, verifyDevice, resetDevice, incrementSearchCount, searchRemaining } = useMonetization(userProfile);
  const [isAudioLoading, setIsAudioLoading] = useState(false);

  const contentLanguage = useMemo(() => {
    return userProfile?.preferred_language || language;
  }, [userProfile?.preferred_language, language]);
  const audioContextRef = React.useRef<AudioContext | null>(null);
  const sourceRef = React.useRef<AudioBufferSourceNode | null>(null);

  const handlePlayAudio = useCallback(async (text: string) => {
    if (isAudioLoading) return;
    setIsAudioLoading(true);

    try {
      if (sourceRef.current) {
        try {
          sourceRef.current.stop();
        } catch (e) {
          // Ignore if already stopped
        }
      }

      let audioBuffer: AudioBuffer | null = null;
      
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      }

      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }

      // Check if we have a saved audio URL for this word
      const savedMnemonic = savedMnemonics.find(m => m.word.toLowerCase() === text.toLowerCase());
      const audioUrl = savedMnemonic?.data?.audioUrl || savedMnemonic?.audio_url;

      if (audioUrl) {
        try {
          const response = await fetch(audioUrl);
          if (response.ok) {
            const arrayBuffer = await response.arrayBuffer();
            const uint8Array = new Uint8Array(arrayBuffer);
            
            // Try standard decoder first
            try {
              audioBuffer = await audioContextRef.current.decodeAudioData(arrayBuffer.slice(0));
            } catch (e) {
              // Fallback to custom PCM decoder
              audioBuffer = await decodeAudioData(uint8Array, audioContextRef.current, 24000, 1);
            }
          }
        } catch (fetchError) {
          console.warn("Stored audio failed in App.tsx, falling back to live TTS:", fetchError);
        }
      }

      if (!audioBuffer) {
        const base64Audio = await gemini.generateTTS(text, language);
        if (!base64Audio) throw new Error("No audio data");

        const decodedData = decode(base64Audio);
        
        // Try standard decoder first
        try {
          const arrayBuffer = decodedData.buffer;
          audioBuffer = await audioContextRef.current.decodeAudioData(arrayBuffer.slice(0));
        } catch (e) {
          // Fallback to custom PCM decoder
          audioBuffer = await decodeAudioData(decodedData, audioContextRef.current, 24000, 1);
        }
      }

      if (audioBuffer) {
        const source = audioContextRef.current.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioContextRef.current.destination);
        source.start(0);
        sourceRef.current = source;
      }
    } catch (error) {
      console.error("Audio error:", error);
    } finally {
      setIsAudioLoading(false);
    }
  }, [gemini, language, isAudioLoading, savedMnemonics]);

  useEffect(() => {
    safeSetLocalStorage('mnemonix_ui_language', language);
  }, [language]);

  // Auth state listener
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }: any) => {
      setUser(session?.user ?? null);
      if (session?.user) setIsGuest(false);
      setIsAuthReady(true);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event: any, session: any) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        setIsGuest(false);
        // If we are on the AUTH view, navigate home after successful OAuth redirect
        setView(prev => prev === AppView.AUTH ? AppView.HOME : prev);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Force sign-in for unauthenticated users
  useEffect(() => {
    if (isAuthReady && !user) {
      if (view !== AppView.AUTH) {
        setView(AppView.AUTH);
      }
    }
  }, [user, view, isAuthReady]);

  // Sync app language with profile
  useEffect(() => {
    if (userProfile?.preferred_language) {
      const savedLang = localStorage.getItem('mnemonix_ui_language');
      if (!savedLang) {
        setLanguage(userProfile.preferred_language as Language);
      }
    }
  }, [userProfile]);

  // Initial device verification
  useEffect(() => {
    if (userProfile) {
      verifyDevice();
    }
  }, [userProfile, verifyDevice]);

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isLangOpen, setIsLangOpen] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  const t = useMemo(() => {
    const base = TRANSLATIONS[language] || TRANSLATIONS[Language.ENGLISH];
    const en = TRANSLATIONS[Language.ENGLISH];
    
    // Deep merge or at least ensure sub-objects exist by falling back to English
    return {
      ...en,
      ...base,
      dashboard: { ...en.dashboard, ...(base.dashboard || {}) },
      flashcards: { ...en.flashcards, ...(base.flashcards || {}) },
      profile: { ...en.profile, ...(base.profile || {}) },
      posts: { ...en.posts, ...(base.posts || {}) },
      categories: { ...en.categories, ...(base.categories || {}) },
    };
  }, [language]);

  const navigateTo = useCallback(async (newView: AppView) => {
    if (newView !== view) {
      // Protect private views
      const privateViews = [
        AppView.DASHBOARD,
        AppView.FLASHCARDS,
        AppView.PROFILE,
        AppView.MY_POSTS,
        AppView.MY_REMIXES,
        AppView.CREATE_POST,
        AppView.PRACTICE,
        AppView.CATEGORIES,
        AppView.CATEGORY_DETAIL
      ];

      if (privateViews.includes(newView)) {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          setView(AppView.AUTH);
          return;
        }
      }

      if (newView !== AppView.CREATE_POST) {
        setRemixSource(null);
        setEditingPost(null);
      }
      
      // Update history state for native back button support
      window.history.pushState({ view: newView }, "");
      
      setViewHistory(prev => [...prev, view]);
      setView(newView);
    }
  }, [view]);

  // Listen for browser/native back button
  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      if (event.state && event.state.view) {
        setView(event.state.view);
      } else {
        // Fallback or exit logic
        goBack();
      }
    };

    window.addEventListener('popstate', handlePopState);
    
    // Initial state
    window.history.replaceState({ view: view }, "");

    return () => window.removeEventListener('popstate', handlePopState);
  }, []); // Only once on mount, internally uses the current values through navigation functions if needed or just sets raw state

  const goBack = () => {
    // 1. If reviewing flashcards, go back to flashcards list
    if (view === AppView.FLASHCARDS && isFlashcardReviewOpen) {
      setForceCloseFlashcardReview(true);
      setTimeout(() => setForceCloseFlashcardReview(false), 100);
      return;
    }

    // 2. If viewing flashcard detail (hard word), go back to flashcards list
    if (view === AppView.FLASHCARDS && isFlashcardDetailOpen) {
      setForceCloseFlashcardDetail(true);
      setTimeout(() => setForceCloseFlashcardDetail(false), 100);
      return;
    }

    // 3. Specific views that should always go to HOME
    if (view === AppView.FLASHCARDS || view === AppView.DASHBOARD || view === AppView.SEARCH || view === AppView.POSTS) {
      setView(AppView.HOME);
      setViewHistory([]);
      return;
    }

    if (view === AppView.MY_POSTS) {
      setView(AppView.PROFILE);
      return;
    }

    if (view === AppView.CREATE_POST) {
      setView(AppView.POSTS);
      return;
    }

    if (view === AppView.AUTH) {
      setView(AppView.HOME);
      return;
    }

    if (view === AppView.PRACTICE) {
      setView(AppView.SEARCH);
      return;
    }

    if (view === AppView.CATEGORIES) {
      setView(AppView.PROFILE);
      return;
    }

    if (view === AppView.CATEGORY_DETAIL) {
      setView(AppView.CATEGORIES);
      return;
    }

    // 4. Default back behavior
    if (viewHistory.length > 0) {
      const prev = viewHistory[viewHistory.length - 1];
      setViewHistory(prev => prev.slice(0, -1));
      setView(prev);
    } else if (view !== AppView.HOME) {
      setView(AppView.HOME);
    }
  };

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    safeSetLocalStorage('theme', newTheme);
    if (newTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    setTheme(savedTheme as 'light' | 'dark');
    
    if (savedTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, []);

  const [loadingMessage, setLoadingMessage] = useState('');
  const searchCache = React.useRef<Record<string, { mnemonic: MnemonicResponse, imageUrl: string }>>({});

  // Removed debounced search as per user request to only search on button press or synonym click

  const wordIndex = useMemo(() => {
    const index = new Map<string, SavedMnemonic>();
    if (Array.isArray(savedMnemonics)) {
      savedMnemonics.forEach(m => {
        const key = `${m.word.toLowerCase()}-${m.language || contentLanguage}`;
        index.set(key, m);
      });
    }
    return index;
  }, [savedMnemonics, contentLanguage]);

  /**
   * CORE SEARCH ENGINE
   * Handles spell checking, global library lookup, AI generation, and result storage.
   */
  const handleSearch = async (e?: React.FormEvent, word?: string) => {
    if (e) e.preventDefault();
    
    // Dismiss keyboard on mobile
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    
    // Monetization Check
    if (!isPremium && searchRemaining <= 0) {
      setError(t.errorLimitReached || "Kunlik limitga yetdingiz. Premiumga o'ting!");
      setState(AppState.ERROR);
      return;
    }

    const query = (word || searchQuery).toLowerCase().trim();
    if (!query) return;

    // Sanitize input: only single word, phrases, and 2 word which gives one meaning
    const cleanQuery = query.replace(/[0-9]/g, '').trim();
    const wordsCount = cleanQuery.split(/\s+/).filter(Boolean).length;
    
    if (wordsCount > 4 || wordsCount === 0) {
      setError(t.errorTooManyWords);
      setState(AppState.ERROR);
      return;
    }

    if (word) setSearchQuery(word);

    const cacheKey = `${query}-${contentLanguage}`;

    // 1. Check in-memory index of saved words first (FASTEST)
    const indexedMnemonic = wordIndex.get(cacheKey);
    if (indexedMnemonic) {
      setMnemonic(indexedMnemonic.data);
      setImageUrl(indexedMnemonic.imageUrl);
      setMnemonicId(indexedMnemonic.id);
      setState(AppState.RESULTS);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    // 2. Check session cache
    if (searchCache.current[cacheKey]) {
      setMnemonic(searchCache.current[cacheKey].mnemonic);
      setImageUrl(searchCache.current[cacheKey].imageUrl);
      setState(AppState.RESULTS);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    setState(AppState.LOADING);
    setLoadingMessage(t.checkingSpelling);
    setError(null);
    setMnemonic(null);
    setMnemonicId(undefined);
    setImageUrl('');

    try {
      // 3. Check global library (Supabase)
      let mnemonicData: MnemonicResponse | null = null;
      let img: string = '';
      let audio: string | undefined;
      let storedAudioUrl = '';

      const { data: rawMnemonics } = await supabase
        .from('mnemonics')
        .select('*')
        .eq('word', query)
        .eq('language', contentLanguage)
        .limit(1);
      
      let existingMnemonic = rawMnemonics?.[0];
      let currentId: string | undefined = existingMnemonic?.id;

      if (!existingMnemonic) {
        // AI Fallback
        setLoadingMessage(t.checkingSpelling);
        let correctedWord = await gemini.checkSpelling(query);
        correctedWord = correctedWord.toLowerCase().trim();

        if (correctedWord !== query) {
          const { data: correctedMnemonics } = await supabase
            .from('mnemonics')
            .select('*')
            .eq('word', correctedWord)
            .eq('language', contentLanguage)
            .limit(1);
          
          existingMnemonic = correctedMnemonics?.[0];
          currentId = existingMnemonic?.id;
        }

        if (!existingMnemonic) {
          setLoadingMessage(t.loadingMnemonic);
          mnemonicData = await gemini.getMnemonic(correctedWord, contentLanguage);
          
          setLoadingMessage(t.loadingAssets || 'Generating visual & audio aids...');
          
          // Parallelize asset generation
          const [base64Image, base64Audio, nuanceData] = await Promise.all([
            gemini.generateImage(mnemonicData.imagePrompt).catch(err => {
              console.error('Image gen failed:', err);
              return '';
            }),
            (async () => {
              const ttsText = `${mnemonicData.word}. ${mnemonicData.meaning}. ${mnemonicData.phoneticLink}. ${mnemonicData.imagination}. ${mnemonicData.connectorSentence}`;
              return gemini.generateTTS(ttsText, contentLanguage).catch(err => {
                console.error('TTS gen failed:', err);
                return '';
              });
            })(),
            gemini.generateNuance(mnemonicData.word, mnemonicData.synonyms, contentLanguage).catch(err => {
              console.error('Nuance gen failed:', err);
              return null;
            })
          ]);

          mnemonicData.nuance_data = nuanceData;
          let storedImageUrl = '';
          let storedAudioUrl = '';

          // Parallelize uploads
          await Promise.all([
            // Image processing and upload
            (async () => {
              if (base64Image) {
                try {
                  const imageBlob = await (await fetch(base64Image)).blob();
                  const options = {
                    maxSizeMB: 0.2,
                    maxWidthOrHeight: 1024,
                    useWebWorker: true,
                    fileType: 'image/webp'
                  };
                  const compressedFile = await imageCompression(imageBlob as File, options);
                  const fileName = `${correctedWord}-${contentLanguage}-${Date.now()}.webp`;
                  const { error: uploadError } = await supabase.storage
                    .from('mnemonic_assets')
                    .upload(`images/${fileName}`, compressedFile, { upsert: true });
                  if (!uploadError) {
                    storedImageUrl = getStorageUrl('mnemonic_assets', `images/${fileName}`);
                  }
                } catch (imgErr) {
                  console.error('Image processing error:', imgErr);
                }
              }
            })(),
            // Audio processing and upload
            (async () => {
              if (base64Audio) {
                try {
                  const audioResponse = await fetch(`data:audio/wav;base64,${base64Audio}`);
                  const audioBlob = await audioResponse.blob();
                  const audioFileName = `${correctedWord}-${contentLanguage}-${Date.now()}.wav`;
                  const { error: audioUploadError } = await supabase.storage
                    .from('mnemonic_assets')
                    .upload(`audio/${audioFileName}`, audioBlob, { upsert: true });
                  if (!audioUploadError) {
                    storedAudioUrl = getStorageUrl('mnemonic_assets', `audio/${audioFileName}`);
                  }
                } catch (audioErr) {
                  console.error('Audio processing error:', audioErr);
                }
              }
            })()
          ]);

          img = storedImageUrl || base64Image;
          audio = storedAudioUrl || (base64Audio ? `data:audio/wav;base64,${base64Audio}` : '');
          mnemonicData.audioUrl = audio;

          // Save to global library
          const { data: newMnemonicList, error: insertError } = await supabase.from('mnemonics').insert({
            word: correctedWord,
            data: mnemonicData,
            image_url: img,
            audio_url: audio,
            pronunciation_url: audio,
            language: contentLanguage,
            keyword: mnemonicData.phoneticLink,
            story: mnemonicData.imagination,
            category: mnemonicData.category,
            nuance_data: mnemonicData.nuance_data
          }).select().limit(1);
          
          const newMnemonic = newMnemonicList?.[0];
          currentId = newMnemonic?.id;

          if (insertError) {
            console.error('Error inserting mnemonic:', insertError);
            // If it already exists (race condition), just fetch it
            if (insertError.code === '23505') {
              const { data: existingList } = await supabase
                .from('mnemonics')
                .select('*')
                .eq('word', correctedWord)
                .eq('language', contentLanguage)
                .limit(1);
              const existing = existingList?.[0];
              if (existing) {
                currentId = existing.id;
                mnemonicData = {
                  ...(existing.data as MnemonicResponse),
                  nuance_data: existing.nuance_data || (existing.data as any).nuance_data
                };
                img = existing.image_url;

                // Generate Deep Dive if missing for existing word (race condition path)
                if (!mnemonicData.nuance_data) {
                  setLoadingMessage(t.loadingNuance || 'Updating Deep Dive...');
                  try {
                    const nuanceData = await gemini.generateNuance(mnemonicData.word, mnemonicData.synonyms, contentLanguage);
                    mnemonicData.nuance_data = nuanceData;
                    const { error: updateError } = await supabase.from('mnemonics').update({ 
                      data: mnemonicData,
                      nuance_data: nuanceData 
                    }).eq('id', existing.id);
                    if (updateError) console.error('Error updating nuance (race):', updateError);
                  } catch (nuanceErr) {
                    console.error('Error updating nuance for existing word (race):', nuanceErr);
                  }
                }
              }
            } else {
              console.error('Error inserting mnemonic:', insertError);
              throw new Error(`Supabase Mnemonic Save Error: ${insertError.message} (${insertError.code})`);
            }
          }
        } else {
          // Found after spelling correction
          mnemonicData = {
            ...(existingMnemonic.data as MnemonicResponse),
            nuance_data: existingMnemonic.nuance_data || (existingMnemonic.data as any).nuance_data
          };
          img = existingMnemonic.image_url;
          audio = existingMnemonic.audio_url;
          if (mnemonicData) mnemonicData.audioUrl = audio;

          // Generate Deep Dive if missing for existing word
          if (!mnemonicData.nuance_data) {
            setLoadingMessage(t.loadingNuance || 'Updating Deep Dive...');
            try {
              const nuanceData = await gemini.generateNuance(mnemonicData.word, mnemonicData.synonyms, contentLanguage);
              mnemonicData.nuance_data = nuanceData;
              const { error: updateError } = await supabase.from('mnemonics').update({ 
                data: mnemonicData,
                nuance_data: nuanceData 
              }).eq('id', existingMnemonic.id);
              if (updateError) console.error('Error updating nuance (spell):', updateError);
            } catch (nuanceErr) {
              console.error('Error updating nuance for existing word:', nuanceErr);
            }
          }
        }
      } else {
        // Found immediately with raw query
        mnemonicData = {
          ...(existingMnemonic.data as MnemonicResponse),
          nuance_data: existingMnemonic.nuance_data || (existingMnemonic.data as any).nuance_data
        };
        img = existingMnemonic.image_url;
        audio = existingMnemonic.audio_url;
        if (mnemonicData) mnemonicData.audioUrl = audio;

        // Generate Deep Dive if missing for existing word
        if (!mnemonicData.nuance_data) {
          setLoadingMessage(t.loadingNuance || 'Updating Deep Dive...');
          try {
            const nuanceData = await gemini.generateNuance(mnemonicData.word, mnemonicData.synonyms, contentLanguage);
            mnemonicData.nuance_data = nuanceData;
            const { error: updateError } = await supabase.from('mnemonics').update({ 
              data: mnemonicData,
              nuance_data: nuanceData 
            }).eq('id', existingMnemonic.id);
            if (updateError) console.error('Error updating nuance (raw):', updateError);
          } catch (nuanceErr) {
            console.error('Error updating nuance for existing word:', nuanceErr);
          }
        }
      }

      setMnemonic(mnemonicData);
      setMnemonicId(currentId);
      setImageUrl(img);
      setState(AppState.RESULTS);
      setLoadingMessage('');

      // Increment search count for Freemium
      if (!isPremium) {
        await incrementSearchCount();
      }

      // Update cache with both the original query and the corrected word
      searchCache.current[cacheKey] = { mnemonic: mnemonicData, imageUrl: img };
      if (mnemonicData.word.toLowerCase() !== query) {
        const correctedCacheKey = `${mnemonicData.word.toLowerCase()}-${contentLanguage}`;
        searchCache.current[correctedCacheKey] = { mnemonic: mnemonicData, imageUrl: img };
      }

      // 2. Save to user's personal list if logged in
      if (user && mnemonicData) {
        const wordToSave = mnemonicData.word.toLowerCase();
        const { data: wordRecords, error: fetchError } = await supabase
          .from('mnemonics')
          .select('id')
          .eq('word', wordToSave)
          .eq('language', contentLanguage)
          .limit(1);
        
        const wordRecord = wordRecords?.[0];

        if (fetchError) {
          console.error('Error fetching word record:', fetchError);
          throw new Error(`Supabase Fetch Error: ${fetchError.message}`);
        }

        if (wordRecord) {
          const { error: upsertError } = await supabase
            .from('user_words')
            .upsert({
              user_id: user.id,
              word_id: wordRecord.id,
              last_reviewed_at: new Date().toISOString(),
              is_mastered: false
            }, { onConflict: 'user_id,word_id' });
          
          if (upsertError) {
            console.error('Error upserting user word:', upsertError);
            throw new Error(`Supabase UserWord Upsert Error: ${upsertError.message}`);
          }
          refetchWords();
        }
      } else if (!user && mnemonicData) {
        // Guest mode - local state only (Not handled by TanStack Query for now, but kept for compatibility)
        // Since savedMnemonics comes from the hook, it's read-only here
      }
    } catch (err: any) {
      console.error(err);
      const msg = err?.message || '';
      if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED')) {
        setError(t.errorQuota);
      } else {
        setError(msg || t.errorGeneral);
      }
      setState(AppState.ERROR);
    }
  };

  const handleShareMnemonic = async (data: MnemonicResponse, img: string) => {
    if (!user) {
      setView(AppView.AUTH);
      return;
    }
    
    try {
      // 1. Ensure mnemonic exists in DB
      let mnemonicId;
      const { data: existingList } = await supabase
        .from('mnemonics')
        .select('id')
        .eq('word', data.word)
        .eq('language', contentLanguage)
        .limit(1);
      
      const existing = existingList?.[0];
        
      if (existing) {
        mnemonicId = existing.id;
      } else {
        const { data: newM, error: mErr } = await supabase
          .from('mnemonics')
          .insert({
            word: data.word,
            data: data,
            image_url: img,
            audio_url: data.audioUrl,
            language: contentLanguage
          })
          .select()
          .limit(1);
        
        if (mErr) throw mErr;
        mnemonicId = newM?.[0]?.id;
      }

      // 2. Create post
      const { error: pErr } = await supabase
        .from('posts')
        .insert({
          user_id: user.id,
          mnemonic_id: mnemonicId,
          language: contentLanguage
        });
      
      if (pErr) throw pErr;
      
      // Invalidate posts
      queryClient.invalidateQueries({ queryKey: ['posts'] });
      setView(AppView.POSTS);
    } catch (err) {
      console.error('Error sharing mnemonic:', err);
    }
  };

  const handleDelete = useCallback(async (id: string) => {
    if (user) {
      if (!isOnline) {
        await enqueue('user_words', SyncOperation.DELETE, { id });
        refetchWords(); // Invalidate local UI (optimistic)
        return;
      }
      const { error } = await supabase.from('user_words').delete().eq('id', id);
      if (!error) {
        refetchWords();
      }
    }
  }, [user, refetchWords, isOnline, enqueue]);

  const handleSavePostToLibrary = async (post: Post) => {
    try {
      // Create a full MnemonicResponse object from the post data
      const mnemonicData: MnemonicResponse = {
        word: post.word,
        transcription: '',
        meaning: post.keyword, // Fallback to keyword
        morphology: '',
        imagination: post.story,
        phoneticLink: post.keyword,
        connectorSentence: '',
        examples: [],
        synonyms: [],
        imagePrompt: '',
        level: 'Intermediate'
      };

      // 1. Save to global library if not exists
      const { data: existingList } = await supabase
        .from('mnemonics')
        .select('id')
        .eq('word', post.word)
        .eq('language', post.language)
        .limit(1);
      
      const existing = existingList?.[0];

      if (!existing) {
        await supabase.from('mnemonics').insert({
          word: post.word,
          data: mnemonicData,
          image_url: post.image_url,
          language: post.language
        });
      }

      // 2. Save to user's personal list
      if (user) {
        const { data: wordRecords } = await supabase
          .from('mnemonics')
          .select('id')
          .eq('word', post.word)
          .eq('language', post.language)
          .limit(1);
        
        const wordRecord = wordRecords?.[0];

        if (wordRecord) {
          if (!isOnline) {
            await enqueue('user_words', SyncOperation.CREATE, {
              user_id: user.id,
              word_id: wordRecord.id,
              last_reviewed_at: new Date().toISOString(),
              is_mastered: false
            });
            refetchWords();
            return;
          }
          const { error: upsertError } = await supabase
            .from('user_words')
            .upsert({
              user_id: user.id,
              word_id: wordRecord.id,
              last_reviewed_at: new Date().toISOString(),
              is_mastered: false
            }, { onConflict: 'user_id,word_id' });
          
          if (!upsertError) refetchWords();
        }
      }
    } catch (err) {
      console.error("Save error:", err);
    }
  };

  const handleRemixPost = (post: Post) => {
    setRemixSource(post);
    setView(AppView.CREATE_POST);
  };

  const [practiceWord, setPracticeWord] = useState<{word: string, meaning: string} | null>(null);
  const [selectedFlashcardWord, setSelectedFlashcardWord] = useState<SavedMnemonic | null>(null);
  const [remixSource, setRemixSource] = useState<Post | null>(null);
  const [editingPost, setEditingPost] = useState<Post | null>(null);

  const startPractice = (word: string, meaning: string) => {
    setPracticeWord({ word, meaning });
    setView(AppView.PRACTICE);
  };

  const handleToggleHard = useCallback(async (id: string, isHard: boolean) => {
    if (user) {
      if (!isOnline) {
        await enqueue('user_words', SyncOperation.UPDATE, { payload: { is_hard: isHard }, query: { id } });
        refetchWords();
        return;
      }
      const { error } = await supabase.from('user_words').update({ is_hard: isHard }).eq('id', id);
      if (!error) {
        refetchWords();
      }
    }
  }, [user, refetchWords, isOnline, enqueue]);

  const handleToggleMastered = useCallback(async (id: string, isMastered: boolean) => {
    if (user) {
      if (!isOnline) {
        await enqueue('user_words', SyncOperation.UPDATE, { payload: { is_mastered: isMastered }, query: { id } });
        refetchWords();
        return;
      }
      const { error } = await supabase.from('user_words').update({ is_mastered: isMastered }).eq('id', id);
      if (!error) {
        refetchWords();
      }
    }
  }, [user, refetchWords, isOnline, enqueue]);


  // Apply theme
  useEffect(() => {
    const theme = userProfile?.app_theme || AppTheme.ORANGE;
    if (theme === AppTheme.PURPLE) {
      document.documentElement.classList.add('theme-purple');
    } else {
      document.documentElement.classList.remove('theme-purple');
    }
  }, [userProfile?.app_theme]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-12 h-12 text-accent animate-spin" />
      </div>
    );
  }

  const masteredCount = Array.isArray(savedMnemonics) ? savedMnemonics.filter(m => m.isMastered).length : 0;

  if (isAuthReady && user && isDeviceAuthorized === false) {
    return (
      <div className="min-h-screen bg-neutral dark:bg-primary flex flex-col items-center justify-center p-8 text-center space-y-6">
        <div className="w-20 h-20 bg-accent/10 rounded-full flex items-center justify-center">
          <AlertCircle className="w-10 h-10 text-accent" />
        </div>
        <h1 className="text-2xl font-bold font-sans">{t.premium?.deviceLockedTitle || "Account is active on another device"}</h1>
        <div className="space-y-4">
          <p className="text-gray-500 max-w-sm">
            {t.premium?.deviceLockedDesc || "Sizning hisobingiz boshqa qurilmada faol. Xavfsizlik choralari tufayli faqat bitta qurilmada foydalanish mumkin."}
          </p>
          <p className="text-sm text-gray-400">
            {t.premium?.deviceLockedNote || "Agar ushbu qurilmadan foydalanmoqchi bo'lsangiz, avvalgisini bloklang."}
          </p>
        </div>
        <div className="flex flex-col gap-3 w-full max-w-xs">
          <button 
            onClick={resetDevice}
            className="w-full px-8 py-3 bg-accent text-white rounded-xl font-bold hover:bg-accent-hover transition-all"
          >
            {t.premium?.confirmDevice || "USHBU QURILMANI TASDIQLASH"}
          </button>
          <button 
            onClick={() => supabase.auth.signOut()}
            className="w-full px-8 py-3 bg-gray-100 dark:bg-white/10 rounded-xl font-bold hover:bg-gray-200 transition-all"
          >
            {t.profile?.signOut || "TIZIMDAN CHIQISH"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`${view === AppView.AUTH ? 'h-screen overflow-hidden' : 'min-h-screen'} bg-neutral dark:bg-primary transition-colors duration-500 font-sans selection:bg-accent/10 selection:text-accent`}>
      {/* Navigation Bar */}
      {view !== AppView.AUTH && (
        <nav className="sticky top-0 z-50 px-4 py-4 sm:py-6 bg-transparent">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            {/* Desktop Logo */}
            <div 
              className="hidden md:flex items-center gap-3 cursor-pointer group"
              onClick={() => navigateTo(AppView.HOME)}
            >
              <div className="w-10 h-10 bg-accent rounded-xl flex items-center justify-center text-white font-black text-xl shadow-lg shadow-accent/20 group-hover:scale-110 transition-transform">
                M
              </div>
              <span className="text-2xl font-black text-gray-900 dark:text-white tracking-tight hidden lg:block">
                MnemoniX
              </span>
            </div>

            {/* Mobile Back Button */}
            <div className="md:hidden flex-1 flex items-center">
              {(view !== AppView.HOME || isFlashcardDetailOpen || isFlashcardReviewOpen) && (
                <button 
                  onClick={goBack}
                  className="w-10 h-10 flex items-center justify-center bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-xl text-gray-500 dark:text-gray-400 active:scale-90 transition-transform"
                >
                  <ChevronLeft size={24} />
                </button>
              )}
            </div>

            {/* Mobile Centered Logo */}
            <div className="md:hidden flex-[2] flex items-center justify-center gap-2">
              <div className="w-8 h-8 bg-accent rounded-lg flex items-center justify-center text-white font-black text-sm shadow-lg shadow-accent/20">
                M
              </div>
              <span className="text-lg font-black text-gray-900 dark:text-white tracking-tight">
                MnemoniX
              </span>
            </div>

            {/* Tablet/Desktop Navigation (md and up) */}
            <div className="hidden md:flex items-center gap-4 lg:gap-6">
              {/* Center Nav - Pill */}
              <div className="flex items-center bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border border-gray-100 dark:border-slate-800 p-1.5 rounded-full shadow-sm">
                {[
                  { id: AppView.HOME, label: t.navHome, tour: "home" },
                  { id: AppView.SEARCH, label: t.navSearch, tour: "search" },
                  { id: AppView.POSTS, label: t.navPosts, tour: "posts" },
                  { id: AppView.FLASHCARDS, label: t.navFlash, tour: "flashcards" },
                  { id: AppView.DASHBOARD, label: t.navDash, tour: "dashboard" }
                ].map((item) => (
                  <button
                    key={item.id}
                    onClick={() => navigateTo(item.id)}
                    data-tour={item.tour}
                    className={`px-6 py-2.5 rounded-full text-sm font-bold transition-all whitespace-nowrap ${
                      view === item.id 
                        ? 'bg-accent text-white shadow-lg shadow-accent/20' 
                        : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              {/* Voice Assistant Toggle */}
              <button 
                onClick={() => setState(AppState.VOICE_MODE)}
                className="flex items-center gap-2 bg-accent text-white px-4 py-2 rounded-full shadow-lg shadow-accent/20 font-bold text-sm hover:bg-accent-hover transition-all"
              >
                <div className="w-1.5 h-1.5 bg-white rounded-full animate-pulse"></div>
                <Mic size={18} />
              </button>

              {/* Settings Icons */}
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => setView(AppView.PROFILE)}
                  data-tour="profile"
                  className="w-10 h-10 flex items-center justify-center bg-white/80 dark:bg-primary/80 border border-gray-100 dark:border-white/10 rounded-full text-gray-500 dark:text-gray-400 hover:text-accent dark:hover:text-accent transition-all shadow-sm overflow-hidden"
                >
                  {userProfile?.avatar_url && userProfile.avatar_url !== "" ? (
                    <img src={userProfile.avatar_url} alt="Profile" className="w-full h-full object-cover" />
                  ) : (
                    <UserIcon size={20} />
                  )}
                </button>
                <button 
                  onClick={toggleTheme}
                  className="w-10 h-10 flex items-center justify-center bg-white/80 dark:bg-primary/80 border border-gray-100 dark:border-white/10 rounded-full text-gray-500 dark:text-gray-400 hover:text-accent dark:hover:text-accent transition-all shadow-sm"
                >
                  {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
                </button>
              </div>
            </div>

            {/* Mobile Navigation (md:hidden) */}
            <div className="md:hidden flex-1 flex justify-end">
              {/* Hamburger Menu */}
              <div className="relative">
                <button 
                  onClick={() => setIsMenuOpen(!isMenuOpen)}
                  data-tour="profile"
                  className={`w-10 h-10 flex items-center justify-center rounded-full transition-all ${
                    isMenuOpen 
                      ? 'bg-accent text-white' 
                      : 'bg-white/80 dark:bg-slate-900/80 border border-gray-100 dark:border-slate-800 text-gray-500 dark:text-gray-400'
                  } shadow-sm`}
                >
                  {isMenuOpen ? <X size={20} /> : <MoreVertical size={20} />}
                </button>

                  <AnimatePresence>
                    {isMenuOpen && (
                      <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                        className="absolute right-0 mt-2 w-56 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-2xl shadow-2xl p-2 z-50"
                      >
                        {/* Profile */}
                        <button
                          onClick={() => {
                            setView(AppView.PROFILE);
                            setIsMenuOpen(false);
                          }}
                          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-slate-800 transition-all"
                        >
                          <div className="w-6 h-6 rounded-full overflow-hidden flex-shrink-0 bg-gray-100 dark:bg-slate-800 flex items-center justify-center">
                            {userProfile?.avatar_url && userProfile.avatar_url !== "" ? (
                              <img src={userProfile.avatar_url} alt="Profile" className="w-full h-full object-cover" />
                            ) : (
                              <UserIcon size={14} />
                            )}
                          </div>
                          {t.navProfile}
                        </button>

                        {/* Theme Toggle */}
                        <button
                          onClick={() => {
                            toggleTheme();
                            setIsMenuOpen(false);
                          }}
                          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-slate-800 transition-all"
                        >
                          {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
                          {theme === 'light' ? t.darkMode : t.lightMode}
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </div>
          </nav>
        )}

      <main className={view === AppView.AUTH ? "w-full h-screen overflow-hidden" : "max-w-7xl mx-auto px-4 sm:px-8 py-4 sm:py-8 pb-24 md:pb-12"}>
        <React.Suspense fallback={
          <div className="flex items-center justify-center p-20">
            <Loader2 className="w-8 h-8 text-accent animate-spin" />
          </div>
        }>
          <AnimatePresence mode="wait">
          {view === AppView.AUTH && (
            <motion.div key="auth" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <Auth onClose={() => goBack()} onSuccess={() => { setIsGuest(false); setView(AppView.HOME); }} t={t} />
            </motion.div>
          )}

          {view === AppView.HOME && (
            <motion.div 
              key="home"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8 sm:space-y-12"
            >
              {/* Hero Section */}
              <div className="text-center max-w-4xl mx-auto space-y-6 py-4 sm:py-8">
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-accent/10 dark:bg-accent/20 text-accent dark:text-accent rounded-full text-sm font-black uppercase tracking-wider animate-bounce">
                  <Sparkles size={16} />
                  {t.aiPowered}
                </div>
                <h1 className="text-4xl sm:text-7xl font-black text-gray-900 dark:text-white tracking-tight leading-[1.1]">
                  {t.heroTitle}
                </h1>
                <p className="text-lg sm:text-2xl text-gray-500 dark:text-gray-400 font-medium leading-relaxed max-w-2xl mx-auto">
                  {t.heroSubtitle}
                </p>

                <div className="grid grid-cols-2 sm:flex sm:flex-row justify-center gap-3 sm:gap-4 pt-4 sm:pt-6">
                   <button 
                    onClick={() => setState(AppState.VOICE_MODE)}
                    className="flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-3 px-4 py-4 sm:px-10 sm:py-5 bg-white dark:bg-primary border-2 border-gray-100 dark:border-white/10 rounded-2xl sm:rounded-[2rem] font-black text-sm sm:text-xl text-gray-600 dark:text-gray-400 hover:border-accent hover:text-accent dark:hover:text-accent transition-all shadow-sm w-full sm:w-auto text-center"
                   >
                     <Mic size={20} className="sm:w-6 sm:h-6" />
                     <span className="leading-tight">{t.btnVoice}</span>
                   </button>
                   <button 
                    onClick={() => setView(AppView.SEARCH)}
                    className="flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-3 px-4 py-4 sm:px-10 sm:py-5 bg-accent text-white rounded-2xl sm:rounded-[2rem] font-black text-sm sm:text-xl shadow-2xl shadow-accent/20 dark:shadow-none hover:bg-accent-hover transition-all active:scale-95 w-full sm:w-auto text-center"
                   >
                     <Search size={20} className="sm:w-6 sm:h-6" />
                     <span className="leading-tight">{t.btnStartSearch}</span>
                   </button>
                </div>
              </div>

              {/* Results / Loading States */}
              <div className="min-h-[200px]">
                <AboutSection t={t} />
              </div>

              {/* Footer Section */}
              <div className="pt-8 pb-4 border-t border-gray-100 dark:border-slate-800 space-y-4">
                <div className="text-center space-y-4">
                  <h4 className="text-gray-400 dark:text-gray-500 font-black text-[10px] uppercase tracking-[0.2em]">{t.contactUs}</h4>
                  <div className="flex justify-center gap-4 sm:gap-8">
                    <a href="https://www.instagram.com/mnemonix.io?igsh=b3UxZTZyOXJ0enhu" target="_blank" rel="noopener noreferrer" className="flex flex-col items-center gap-2 group">
                      <div className="w-12 h-12 sm:w-14 sm:h-14 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-2xl flex items-center justify-center text-pink-500 border-pink-500/10 transition-all shadow-sm group-hover:scale-110">
                        <Instagram size={24} />
                      </div>
                      <span className="text-[9px] font-black uppercase tracking-widest text-gray-400 group-hover:text-pink-500 transition-colors">{t.instagram}</span>
                    </a>
                    <a href="https://t.me/mnemonix_io" target="_blank" rel="noopener noreferrer" className="flex flex-col items-center gap-2 group">
                      <div className="w-12 h-12 sm:w-14 sm:h-14 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-2xl flex items-center justify-center text-blue-400 border-blue-400/10 transition-all shadow-sm group-hover:scale-110">
                        <Send size={24} />
                      </div>
                      <span className="text-[9px] font-black uppercase tracking-widest text-gray-400 group-hover:text-blue-400 transition-colors">{t.telegram}</span>
                    </a>
                    <a href="mailto:hello@mnemonix.io" className="flex flex-col items-center gap-2 group">
                      <div className="w-12 h-12 sm:w-14 sm:h-14 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-2xl flex items-center justify-center text-red-500 border-red-500/10 transition-all shadow-sm group-hover:scale-110">
                        <Mail size={24} />
                      </div>
                      <span className="text-[9px] font-black uppercase tracking-widest text-gray-400 group-hover:text-red-500 transition-colors">{t.gmail}</span>
                    </a>
                    <a href="tel:+998504504182" className="flex flex-col items-center gap-2 group">
                      <div className="w-12 h-12 sm:w-14 sm:h-14 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-2xl flex items-center justify-center text-emerald-500 border-emerald-500/10 transition-all shadow-sm group-hover:scale-110">
                        <Phone size={24} />
                      </div>
                      <span className="text-[9px] font-black uppercase tracking-widest text-gray-400 group-hover:text-emerald-500 transition-colors">{t.call}</span>
                    </a>
                  </div>
                </div>
                <div className="text-center pt-4">
                  <p className="text-gray-400 dark:text-gray-600 text-[9px] font-black uppercase tracking-[0.2em]">
                    {t.copyright}
                  </p>
                  <div className="flex justify-center gap-4 mt-2">
                    <button 
                      onClick={() => navigateTo(AppView.PRIVACY_POLICY)}
                      className="text-gray-400 dark:text-gray-600 text-[8px] font-black uppercase tracking-widest hover:text-accent transition-colors"
                    >
                      {t.privacyPolicy}
                    </button>
                    <button 
                      onClick={() => navigateTo(AppView.TERMS_OF_SERVICE)}
                      className="text-gray-400 dark:text-gray-600 text-[8px] font-black uppercase tracking-widest hover:text-accent transition-colors"
                    >
                      {t.termsOfService}
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {view === AppView.SEARCH && (
            <motion.div key="search" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <SearchPage 
                user={user}
                language={contentLanguage}
                state={state}
                mnemonic={mnemonic}
                mnemonicId={mnemonicId}
                imageUrl={imageUrl}
                error={error}
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
                handleSearch={handleSearch}
                savedMnemonics={savedMnemonics}
                setState={setState}
                onNavigate={navigateTo}
                onPractice={startPractice}
                t={t}
                loadingMessage={loadingMessage}
                isPremium={isPremium}
                searchRemaining={searchRemaining}
              />
            </motion.div>
          )}

          {view === AppView.DASHBOARD && (
            <motion.div key="dashboard" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <Dashboard 
                savedMnemonics={savedMnemonics} 
                language={contentLanguage} 
                onDelete={handleDelete} 
                onNavigate={navigateTo}
                t={t.dashboard} 
                fullT={t}
                profile={userProfile}
                currentTier={currentTier}
              />
            </motion.div>
          )}

          {view === AppView.PERSONALIZATION && (
            <motion.div key="personalization" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <Personalization 
                user={user} 
                onComplete={() => {
                  refetchProfile();
                  setView(AppView.HOME);
                  // setShowTour(true); // Disabled for now
                }} 
              />
            </motion.div>
          )}

          {view === AppView.FLASHCARDS && (
            <motion.div key="flashcards" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <Flashcards 
                savedMnemonics={savedMnemonics} 
                language={contentLanguage} 
                onToggleHard={handleToggleHard}
                onToggleMastered={handleToggleMastered}
                onDetailChange={(isOpen) => {
                  setIsFlashcardDetailOpen(isOpen);
                  if (!isOpen) setSelectedFlashcardWord(null);
                }}
                onReviewChange={setIsFlashcardReviewOpen}
                onWordSelect={setSelectedFlashcardWord}
                forceCloseDetail={forceCloseFlashcardDetail}
                forceCloseReview={forceCloseFlashcardReview}
                onPractice={startPractice}
                onSearchWord={(word) => {
                  setSearchQuery(word);
                  setView(AppView.SEARCH);
                  handleSearch(undefined, word);
                }}
                t={t.flashcards}
                fullT={t}
              />
            </motion.div>
          )}

          {view === AppView.PROFILE && (
            <motion.div key="profile" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <Profile 
                user={user} 
                savedMnemonics={savedMnemonics}
                totalWords={savedMnemonics.length} 
                masteredCount={masteredCount}
                userPostCount={posts.filter(p => p.user_id === user?.id && !p.parent_post_id).length}
                userRemixCount={posts.filter(p => p.user_id === user?.id && !!p.parent_post_id).length}
                onSignOut={async () => { 
                  await supabase.auth.signOut();
                  setIsGuest(true); 
                  setUser(null); 
                  setView(AppView.AUTH);
                }} 
                onSignIn={() => navigateTo(AppView.AUTH)}
                onNavigate={navigateTo}
                onProfileUpdate={() => refetchProfile()}
                language={language}
                onLanguageChange={setLanguage}
                profile={userProfile}
                t={t.profile}
                fullT={t}
                currentTier={currentTier}
              />
            </motion.div>
          )}

          {view === AppView.POSTS && (
            <motion.div key="posts" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <Posts 
                user={user} 
                language={contentLanguage} 
                theme={theme} 
                viewMode="all" 
                isPremium={isPremium}
                onNavigate={navigateTo}
                onSaveToLibrary={handleSavePostToLibrary}
                onRemix={handleRemixPost}
                onEditPost={(post) => {
                  setEditingPost(post);
                  setView(AppView.CREATE_POST);
                }}
                t={t.posts}
              />
            </motion.div>
          )}

          {view === AppView.MY_POSTS && (
            <motion.div key="my-posts" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <Posts 
                user={user} 
                language={contentLanguage} 
                theme={theme} 
                viewMode="mine" 
                isPremium={isPremium}
                onNavigate={navigateTo}
                onSaveToLibrary={handleSavePostToLibrary}
                onRemix={handleRemixPost}
                onEditPost={(post) => {
                  setEditingPost(post);
                  setView(AppView.CREATE_POST);
                }}
                t={t.posts}
              />
            </motion.div>
          )}

          {view === AppView.MY_REMIXES && (
            <motion.div key="my-remixes" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <Posts 
                user={user} 
                language={contentLanguage} 
                theme={theme} 
                viewMode="remixes" 
                isPremium={isPremium}
                onNavigate={navigateTo}
                onSaveToLibrary={handleSavePostToLibrary}
                onRemix={handleRemixPost}
                onEditPost={(post) => {
                  setEditingPost(post);
                  setView(AppView.CREATE_POST);
                }}
                t={t.posts}
              />
            </motion.div>
          )}

          {view === AppView.CREATE_POST && (
            <motion.div key="create-post" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <Posts 
                user={user} 
                language={contentLanguage} 
                theme={theme} 
                viewMode="create" 
                isPremium={isPremium}
                onNavigate={navigateTo}
                onSaveToLibrary={handleSavePostToLibrary}
                onRemix={handleRemixPost}
                remixSource={remixSource}
                editingPost={editingPost}
                t={t.posts}
              />
            </motion.div>
          )}

          {view === AppView.PRACTICE && (practiceWord || mnemonic || selectedFlashcardWord || savedMnemonics.length > 0) && (
            <PracticePartner 
              word={practiceWord?.word || mnemonic?.word || selectedFlashcardWord?.word || savedMnemonics[0]?.data.word}
              meaning={practiceWord?.meaning || mnemonic?.meaning || selectedFlashcardWord?.data.meaning || savedMnemonics[0]?.data.meaning}
              language={contentLanguage}
              onClose={() => {
                setView(AppView.SEARCH);
                setPracticeWord(null);
              }}
              onComplete={async () => {
                const wordToMaster = practiceWord?.word || mnemonic?.word || savedMnemonics[0]?.data.word;
                const savedWord = savedMnemonics.find(m => m.word === wordToMaster);
                if (savedWord && !savedWord.isMastered) {
                  await handleToggleMastered(savedWord.id, true);
                }
              }}
            />
          )}

          {view === AppView.CATEGORIES && (
            <motion.div key="categories" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <CategoriesPage 
                savedMnemonics={savedMnemonics} 
                onNavigate={navigateTo} 
                onSelectCategory={(cat) => {
                  setSelectedCategory(cat);
                  navigateTo(AppView.CATEGORY_DETAIL);
                }} 
                t={t.categories}
              />
            </motion.div>
          )}

          {view === AppView.CATEGORY_DETAIL && selectedCategory && (
            <motion.div key="category-detail" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <CategoryDetailPage 
                category={selectedCategory} 
                savedMnemonics={savedMnemonics} 
                onNavigate={navigateTo} 
                onSelectWord={(word) => {
                  const saved = savedMnemonics.find(m => m.word === word);
                  if (saved) {
                    setSelectedMnemonicForReview(saved);
                    navigateTo(AppView.WORD_REVIEW);
                  }
                }} 
                onPractice={(word, meaning) => {
                  setPracticeWord({ word, meaning });
                  setView(AppView.PRACTICE);
                }}
                onPlayAudio={handlePlayAudio}
                isAudioLoading={isAudioLoading}
                t={t.categories}
              />
            </motion.div>
          )}

          {view === AppView.WORD_REVIEW && selectedMnemonicForReview && (
            <motion.div key="word-review" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
              <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
                <button 
                  onClick={() => navigateTo(AppView.CATEGORY_DETAIL)}
                  className="p-3 bg-white dark:bg-slate-900 rounded-2xl shadow-lg border border-gray-100 dark:border-slate-800 hover:scale-110 transition-transform active:scale-95 flex items-center gap-2 font-black text-gray-600 dark:text-gray-400"
                >
                  <ChevronLeft size={24} />
                  {t.backToCategory.replace('{category}', selectedCategory)}
                </button>
                <MnemonicCard 
                  data={selectedMnemonicForReview.data} 
                  imageUrl={selectedMnemonicForReview.imageUrl} 
                  language={selectedMnemonicForReview.language} 
                  mnemonicId={selectedMnemonicForReview.mnemonicId}
                  onPractice={startPractice}
                  t={t}
                />
              </div>
            </motion.div>
          )}

          {view === AppView.SUBSCRIPTION && (
            <motion.div key="subscription-page" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <SubscriptionPage 
                user={user} 
                onNavigate={navigateTo} 
                language={language} 
                t={t} 
                onSignIn={() => setView(AppView.AUTH)} 
              />
            </motion.div>
          )}

          {view === AppView.PRIVACY_POLICY && (
            <motion.div key="privacy-policy" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <PrivacyPolicy onBack={() => goBack()} t={t} />
            </motion.div>
          )}

          {view === AppView.TERMS_OF_SERVICE && (
            <motion.div key="terms-of-service" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <TermsOfService onBack={() => goBack()} t={t} />
            </motion.div>
          )}
        </AnimatePresence>
      </React.Suspense>
    </main>

      {/* Floating Practice Button */}
      <AnimatePresence>
        {view !== AppView.AUTH && ((view === AppView.SEARCH && mnemonic) || 
          (view === AppView.FLASHCARDS && selectedFlashcardWord) ||
          (view === AppView.WORD_REVIEW && selectedMnemonicForReview)) && (
          <motion.button
            initial={{ opacity: 0, scale: 0, x: 50 }}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            exit={{ opacity: 0, scale: 0, x: 50 }}
            onClick={() => {
              let wordToPractice = '';
              let meaningToPractice = '';

              if (view === AppView.FLASHCARDS && selectedFlashcardWord) {
                wordToPractice = selectedFlashcardWord.word;
                meaningToPractice = selectedFlashcardWord.data.meaning;
              } else if (view === AppView.WORD_REVIEW && selectedMnemonicForReview) {
                wordToPractice = selectedMnemonicForReview.word;
                meaningToPractice = selectedMnemonicForReview.data.meaning;
              } else if (view === AppView.SEARCH && mnemonic) {
                wordToPractice = mnemonic.word;
                meaningToPractice = mnemonic.meaning;
              }

              if (wordToPractice) {
                startPractice(wordToPractice, meaningToPractice);
              } else {
                setView(AppView.PRACTICE);
              }
            }}
            className={`fixed right-6 ${isKeyboardOpen ? 'bottom-8' : 'bottom-24 md:bottom-8'} z-[60] flex items-center gap-2 px-4 py-2.5 bg-accent text-white rounded-full font-black shadow-xl shadow-accent/20 dark:shadow-none hover:bg-accent-hover hover:scale-110 transition-all active:scale-95 group`}
          >
            <div className="relative">
              <Sparkles size={18} />
              <div className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-emerald-400 rounded-full border border-accent animate-pulse" />
            </div>
            <span className="text-[10px] sm:text-base font-black">{t.practice}</span>

            {/* Tooltip */}
            <div className="absolute bottom-full right-0 mb-4 px-3 py-1.5 bg-slate-900 text-white text-[9px] rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none font-bold uppercase tracking-widest">
              {t.masterNow.replace('{word}', 
                (view === AppView.FLASHCARDS ? selectedFlashcardWord?.word : 
                 view === AppView.WORD_REVIEW ? selectedMnemonicForReview?.word : 
                 mnemonic?.word) || mnemonic?.word || selectedFlashcardWord?.word || savedMnemonics[0]?.data.word || ''
              )}
            </div>
          </motion.button>
        )}
      </AnimatePresence>

      {/* Bottom Navigation for Mobile */}
      {view !== AppView.AUTH && !isKeyboardOpen && (
        <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white/80 dark:bg-slate-950/80 backdrop-blur-2xl border-t border-gray-100 dark:border-slate-800/50 pb-safe pb-[env(safe-area-inset-bottom)]">
          <div className="max-w-md mx-auto flex items-center justify-around px-1 py-1">
            {[
              { id: AppView.HOME, icon: <Home size={22} />, label: t.navHome, tour: "home" },
              { id: AppView.SEARCH, icon: <Search size={22} />, label: t.navSearch, tour: "search" },
              { id: AppView.POSTS, icon: <MessageSquare size={22} />, label: t.navPosts, tour: "posts" },
              { id: AppView.FLASHCARDS, icon: <Layers size={22} />, label: t.navFlash, tour: "flashcards" },
              { id: AppView.DASHBOARD, icon: <LayoutDashboard size={22} />, label: t.navDash, tour: "dashboard" }
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => navigateTo(item.id)}
                data-tour={item.tour}
                className={`flex-1 flex flex-col items-center justify-center py-1 rounded-xl transition-all ${
                  view === item.id 
                    ? 'text-accent dark:text-accent' 
                    : 'text-gray-400 dark:text-gray-500'
                }`}
              >
                <div className={`p-1.5 rounded-xl transition-all ${view === item.id ? 'bg-accent/10 dark:bg-accent/20' : ''}`}>
                  {item.icon}
                </div>
                <span className={`text-[9px] font-bold mt-0 ${view === item.id ? 'opacity-100' : 'opacity-60'}`}>{item.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Modals */}
      <React.Suspense fallback={null}>
        <AnimatePresence>
          {state === AppState.VOICE_MODE && (
            <VoiceMode 
              onClose={() => setState(AppState.IDLE)} 
              uiLanguage={language} 
              contentLanguage={userProfile?.preferred_language || Language.UZBEK}
            />
          )}
          {showFeedback && (
            <FeedbackModal 
              onClose={() => setShowFeedback(false)} 
              language={language} 
              receiverEmail="khazratkulovshokhzod@gmail.com" 
            />
          )}
        </AnimatePresence>
      </React.Suspense>
    </div>
  );
}
