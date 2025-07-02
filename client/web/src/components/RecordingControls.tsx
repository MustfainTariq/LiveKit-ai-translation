import React from 'react';
import { Button } from '@/components/ui/button';
import { Settings, Square, Mic } from 'react-feather';
import LanguageSelect from '@/components/controls/language-select';

interface RecordingControlsProps {
  isRecording: boolean;
  isConnected: boolean;
  selectedLanguage: string;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onClear: () => void;
  onToggleSettings: () => void;
  onLanguageChange: (language: string) => void;
}

export default function RecordingControls({
  isRecording,
  isConnected,
  selectedLanguage,
  onStartRecording,
  onStopRecording,
  onClear,
  onToggleSettings,
  onLanguageChange
}: RecordingControlsProps) {
  return (
    <div className="flex flex-col space-y-4">
      <div className="flex justify-center gap-4">
        <Button
          onClick={isRecording ? onStopRecording : onStartRecording}
          className={`px-8 py-3 text-lg font-semibold ${
            isRecording
              ? "bg-red-500 hover:bg-red-600 text-white"
              : "bg-green-500 hover:bg-green-600 text-white"
          }`}
        >
          {isRecording ? (
            <>
              <Square size={20} className="mr-2" />
              Stop
            </>
          ) : (
            <>
              <Mic size={20} className="mr-2" />
              Start
            </>
          )}
        </Button>

        <Button
          variant="outline"
          onClick={onClear}
          className="px-6 py-3"
        >
          Clear
        </Button>

        <Button
          variant="outline"
          onClick={onToggleSettings}
          className="flex items-center gap-2"
        >
          <Settings size={16} />
          Settings
        </Button>
      </div>

      <div className="flex justify-center items-center gap-2">
        <span className="text-sm font-medium">Language:</span>
        <LanguageSelect />
      </div>
    </div>
  );
} 