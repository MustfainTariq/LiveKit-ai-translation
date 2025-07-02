import { useState, useEffect, useRef, useCallback } from 'react';

interface WebSocketData {
  transcript: string;
  partial_transcript: string;
  dutch_translation: string;
  is_recording: boolean;
}

export function useWebSocket(url: string) {
  const [data, setData] = useState<WebSocketData>({
    transcript: '',
    partial_transcript: '',
    dutch_translation: '',
    is_recording: false
  });
  
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;

  // Manual disconnect function
  const disconnect = useCallback(() => {
    console.log('Manually disconnecting WebSocket...');
    
    // Clear any pending reconnection attempts
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    
    // Reset reconnect attempts to prevent auto-reconnection
    reconnectAttempts.current = maxReconnectAttempts;
    
    // Close the WebSocket connection if it exists
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    
    // Update connection state
    setIsConnected(false);
    setConnectionError(null);
  }, []);

  useEffect(() => {
    // Prevent WebSocket connection during SSR
    if (typeof window === 'undefined') {
      return;
    }

    const connectWebSocket = () => {
      try {
        console.log(`Attempting to connect to WebSocket: ${url}`);
        wsRef.current = new WebSocket(url);
        
        wsRef.current.onopen = () => {
          console.log('WebSocket connected successfully');
          setIsConnected(true);
          setConnectionError(null);
          reconnectAttempts.current = 0;
        };
        
        wsRef.current.onmessage = (event) => {
          try {
            const newData = JSON.parse(event.data);
            console.log('Received WebSocket data:', newData);
            
            // Handle different message types from the backend
            if (newData.type === 'transcription') {
              setData(prevData => ({
                ...prevData,
                transcript: newData.text || '',
              }));
            } else if (newData.type === 'translation') {
              setData(prevData => ({
                ...prevData,
                dutch_translation: newData.text || '',
              }));
            } else {
              // Handle legacy format
              setData(prevData => ({
                ...prevData,
                ...newData
              }));
            }
          } catch (error) {
            console.error('Error parsing WebSocket message:', error);
          }
        };
        
        wsRef.current.onclose = (event) => {
          console.log('WebSocket disconnected', event.code, event.reason);
          setIsConnected(false);
          
          // Only attempt to reconnect if we haven't exceeded max attempts
          if (reconnectAttempts.current < maxReconnectAttempts) {
            reconnectAttempts.current++;
            const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 10000);
            console.log(`Attempting to reconnect in ${delay}ms (attempt ${reconnectAttempts.current}/${maxReconnectAttempts})`);
            
            setConnectionError(`Reconnecting... (${reconnectAttempts.current}/${maxReconnectAttempts})`);
            
            reconnectTimeoutRef.current = setTimeout(() => {
              connectWebSocket();
            }, delay);
          } else {
            setConnectionError('Failed to connect to backend after multiple attempts');
            console.error('Max reconnection attempts reached');
          }
        };
        
        // wsRef.current.onerror = (error) => {
        //   console.error('WebSocket error:', error);
        //   setIsConnected(false);
        //   setConnectionError('WebSocket connection error');
        // };
      } catch (error) {
        console.error('Error creating WebSocket:', error);
        setIsConnected(false);
        setConnectionError('Failed to create WebSocket connection');
      }
    };

    // Initial connection attempt with a small delay to ensure backend is ready
    const initialTimeout = setTimeout(() => {
      connectWebSocket();
    }, 1000);

    return () => {
      if (initialTimeout) {
        clearTimeout(initialTimeout);
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [url]);

  return { data, setData, isConnected, connectionError, disconnect };
} 