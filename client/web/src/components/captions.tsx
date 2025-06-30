import { useRoomContext } from "@livekit/components-react";
import { useState, useEffect } from "react";
import {
  TranscriptionSegment,
  RoomEvent,
  TrackPublication,
  Participant,
} from "livekit-client";
import { usePartyState } from "@/hooks/usePartyState";

export default function Captions() {
  const room = useRoomContext();
  const { state } = usePartyState();
  const [transcriptions, setTranscriptions] = useState<{
    [language: string]: {
      [id: string]: TranscriptionSegment;
    };
  }>({});
  
  // Buffer for building complete sentences
  const [sentenceBuffers, setSentenceBuffers] = useState<{
    [language: string]: string;
  }>({});

  useEffect(() => {
    console.log("🎯 CAPTIONS COMPONENT MOUNTED:", {
      isHost: state.isHost,
      captionsEnabled: state.captionsEnabled,
      captionsLanguage: state.captionsLanguage,
      roomState: room.state
    });

    const updateTranscriptions = (
      segments: TranscriptionSegment[],
      participant?: Participant,
      publication?: TrackPublication
    ) => {
      console.log("🎤 TRANSCRIPTION RECEIVED:", {
        segmentCount: segments.length,
        segments: segments.map(s => ({ language: s.language, text: s.text, id: s.id })),
        participant: participant?.identity,
        publication: publication?.trackSid,
        localParticipant: room.localParticipant.identity,
        isHost: state.isHost
      });

      setTranscriptions((prev) => {
        // Create a copy of the previous state
        const newTranscriptions = { ...prev };

        for (const segment of segments) {
          // Extract the language and id from the segment
          let { language, id } = segment;

          if (language === "") {
            language = "ar";  // Default to Arabic as that's our source language
          }

          console.log(`📝 Adding segment: "${segment.text}" (${language})`);

          // Ensure the language group exists
          if (!newTranscriptions[language]) {
            newTranscriptions[language] = {};
          }

          // Update or add the transcription segment in the correct group
          newTranscriptions[language][id] = segment;
        }

        console.log("📊 Current transcriptions state:", newTranscriptions);
        return newTranscriptions;
      });

      // Update sentence buffers for smoother display
      setSentenceBuffers((prev) => {
        const newBuffers = { ...prev };
        
        for (const segment of segments) {
          let { language, text } = segment;
          if (language === "") language = "ar";  // Default to Arabic as that's our source language
          
          // Build complete sentences by accumulating text
          if (!newBuffers[language]) {
            newBuffers[language] = text;
          } else {
            // Check if this looks like a continuation or new sentence
            const trimmedText = text.trim();
            const currentBuffer = newBuffers[language].trim();
            
            if (trimmedText.endsWith('.') || trimmedText.endsWith('?') || trimmedText.endsWith('!')) {
              // Complete sentence - replace buffer
              newBuffers[language] = trimmedText;
            } else if (currentBuffer.length === 0 || trimmedText.length > currentBuffer.length) {
              // Growing sentence - update buffer
              newBuffers[language] = trimmedText;
            }
          }
        }
        
        return newBuffers;
      });
    };

    // Subscribe to transcription events
    console.log("🔗 Subscribing to transcription events for:", room.localParticipant.identity);
    console.log("🔍 Room state:", room.state);
    console.log("🔍 Room participants:", room.remoteParticipants.size);
    
    // Force enable transcription reception with enhanced debugging
    try {
      console.log("🎯 Setting up transcription reception...");
      console.log("🔍 Room details:", {
        state: room.state,
        localParticipant: room.localParticipant.identity,
        localPermissions: room.localParticipant.permissions,
        remoteParticipants: Array.from(room.remoteParticipants.values()).map(p => ({
          identity: p.identity,
          permissions: p.permissions
        }))
      });
      
      // Subscribe to transcription events  
      room.on(RoomEvent.TranscriptionReceived, updateTranscriptions);
      console.log("✅ Transcription event listener added");
      
      // Additional debugging for data events (optional)
      console.log("🔍 Setting up data event monitoring...");
      
      // Try to force enable transcription if possible
      if (room.state === "connected") {
        console.log("📡 Room connected - attempting to ensure transcription reception");
        
        // Check if there are any remote participants publishing audio
        const audioPublishers = Array.from(room.remoteParticipants.values()).filter(p => 
          Array.from(p.audioTrackPublications.values()).some(pub => pub.isSubscribed && !pub.isMuted)
        );
        console.log("🎵 Audio publishers found:", audioPublishers.map(p => p.identity));
        
        if (audioPublishers.length === 0) {
          console.warn("⚠️ No audio publishers found - transcriptions may not work until someone speaks");
        }
      }
    } catch (error) {
      console.error("❌ Failed to setup transcription subscription:", error);
    }
    
    // Enhanced debugging for connection issues
    const onConnected = () => {
      console.log("📡 Room connected - transcription events should now work");
      console.log("📡 Local participant:", room.localParticipant.identity);
      console.log("📡 Remote participants:", Array.from(room.remoteParticipants.values()).map(p => p.identity));
    };
    
    const onDisconnected = () => {
      console.log("📡 Room disconnected - transcription events stopped");
    };

    const onParticipantConnected = (participant: any) => {
      console.log("👤 Participant connected:", participant.identity);
    };

    const onParticipantDisconnected = (participant: any) => {
      console.log("👤 Participant disconnected:", participant.identity);
    };
    
    room.on(RoomEvent.Connected, onConnected);
    room.on(RoomEvent.Disconnected, onDisconnected);
    room.on(RoomEvent.ParticipantConnected, onParticipantConnected);
    room.on(RoomEvent.ParticipantDisconnected, onParticipantDisconnected);
    
    return () => {
      console.log("🔗 Unsubscribing from transcription events for:", room.localParticipant.identity);
      room.off(RoomEvent.TranscriptionReceived, updateTranscriptions);
      room.off(RoomEvent.Connected, onConnected);
      room.off(RoomEvent.Disconnected, onDisconnected);
      room.off(RoomEvent.ParticipantConnected, onParticipantConnected);
      room.off(RoomEvent.ParticipantDisconnected, onParticipantDisconnected);

    };
  }, [room, state.isHost, state.captionsLanguage]);

  // Get current sentences from buffers (more fluid display)
  const sourceSentence = sentenceBuffers["ar"] || "";  // Arabic as source language
  const translationSentence = sentenceBuffers[state.captionsLanguage] || "";

  // Fallback to segments if buffers are empty
  const sourceTranscriptions = transcriptions["ar"] || {};  // Arabic as source language
  const sourceSegments = Object.values(sourceTranscriptions)
    .sort((a, b) => a.firstReceivedTime - b.firstReceivedTime)
    .slice(-2);

  const currentLanguageTranscriptions = transcriptions[state.captionsLanguage] || {};
  const transcriptionSegments = Object.values(currentLanguageTranscriptions)
    .sort((a, b) => a.firstReceivedTime - b.firstReceivedTime)
    .slice(-2);

  // Use buffered sentences or fallback to latest segments
  const displaySource = sourceSentence || (sourceSegments.length > 0 ? sourceSegments[sourceSegments.length - 1].text : "");
  const displayTranslation = translationSentence || (transcriptionSegments.length > 0 ? transcriptionSegments[transcriptionSegments.length - 1].text : "");

  // Debug logging
  if (displaySource || displayTranslation) {
    console.log("📺 DISPLAYING:", {
      source: displaySource,
      translation: displayTranslation,
      language: state.captionsLanguage
    });
  }

  return (
    <div
      className={`text-center space-y-12 w-full max-w-6xl ${
        state.captionsEnabled ? "visible" : "invisible"
      }`}
    >


      {/* Source Language Transcription (Clean, Simple) */}
      <div className="text-center">
        <h3 className="text-lg font-semibold text-gray-700 mb-6">🎤 Live Arabic Transcription</h3>
        <div className="min-h-[3rem] flex items-center justify-center">
          {displaySource ? (
            <p className="text-black text-4xl font-medium leading-relaxed text-center" dir="rtl">
              {displaySource}
            </p>
          ) : (
            <p className="text-gray-500 italic text-2xl">Waiting for Arabic transcriptions...</p>
          )}
        </div>
      </div>

      {/* Translation (Clean, Simple) */}
      {state.captionsLanguage !== "ar" && (
        <div className="text-center border-t border-gray-200 pt-8">
          <h3 className="text-lg font-semibold text-gray-700 mb-6">
            🌐 Translation ({state.captionsLanguage.toUpperCase()})
          </h3>
          <div className="min-h-[3rem] flex items-center justify-center">
            {displayTranslation ? (
              <p className="text-black text-5xl font-semibold leading-relaxed text-center">
                {displayTranslation}
              </p>
            ) : (
              <p className="text-gray-500 italic text-2xl text-center">
                {Object.keys(transcriptions).length > 0 
                  ? "Waiting for translations..." 
                  : "Select a language to see translations!"}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Instructions */}
      {!state.isHost && state.captionsLanguage === "ar" && Object.keys(transcriptions).length === 0 && (
        <div className="text-center p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-blue-800 text-lg">
            💡 Select a language from the dropdown below to see real-time translations!
          </p>
        </div>
      )}


    </div>
  );
}
