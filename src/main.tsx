
import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { PostProvider } from './context/PostContext';
import { SyncProvider } from './context/SyncContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient, setupPersistence } from './lib/query';

// Initialize persistence
setupPersistence();

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <SyncProvider>
          <PostProvider>
            <App />
          </PostProvider>
        </SyncProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
