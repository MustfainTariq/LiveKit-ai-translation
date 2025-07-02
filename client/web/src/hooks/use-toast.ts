import { useState, useCallback } from 'react';

interface ToastOptions {
  title: string;
  description?: string;
  variant?: 'default' | 'destructive';
}

interface ToastItem extends ToastOptions {
  id: string;
}

// Global toast state
let globalToasts: ToastItem[] = [];
let globalSetToasts: ((toasts: ToastItem[]) => void) | null = null;

export function useToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  // Register this component's setter as the global one
  if (!globalSetToasts) {
    globalSetToasts = setToasts;
    globalToasts = toasts;
  }

  const toast = useCallback((options: ToastOptions) => {
    const id = Math.random().toString(36).substring(2, 9);
    const newToast: ToastItem = {
      id,
      ...options
    };

    console.log(`Toast: ${options.title}`, options.description);
    
    // Update global state
    globalToasts = [...globalToasts, newToast];
    if (globalSetToasts) {
      globalSetToasts(globalToasts);
    }
  }, []);

  const removeToast = useCallback((id: string) => {
    globalToasts = globalToasts.filter(toast => toast.id !== id);
    if (globalSetToasts) {
      globalSetToasts(globalToasts);
    }
  }, []);

  return { toast, toasts, removeToast };
} 