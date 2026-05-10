
export const safeSetLocalStorage = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch (e) {
    if (e instanceof DOMException && (
      e.code === 22 || 
      e.code === 1014 || 
      e.name === 'QuotaExceededError' || 
      e.name === 'NS_ERROR_DOM_QUOTA_REACHED'
    )) {
      console.warn('LocalStorage quota exceeded. Attempting to clear old caches...');
      
      // Clear non-essential mnemonix caches
      const keysToClear = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        // Clear word caches and profile caches that are not the current one
        if (k && (k.startsWith('mnemonix_user_words_') || k.startsWith('mnemonix_user_profile_')) && k !== key) {
          keysToClear.push(k);
        }
      }
      
      keysToClear.forEach(k => localStorage.removeItem(k));
      
      // Try again
      try {
        localStorage.setItem(key, value);
      } catch (retryErr) {
        console.error('LocalStorage still full after clearing caches:', retryErr);
        // If still full, we just don't cache this item
      }
    } else {
      console.error('LocalStorage error:', e);
    }
  }
};
