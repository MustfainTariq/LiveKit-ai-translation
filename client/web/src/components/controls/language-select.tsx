import React, { useState, useEffect } from "react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useRoomContext, useVoiceAssistant } from "@livekit/components-react";
import { usePartyState } from "@/hooks/usePartyState";
import { ConnectionState } from "livekit-client";

interface Language {
  code: string;
  name: string;
  flag: string;
}

const LanguageSelect = () => {
  const room = useRoomContext();
  const { agent } = useVoiceAssistant();
  const { state, dispatch } = usePartyState();
  const [languages, setLanguages] = useState<Language[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleChange = async (value: string) => {
    try {
      console.log(`🌐 Changing language selection to: ${value}`);
      
      dispatch({
        type: "SET_CAPTIONS_LANGUAGE",
        payload: value,
      });

      // Check if room is connected before setting attributes
      if (room.state === ConnectionState.Connected) {
        await room.localParticipant.setAttributes({
          captions_language: value,
        });
        console.log(`✅ Successfully set captions_language attribute to: ${value}`);
        
        // Verify attribute was set by checking current attributes
        setTimeout(() => {
          const currentAttributes = room.localParticipant.attributes;
          console.log(`🔍 Current participant attributes:`, currentAttributes);
          if (currentAttributes.captions_language === value) {
            console.log(`✅ Attribute verified: captions_language = ${value}`);
          } else {
            console.error(`❌ Attribute verification failed: expected ${value}, got ${currentAttributes.captions_language}`);
          }
        }, 1000);
      } else {
        console.warn(`⚠️ Cannot set attributes - room not connected (state: ${room.state})`);
      }
    } catch (error) {
      console.error("❌ Error changing language:", error);
    }
  };

  useEffect(() => {
    async function getLanguages() {
      if (!agent) {
        console.log("No agent found, skipping language fetch");
        return;
      }

      if (room.state !== ConnectionState.Connected) {
        console.log(`Room not connected (state: ${room.state}), waiting to fetch languages`);
        return;
      }

      setIsLoading(true);
      setError(null);
      
      try {
        console.log("Fetching available languages from agent...");
        const response = await room.localParticipant.performRpc({
          destinationIdentity: "agent",
          method: "get/languages",
          payload: "",
        });
        const languages = JSON.parse(response);
        console.log("Received languages:", languages);
        setLanguages(languages);
      } catch (error) {
        console.error("RPC call failed: ", error);
        setError("Failed to fetch languages");
        
        // Fallback to default languages if RPC fails
        const fallbackLanguages = [
          { code: "en", name: "English", flag: "🇺🇸" },
          { code: "es", name: "Spanish", flag: "🇪🇸" },
          { code: "fr", name: "French", flag: "🇫🇷" },
          { code: "de", name: "German", flag: "🇩🇪" },
          { code: "ja", name: "Japanese", flag: "🇯🇵" },
        ];
        console.log("Using fallback languages:", fallbackLanguages);
        setLanguages(fallbackLanguages);
      } finally {
        setIsLoading(false);
      }
    }

    getLanguages();
  }, [room, agent, room.state]);

  const debugConnection = () => {
    console.log("🐛 DEBUG CONNECTION INFO:");
    console.log("Room state:", room.state);
    console.log("Local participant:", room.localParticipant.identity);
    console.log("Local participant attributes:", room.localParticipant.attributes);
    console.log("Remote participants:", Array.from(room.remoteParticipants.values()).map(p => ({ 
      identity: p.identity, 
      attributes: p.attributes 
    })));
    console.log("Agent participant:", room.remoteParticipants.get("agent"));
    console.log("Selected language:", state.captionsLanguage);
  };

  return (
    <div className="flex items-center gap-2">
      <Select
        value={state.captionsLanguage}
        onValueChange={handleChange}
        disabled={!state.captionsEnabled || isLoading}
      >
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder={isLoading ? "Loading..." : "Captions language"} />
        </SelectTrigger>
        <SelectContent>
          {languages.map((lang) => (
            <SelectItem key={lang.code} value={lang.code}>
              {lang.flag} {lang.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error && (
        <span className="ml-2 text-xs text-red-500" title={error}>⚠️</span>
      )}
      {process.env.NODE_ENV === 'development' && (
        <button 
          onClick={debugConnection}
          className="ml-2 px-2 py-1 text-xs bg-gray-600 text-white rounded hover:bg-gray-500"
          title="Debug connection info"
        >
          🐛
        </button>
      )}
    </div>
  );
};

export default LanguageSelect;
