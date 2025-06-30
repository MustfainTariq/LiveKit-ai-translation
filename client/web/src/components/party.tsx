"use client";

import {
  useRoomContext,
  useParticipants,
  RoomAudioRenderer,
} from "@livekit/components-react";
import { Participant, ConnectionState, DisconnectReason } from "livekit-client";
import { Headphones } from "react-feather";
import HostControls from "@/components/host-controls";
import ListenerControls from "@/components/listener-controls";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import CircleVisualizer from "./circle-visualizer";
import { usePartyState } from "@/hooks/usePartyState";
import Captions from "@/components/captions";

export default function Party() {
  const [host, setHost] = useState<Participant | undefined>();
  const [connectionState, setConnectionState] = useState<ConnectionState>(ConnectionState.Disconnected);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  const room = useRoomContext();
  const participants = useParticipants();
  const { state } = usePartyState();

  // Monitor connection state
  useEffect(() => {
    const handleConnectionStateChanged = (connectionState: ConnectionState) => {
      console.log(`Room connection state changed: ${connectionState}`);
      setConnectionState(connectionState);
      
      if (connectionState === "connected") {
        setConnectionError(null);
        console.log("Successfully connected to room");
        
        // Handle microphone based on participant identity  
        console.log("🔍 Participant details:", {
          identity: room.localParticipant.identity,
          permissions: room.localParticipant.permissions,
          canPublish: room.localParticipant.permissions?.canPublish,
          isHost: state.isHost
        });
        
        if (state.isHost || room.localParticipant.permissions?.canPublish) {
          console.log("🎤 Auto-enabling microphone for host...");
          room.localParticipant.setMicrophoneEnabled(true).then(() => {
            console.log("✅ Microphone enabled successfully for host");
          }).catch((error) => {
            console.error("❌ Failed to enable microphone:", error);
          });
        } else {
          console.log("🔇 Disabling microphone for listener (transcription reception only)");
          room.localParticipant.setMicrophoneEnabled(false).catch((error) => {
            console.error("❌ Failed to disable microphone:", error);
          });
        }
      } else if (connectionState === "disconnected") {
        console.log("Disconnected from room");
      } else if (connectionState === "reconnecting") {
        console.log("Attempting to reconnect...");
      }
    };

    const handleDisconnected = (reason?: DisconnectReason) => {
      const reasonString = reason ? DisconnectReason[reason] : "Unknown";
      console.log(`Room disconnected, reason: ${reasonString}`);
      setConnectionError(reasonString + " disconnection");
    };

    const handleReconnected = () => {
      console.log("Room reconnected successfully");
      setConnectionError(null);
    };

    const handleReconnecting = () => {
      console.log("Room reconnecting...");
      setConnectionError("Reconnecting...");
    };

    room.on("connectionStateChanged", handleConnectionStateChanged);
    room.on("disconnected", handleDisconnected);  
    room.on("reconnected", handleReconnected);
    room.on("reconnecting", handleReconnecting);

    // Set initial state
    setConnectionState(room.state);

    return () => {
      room.off("connectionStateChanged", handleConnectionStateChanged);
      room.off("disconnected", handleDisconnected);
      room.off("reconnected", handleReconnected);
      room.off("reconnecting", handleReconnecting);
    };
  }, [room]);

  useEffect(() => {
    const host = participants.find((p) => {
      return p.permissions?.canPublish;
    });
    if (host) {
      console.log(`Host found: ${host.identity}`);
      console.log("Host microphone enabled:", host.isMicrophoneEnabled);
      console.log("Host audio tracks:", host.audioTrackPublications.size);
      
      // Debug audio track publications
      host.audioTrackPublications.forEach((pub, key) => {
        console.log(`Audio track ${key}:`, {
          isSubscribed: pub.isSubscribed,
          isMuted: pub.isMuted,
          track: pub.track?.kind
        });
      });
      
      setHost(host);
    } else {
      console.log("No host found in participants");
    }
  }, [participants]);

  return (
    <div className="w-full h-full p-8 flex flex-col relative">
      <div className="flex flex-col justify-between h-full w-full">
        <div className="flex justify-between">
          <div className="flex flex-col">
            <p>Listening Party</p>
            <h1 className="font-bold">Billie Eilish</h1>
            {/* Connection status indicator */}
            <div className="flex items-center gap-2 mt-1">
              <div className={`w-2 h-2 rounded-full ${
                connectionState === ConnectionState.Connected ? "bg-green-500" :
                connectionState === ConnectionState.Connecting ? "bg-yellow-500 animate-pulse" :
                connectionState === ConnectionState.Reconnecting ? "bg-orange-500 animate-pulse" :
                "bg-red-500"
              }`} />
              <span className="text-xs text-gray-600">
                {connectionState === ConnectionState.Connected ? "Connected" :
                 connectionState === ConnectionState.Connecting ? "Connecting..." :
                 connectionState === ConnectionState.Reconnecting ? "Reconnecting..." :
                 "Disconnected"}
              </span>
            </div>
            {connectionError && (
              <p className="text-xs text-red-500 mt-1">{connectionError}</p>
            )}
          </div>
          <div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="uppercase bg-[#E71A32] font-bold text-white"
              >
                Live
              </Button>
              <Button variant="outline">
                <Headphones />
                <p>{participants.length}</p>
              </Button>
            </div>
          </div>
        </div>
        {host === room.localParticipant ? (
          <HostControls />
        ) : (
          <ListenerControls />
        )}
      </div>
      <div className="absolute top-[50%] left-[50%] translate-x-[-50%] translate-y-[-50%]">
        {host && (
          <div className="flex flex-col items-center relative gap-24">
            {/* Visualizer Container */}
            <div className="relative flex items-center justify-center w-[125px] h-[125px]">
              <CircleVisualizer speaker={host} />
            </div>

            {/* Transcript */}
            <Captions />
          </div>
        )}
      </div>
      {/* <RoomAudioRenderer /> */}
    </div>
  );
}
