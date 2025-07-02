"use client";

import React, { useReducer, useState, useEffect } from "react";
import { LiveKitRoom } from "@livekit/components-react";
import Party from "@/components/party";
import { State, reducer, PartyStateContext } from "@/hooks/usePartyState";
import { Toaster } from "@/components/ui/toast";
import { useToast } from "@/hooks/use-toast";

// Initial state - set host to true and name to imam by default
const initialState: State = {
  token: undefined,
  serverUrl: "",
  shouldConnect: false,
  captionsEnabled: true,
  captionsLanguage: "nl",  // Default to English as first translation target language (Arabic is source)
  isHost: true,  // Always host
};

export default function Home() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [isMounted, setIsMounted] = useState(false);
  const { toasts, removeToast } = useToast();
  const partyId = "main-session"; // Fixed party ID

  // Prevent hydration mismatch by only rendering on client
  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-teal-50 flex items-center justify-center">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold text-emerald-800">Jamaa</h1>
          <p className="text-emerald-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <PartyStateContext.Provider value={{ state, dispatch }}>
        <LiveKitRoom
          token={state.token}
          serverUrl={state.serverUrl}
          connect={state.shouldConnect}
          audio={false}  // Prevent automatic audio publishing
          video={false}  // No video needed
          className="w-full h-full"
          options={{
            // Essential connection options
            disconnectOnPageLeave: true,
            // Ensure all participants can receive transcriptions  
            adaptiveStream: true,
          }}
          onError={(error) => {
            console.error("🚨 LiveKit Room Error:", error);
            console.error("Error details:", {
              message: error.message,
              name: error.name,
              stack: error.stack,
            });
            
            if (error.message?.includes("negotiation") || error.message?.includes("timeout")) {
              console.error("❌ WebRTC negotiation failed! Common causes:");
              console.error("1. Missing .env.local file in client/web/");
              console.error("2. Wrong NEXT_PUBLIC_LIVEKIT_URL in .env.local");
              console.error("3. API key mismatch between server and client");
              console.error("4. Network/firewall blocking WebRTC");
              console.error("5. LiveKit server region issues");
            }
            
            if (error.message?.includes("websocket")) {
              console.error("❌ WebSocket connection failed!");
              console.error("Check if LiveKit server URL is correct:", process.env.NEXT_PUBLIC_LIVEKIT_URL);
            }
          }}
          onConnected={() => {
            console.log("Successfully connected to LiveKit room");
          }}
          onDisconnected={(reason) => {
            console.log("Disconnected from LiveKit room:", reason);
          }}
        >
          <Party />
        </LiveKitRoom>
      </PartyStateContext.Provider>
      
      {/* Global Toast Notifications */}
      <Toaster toasts={toasts} onClose={removeToast} />
    </>
  );
}
