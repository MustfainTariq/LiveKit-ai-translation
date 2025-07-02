import React from 'react';

interface ConnectionStatusProps {
  isConnected: boolean;
}

export default function ConnectionStatus({ isConnected }: ConnectionStatusProps) {
  return (
    <div className="flex items-center justify-center gap-2">
      <div className={`w-2 h-2 rounded-full ${
        isConnected ? "bg-green-500" : "bg-red-500"
      }`} />
      <span className="text-sm text-gray-600">
        {isConnected ? "Connected" : "Disconnected"}
      </span>
    </div>
  );
} 