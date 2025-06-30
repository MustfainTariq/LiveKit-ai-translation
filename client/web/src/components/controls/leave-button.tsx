import { useRoomContext } from "@livekit/components-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { X } from "react-feather";
import { usePartyState } from "@/hooks/usePartyState";
import { useState } from "react";

export default function LeaveButton() {
  const room = useRoomContext();
  const router = useRouter();
  const { dispatch } = usePartyState();
  const [isLeaving, setIsLeaving] = useState(false);

  const onClose = async () => {
    if (isLeaving) return; // Prevent multiple clicks
    
    try {
      setIsLeaving(true);
      console.log("Leave button clicked - starting disconnect process");
      
      // Update state first to prevent reconnection attempts
      dispatch({ type: "SET_SHOULD_CONNECT", payload: false });
      
      // Check if room is actually connected before trying to disconnect
      if (room.state === "connected" || room.state === "connecting") {
        console.log(`Room state: ${room.state}, disconnecting...`);
        await room.disconnect();
        console.log("Room disconnected successfully");
      } else {
        console.log(`Room not connected (state: ${room.state}), skipping disconnect`);
      }
      
      // Navigate away
      router.push("/");
    } catch (error) {
      console.error("Error during disconnect:", error);
      // Still navigate away even if disconnect fails
      router.push("/");
    } finally {
      setIsLeaving(false);
    }
  };

  return (
    <Button
      variant="outline"
      className="bg-red-600 flex items-center justify-center hover:bg-red-400"
      onClick={onClose}
      disabled={isLeaving}
    >
      <X size={16} className="text-white" />
    </Button>
  );
}
