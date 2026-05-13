
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { get, set, del } from 'idb-keyval';

export enum SyncOperation {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete'
}

export enum SyncTaskStatus {
  PENDING = 'pending',
  FAILED = 'failed'
}

export interface SyncTask {
  id: string;
  table: string;
  operation: SyncOperation;
  payload: any;
  timestamp: number;
  retries: number;
  status: SyncTaskStatus;
}

interface SyncContextType {
  isOnline: boolean;
  queueSize: number;
  enqueue: (table: string, operation: SyncOperation, payload: any) => Promise<void>;
  processQueue: () => Promise<void>;
}

const SyncContext = createContext<SyncContextType | undefined>(undefined);

const QUEUE_KEY = 'mnemonix_sync_queue';

export const SyncProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isOnline, setIsOnline] = useState(window.navigator.onLine);
  const [queue, setQueue] = useState<SyncTask[]>([]);

  const processQueue = useCallback(async () => {
    if (!window.navigator.onLine || queue.length === 0) return;

    const { supabase } = await import('../supabaseClient');
    
    // Sort tasks by timestamp to ensure correct ordering during sequential processing
    const sortedTasks = [...queue].sort((a, b) => a.timestamp - b.timestamp);
    const pendingTasks = sortedTasks.filter(t => t.status === SyncTaskStatus.PENDING);
    
    if (pendingTasks.length === 0) return;

    // BUCKET SYNC: Batch same operations on same tables
    const inserts = pendingTasks.filter(t => t.operation === SyncOperation.CREATE);
    const others = pendingTasks.filter(t => t.operation !== SyncOperation.CREATE);

    const tables = Array.from(new Set(inserts.map(t => t.table)));
    const processedIds = new Set<string>();
    const failedTasks: SyncTask[] = [];

    for (const table of tables) {
      const tableInserts = inserts.filter(t => t.table === table);
      const payloads = tableInserts.map(t => t.payload);
      
      try {
        // Use upsert to handle potential conflicts during batch insertion
        const { error } = await supabase.from(table).upsert(payloads, { onConflict: (table === 'user_words' ? 'user_id,word_id' : 'id') });
        if (error) {
          console.error(`Batch upsert failed for ${table}:`, error);
          // If batch fails, we retry individually marks them for individual retry in others
          tableInserts.forEach(t => others.push(t));
        } else {
          tableInserts.forEach(t => processedIds.add(t.id));
        }
      } catch (err) {
        tableInserts.forEach(t => others.push(t));
      }
    }

    // Process others (updates/deletes) individually in order
    for (const task of others) {
      if (processedIds.has(task.id)) continue;
      
      try {
        let error;
        if (task.operation === SyncOperation.UPDATE) {
          ({ error } = await supabase.from(task.table).update(task.payload.payload || task.payload).match(task.payload.query || { id: task.payload.id }));
        } else if (task.operation === SyncOperation.DELETE) {
          ({ error } = await supabase.from(task.table).delete().match(task.payload));
        } else if (task.operation === SyncOperation.CREATE) {
          // Fallback individual insert if batch failed
          ({ error } = await supabase.from(task.table).upsert(task.payload, { onConflict: (task.table === 'user_words' ? 'user_id,word_id' : 'id') }));
        }

        if (error) {
          if (task.retries < 5) {
            failedTasks.push({ ...task, retries: task.retries + 1 });
          } else {
            failedTasks.push({ ...task, status: SyncTaskStatus.FAILED });
          }
        } else {
          processedIds.add(task.id);
        }
      } catch (err) {
        if (task.retries < 5) {
          failedTasks.push({ ...task, retries: task.retries + 1 });
        } else {
          failedTasks.push({ ...task, status: SyncTaskStatus.FAILED });
        }
      }
    }

    // Update the master queue: remove processed, keep remaining/failed
    const nextQueue = [
      ...queue.filter(t => !processedIds.has(t.id) && !others.some(o => o.id === t.id)),
      ...failedTasks
    ];
    setQueue(nextQueue);
    await set(QUEUE_KEY, nextQueue);
  }, [queue]);

  const cleanupQueue = useCallback(async () => {
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000; // 7 days
    setQueue(prev => {
      const filtered = prev.filter(t => {
        if (t.status === SyncTaskStatus.FAILED && t.timestamp < cutoff) return false;
        return true;
      });
      if (filtered.length !== prev.length) {
        set(QUEUE_KEY, filtered);
      }
      return filtered;
    });
  }, []);

  // Initialize queue from IndexedDB
  useEffect(() => {
    const initQueue = async () => {
      const stored = await get<SyncTask[]>(QUEUE_KEY);
      if (stored) setQueue(stored);
      cleanupQueue();
    };
    initQueue();
  }, [cleanupQueue]);

  // Monitor connectivity
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      processQueue();
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [processQueue]);

  // Register service worker and background sync
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(err => console.error('SW registration failed:', err));
    }
  }, []);

  const triggerBackgroundSync = useCallback(async () => {
    if ('serviceWorker' in navigator && 'SyncManager' in window) {
      const reg = await navigator.serviceWorker.ready;
      try {
        await (reg as any).sync.register('mnemonix-sync');
      } catch (e) {
        console.warn('Background sync registration failed, falling back to foreground sync');
        processQueue();
      }
    } else {
      processQueue();
    }
  }, [processQueue]);

  const enqueue = useCallback(async (table: string, operation: SyncOperation, payload: any) => {
    const newTask: SyncTask = {
      id: crypto.randomUUID(),
      table,
      operation,
      payload,
      timestamp: Date.now(),
      retries: 0,
      status: SyncTaskStatus.PENDING
    };

    const updatedQueue = [...queue, newTask];
    setQueue(updatedQueue);
    await set(QUEUE_KEY, updatedQueue);

    if (isOnline) {
      triggerBackgroundSync();
    }
  }, [queue, isOnline, triggerBackgroundSync]);

  return (
    <SyncContext.Provider value={{ isOnline, queueSize: queue.length, enqueue, processQueue }}>
      {children}
    </SyncContext.Provider>
  );
};

export const useSync = () => {
  const context = useContext(SyncContext);
  if (!context) throw new Error('useSync must be used within a SyncProvider');
  return context;
};
