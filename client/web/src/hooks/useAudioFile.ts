import { useState } from 'react';

interface AudioFileInfo {
  name: string;
  duration: number;
  currentTime: number;
  isPlaying: boolean;
  isProcessing: boolean;
}

export function useAudioFile() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [audioFileInfo, setAudioFileInfo] = useState<AudioFileInfo | null>(null);

  const handleFileSelect = (file: File) => {
    setSelectedFile(file);
    
    // Prevent Audio object creation during SSR
    if (typeof window === 'undefined') {
      return;
    }
    
    // Create audio file info
    const audio = new Audio();
    const objectUrl = URL.createObjectURL(file);
    audio.src = objectUrl;
    
    audio.addEventListener('loadedmetadata', () => {
      setAudioFileInfo({
        name: file.name,
        duration: audio.duration,
        currentTime: 0,
        isPlaying: false,
        isProcessing: false
      });
      
      // Clean up object URL
      URL.revokeObjectURL(objectUrl);
    });
  };

  return {
    selectedFile,
    audioFileInfo,
    setAudioFileInfo,
    handleFileSelect
  };
} 