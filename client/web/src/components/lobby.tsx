import { useState } from "react";
import { usePartyState } from "@/hooks/usePartyState";
import { TokenResult } from "@/app/api/token/route";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CheckedState } from "@radix-ui/react-checkbox";

interface LobbyProps {
  partyId: string;
}

export default function Lobby({ partyId }: LobbyProps) {
  const [name, setName] = useState<string>("");
  const [isHost, setIsHost] = useState<boolean>(false);
  const { dispatch } = usePartyState();

  const onJoin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault(); // Prevent the default form submission behavior

    try {
      // Debug: Check environment variables
      console.log("🔍 Environment Check:");
      console.log("NEXT_PUBLIC_LIVEKIT_URL:", process.env.NEXT_PUBLIC_LIVEKIT_URL);
      console.log("Has LIVEKIT_API_KEY:", !!process.env.LIVEKIT_API_KEY);
      console.log("Has LIVEKIT_API_SECRET:", !!process.env.LIVEKIT_API_SECRET);

      if (!process.env.NEXT_PUBLIC_LIVEKIT_URL) {
        throw new Error("❌ NEXT_PUBLIC_LIVEKIT_URL is not set in .env.local");
      }

      // Fetch the token from the /api/token endpoint
      console.log("🎫 Fetching token...");
      const response = await fetch(
        `/api/token?party_id=${encodeURIComponent(
          partyId
        )}&name=${encodeURIComponent(name)}&host=${isHost}`
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error("❌ Token fetch failed:", response.status, errorText);
        throw new Error(`Failed to fetch token: ${response.status}`);
      }

      const data = (await response.json()) as TokenResult;
      console.log("✅ Token received:");
      console.log("Server URL:", data.serverUrl);
      console.log("Identity:", data.identity);

      dispatch({ type: "SET_TOKEN", payload: data.token });
      dispatch({ type: "SET_SERVER_URL", payload: data.serverUrl });
      dispatch({ type: "SET_IS_HOST", payload: isHost });
      dispatch({ type: "SET_SHOULD_CONNECT", payload: true });
      
      console.log("🚀 Attempting to connect to LiveKit...");
    } catch (error) {
      console.error("❌ Join Error:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      alert(`Connection Error: ${errorMessage}\n\nCheck console for details.`);
    }
  };

  return (
    <div className="w-full h-full flex items-center justify-center">
      <Card>
        <form action="#" onSubmit={onJoin}>
          <CardHeader>
            <CardTitle>Join Party</CardTitle>
            <CardDescription>
              Join or create a party to chat or listen in
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col space-y-4">
            <div className="flex flex-col space-y-1.5">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                placeholder="Your display name in the party"
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="items-top flex space-x-2">
              <Checkbox
                id="host"
                checked={isHost}
                onCheckedChange={(checked: CheckedState) =>
                  setIsHost(checked === "indeterminate" ? false : checked)
                }
              />
              <div className="grid gap-1.5 leading-none">
                <label
                  htmlFor="host"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  Party host
                </label>
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex justify-center">
            <Button className="w-full">Join</Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
