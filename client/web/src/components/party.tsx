"use client";

import React, { useState, useRef, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import ConnectionStatus from './ConnectionStatus';
import RecordingControls from './RecordingControls';
import FileUploadSection from './FileUploadSection';
import SettingsPanel from './SettingsPanel';
import TranscriptionDisplay from './TranscriptionDisplay';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useAudioFile } from '@/hooks/useAudioFile';
import { usePartyState } from "@/hooks/usePartyState";
import { TokenResult } from "@/app/api/token/route";
import {
  useRoomContext,
  useParticipants,
} from "@livekit/components-react";
import { ConnectionState } from "livekit-client";
import { Button } from '@/components/ui/button';
import { Mic, MicOff } from 'lucide-react';

const DEFAULT_PROMPT = `You are an expert Arabic-to-English translator. Translate the following Arabic text to English. Only provide the English translation, without any additional commentary or explanations.

Arabic text: {text}

English translation:`;

// Generate a random party ID
function generatePartyId(): string {
  return Math.random().toString(36).substring(2, 10).toUpperCase();
}

export default function Party() {
  const [selectedLanguage, setSelectedLanguage] = useState('nl');
  const [customPrompt, setCustomPrompt] = useState(DEFAULT_PROMPT);
  const [showSettings, setShowSettings] = useState(false);
  const [backendUrl, setBackendUrl] = useState('ws://localhost:8765');
  const [isUploading, setIsUploading] = useState(false);
  const [isStarted, setIsStarted] = useState(false);
  const [partyId, setPartyId] = useState<string>('');
  const [isMuted, setIsMuted] = useState(false);
  
  const audioRef = useRef<HTMLAudioElement>(null);
  const { toast } = useToast();
  const { state, dispatch } = usePartyState();

  const room = useRoomContext();
  const participants = useParticipants();
  
  const { data, setData, isConnected, connectionError, disconnect } = useWebSocket(backendUrl);
  const { selectedFile, audioFileInfo, setAudioFileInfo, handleFileSelect } = useAudioFile();

  // LiveKit connection status
  const livekitConnected = room.state === ConnectionState.Connected;

  // Generate party ID on component mount
  useEffect(() => {
    if (!partyId) {
      const newPartyId = generatePartyId();
      setPartyId(newPartyId);
      console.log(`Generated Party ID: ${newPartyId}`);
    }
  }, [partyId]);

  // Handle microphone mute/unmute
  const handleMicToggle = async () => {
    try {
      const newMutedState = !isMuted;
      await room.localParticipant.setMicrophoneEnabled(!newMutedState);
      setIsMuted(newMutedState);
      
      toast({
        title: newMutedState ? "Microphone Muted" : "Microphone Unmuted",
        description: newMutedState ? "You are now muted" : "You are now unmuted",
      });
    } catch (error) {
      console.error('Error toggling microphone:', error);
      toast({
        title: "Microphone Error",
        description: "Failed to toggle microphone",
        variant: "destructive",
      });
    }
  };

  // Improved stop functionality
  const handleStopRecording = async () => {
    try {
      console.log("🛑 Stopping recording and disconnecting...");
      
      // 1. Disable microphone
      if (room.localParticipant) {
        await room.localParticipant.setMicrophoneEnabled(false);
      }
      
      // 2. Disconnect from LiveKit room
      if (room.state === ConnectionState.Connected) {
        await room.disconnect();
        console.log("✅ Disconnected from LiveKit room");
      }
      
      // 3. Disconnect from WebSocket backend if available
      if (disconnect && isConnected) {
        disconnect();
        console.log("✅ Disconnected from WebSocket backend");
      }
      
      // 4. Reset all states
      setIsStarted(false);
      setIsMuted(true);
      dispatch({ type: "SET_SHOULD_CONNECT", payload: false });
      dispatch({ type: "SET_TOKEN", payload: "" });
      
      // 5. Clear transcription data
      setData({
        transcript: '',
        partial_transcript: '',
        dutch_translation: '',
        is_recording: false
      });
      
      toast({
        title: "Recording Stopped",
        description: "Disconnected from room and backend successfully",
      });
      
    } catch (error) {
      console.error('❌ Error stopping recording:', error);
      toast({
        title: "Stop Error",
        description: "Failed to stop recording properly",
        variant: "destructive",
      });
    }
  };

  const handleStartRecording = async () => {
    if (isStarted) {
      // Use the improved stop function
      await handleStopRecording();
      return;
    }

    try {
      // Check environment variables
      console.log("🔍 Environment Check:");
      console.log("NEXT_PUBLIC_LIVEKIT_URL:", process.env.NEXT_PUBLIC_LIVEKIT_URL);

      if (!process.env.NEXT_PUBLIC_LIVEKIT_URL) {
        toast({
          title: "Configuration Error",
          description: "NEXT_PUBLIC_LIVEKIT_URL is not set in .env.local",
          variant: "destructive",
        });
        return;
      }

      // Show starting toast
      toast({
        title: "Creating Room",
        description: `Creating room with Party ID: ${partyId}`,
      });

      // Fetch the token from the /api/token endpoint
      console.log("🎫 Fetching token...");
      const response = await fetch(
        `/api/token?party_id=${partyId}&name=imam&host=true`
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error("❌ Token fetch failed:", response.status, errorText);
        toast({
          title: "Token Error",
          description: `Failed to get access token: ${response.status}`,
          variant: "destructive",
        });
        return;
      }

      const tokenData = (await response.json()) as TokenResult;
      console.log("✅ Token received");

      dispatch({ type: "SET_TOKEN", payload: tokenData.token });
      dispatch({ type: "SET_SERVER_URL", payload: tokenData.serverUrl });
      dispatch({ type: "SET_IS_HOST", payload: true });
      dispatch({ type: "SET_SHOULD_CONNECT", payload: true });
      
      setIsStarted(true);
      
      toast({
        title: "Joining Room",
        description: `Connecting to LiveKit room: ${partyId}`,
      });

      // Enable microphone after connection
      setTimeout(() => {
        room.localParticipant.setMicrophoneEnabled(true).then(() => {
          console.log("✅ Microphone enabled successfully");
          setIsMuted(false);
          toast({
            title: "Recording Started",
            description: `Room ${partyId} active - Speaking Arabic will be transcribed and translated`,
          });
        }).catch((error) => {
          console.error("❌ Failed to enable microphone:", error);
          toast({
            title: "Microphone Error",
            description: "Failed to enable microphone. Please check permissions.",
            variant: "destructive",
          });
        });
      }, 3000);
      
    } catch (error) {
      console.error("❌ Start Error:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      toast({
        title: "Connection Error",
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  const handleClear = async () => {
    try {
      setData({
        transcript: '',
        partial_transcript: '',
        dutch_translation: '',
        is_recording: false
      });
      
      toast({
        title: "Cleared",
        description: "Transcription and translation cleared",
      });
    } catch (error) {
      console.error('Error clearing:', error);
      toast({
        title: "Error",
        description: "Failed to clear data",
        variant: "destructive",
      });
    }
  };

  const handleUpdatePrompt = async () => {
    try {
      // For now, just update local state
      // TODO: Send prompt to backend when HTTP endpoints are available
      
      toast({
        title: "Success",
        description: "Translation prompt updated successfully",
      });
    } catch (error) {
      console.error('Error updating prompt:', error);
      toast({
        title: "Error",
        description: "Failed to update prompt",
        variant: "destructive",
      });
    }
  };

  const handleFileSelectEvent = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleAudioPlay = () => {
    if (audioRef.current && audioFileInfo) {
      audioRef.current.play();
      setAudioFileInfo(prev => prev ? { ...prev, isPlaying: true } : null);
    }
  };

  const handleAudioPause = () => {
    if (audioRef.current && audioFileInfo) {
      audioRef.current.pause();
      setAudioFileInfo(prev => prev ? { ...prev, isPlaying: false } : null);
    }
  };

  const handleAudioTimeUpdate = () => {
    if (audioRef.current && audioFileInfo) {
      setAudioFileInfo(prev => prev ? { 
        ...prev, 
        currentTime: audioRef.current?.currentTime || 0 
      } : null);
    }
  };

  const handleFileUpload = async () => {
    if (!selectedFile) {
      toast({
        title: "No File Selected",
        description: "Please select an audio file first",
        variant: "destructive",
      });
      return;
    }

    // For now, just show a message since file upload endpoints aren't implemented yet
    toast({
      title: "File Upload",
      description: "File upload feature will be available when backend endpoints are implemented",
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-teal-50 p-4 relative">
      {/* Party ID - Top Left Corner */}
      {partyId && (
        <div className="absolute top-4 left-4 bg-white rounded-lg border border-emerald-200 shadow-md p-3 z-10">
          <div className="text-xs text-gray-500 uppercase tracking-wide">Room ID</div>
          <div className="text-sm font-mono font-bold text-emerald-700">{partyId}</div>
        </div>
      )}

      {/* Microphone Toggle - Top Right Corner */}
      {isStarted && (
        <div className="absolute top-4 right-4 z-10">
          <Button
            onClick={handleMicToggle}
            variant={isMuted ? "destructive" : "default"}
            size="sm"
            className="flex items-center gap-2"
          >
            {isMuted ? <MicOff size={16} /> : <Mic size={16} />}
            {isMuted ? "Unmute" : "Mute"}
          </Button>
        </div>
      )}

      <div className="max-w-4xl mx-auto space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold text-emerald-800">Jamaa</h1>
          <p className="text-emerald-600">Real-time Khutba Translation</p>
          
          {/* Connection Status with Error Details */}
          <div className="space-y-1">
            <ConnectionStatus isConnected={isConnected && livekitConnected} />
            {connectionError && (
              <div className="text-xs text-red-500">
                Backend: {connectionError}
              </div>
            )}
            {livekitConnected && (
              <div className="text-xs text-green-600">
                LiveKit: Connected to room
              </div>
            )}
            {!livekitConnected && isStarted && (
              <div className="text-xs text-yellow-600">
                LiveKit: Connecting to room...
              </div>
            )}
          </div>
        </div>

        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col space-y-4">
              <RecordingControls
                isRecording={isStarted && livekitConnected}
                isConnected={livekitConnected}
                selectedLanguage={selectedLanguage}
                onStartRecording={handleStartRecording}
                onStopRecording={handleStopRecording}
                onClear={handleClear}
                onToggleSettings={() => setShowSettings(!showSettings)}
                onLanguageChange={setSelectedLanguage}
              />

              <Separator />

              <FileUploadSection
                selectedFile={selectedFile}
                isUploading={isUploading}
                isConnected={isConnected}
                audioFileInfo={audioFileInfo}
                onFileSelect={handleFileSelectEvent}
                onFileUpload={handleFileUpload}
                onAudioPlay={handleAudioPlay}
                onAudioPause={handleAudioPause}
                onAudioTimeUpdate={handleAudioTimeUpdate}
                audioRef={audioRef}
              />
            </div>
          </CardContent>
        </Card>

        {showSettings && (
          <SettingsPanel
            backendUrl={backendUrl}
            customPrompt={customPrompt}
            onBackendUrlChange={setBackendUrl}
            onCustomPromptChange={setCustomPrompt}
            onUpdatePrompt={handleUpdatePrompt}
          />
        )}

        <TranscriptionDisplay
          transcript={data.transcript}
          partialTranscript={data.partial_transcript}
          translation={data.dutch_translation}
        />

        
      </div>
    </div>
  );
}
