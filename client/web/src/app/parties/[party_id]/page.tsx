"use client";

import React, { useReducer, use } from "react";
import { LiveKitRoom, RoomAudioRenderer } from "@livekit/components-react";
import Party from "@/components/party";
import Lobby from "@/components/lobby";
import { State, reducer, PartyStateContext } from "@/hooks/usePartyState";

type PartyIdType = { party_id: string };

type PartyPageProps = {
  params: Promise<PartyIdType>;
};

// Initial state
const initialState: State = {
  token: undefined,
  serverUrl: "",
  shouldConnect: false,
  captionsEnabled: true,
  captionsLanguage: "en",  // Default to English as first translation target language (Arabic is source)
  isHost: false,
};

// PartyPage component
export default function PartyPage({ params }: PartyPageProps) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const { party_id } = use<PartyIdType>(params);

  return (
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
          
          // Handle permission errors for non-host participants
          if (error.message?.includes("insufficient permissions")) {
            console.log("ℹ️ Permission error - this is expected for non-host participants");
            console.log("Non-host participants cannot publish audio, only receive transcriptions");
            return; // Don't show error for expected permission issues
          }
          
          if (error.message?.includes("negotiation") || error.message?.includes("timeout")) {
            console.error("❌ WebRTC negotiation failed! Common causes:");
            console.error("1. Missing .env.local file in client/web/");
            console.error("2. Wrong NEXT_PUBLIC_LIVEKIT_URL in .env.local");
            console.error("3. API key mismatch between server and client");
            console.error("4. Network/firewall blocking WebRTC");
            console.error("5. LiveKit server region issues");
            
            // Show user-friendly error
            alert("❌ Connection Failed!\n\n" +
                  "WebRTC negotiation timed out.\n" +
                  "This usually means missing environment variables.\n\n" +
                  "Check browser console for details.");
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
        {state.shouldConnect ? <Party /> : <Lobby partyId={party_id} />}
      </LiveKitRoom>
    </PartyStateContext.Provider>
  );
}
