import React from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Upload, Play, Pause } from 'react-feather';

interface AudioFileInfo {
  name: string;
  duration: number;
  currentTime: number;
  isPlaying: boolean;
  isProcessing: boolean;
}

interface FileUploadSectionProps {
  selectedFile: File | null;
  isUploading: boolean;
  isConnected: boolean;
  audioFileInfo: AudioFileInfo | null;
  onFileSelect: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onFileUpload: () => void;
  onAudioPlay: () => void;
  onAudioPause: () => void;
  onAudioTimeUpdate: () => void;
  audioRef: React.RefObject<HTMLAudioElement>;
}

export default function FileUploadSection({
  selectedFile,
  isUploading,
  isConnected,
  audioFileInfo,
  onFileSelect,
  onFileUpload,
  onAudioPlay,
  onAudioPause,
  onAudioTimeUpdate,
  audioRef
}: FileUploadSectionProps) {
  return (
    <div className="space-y-4">
      <div className="flex justify-center items-center gap-4">
        <div className="flex items-center gap-2">
          {/* <Label className="font-medium">Name:</Label>
          <span className="px-3 py-1 bg-white rounded-md border font-medium text-gray-700">
            imam
          </span> */}
        </div>
        
        <div className="flex items-center gap-2">
          <input
            type="file"
            id="file-upload"
            className="hidden"
            onChange={onFileSelect}
            accept=".mp3,.wav,.m4a,.mp4,.mpeg,.mpga,.webm"
          />
          <Button
            variant="outline"
            onClick={() => document.getElementById('file-upload')?.click()}
            className="flex items-center gap-2"
          >
            <Upload size={16} />
            Choose file
          </Button>
          <span className="text-sm text-gray-500">
            {selectedFile ? selectedFile.name : "No file chosen"}
          </span>
        </div>
      </div>

      {selectedFile && (
        <div className="flex justify-center">
          <Button
            onClick={onFileUpload}
            disabled={!isConnected || isUploading}
            className="bg-blue-500 hover:bg-blue-600 text-white"
          >
            {isUploading ? "Uploading..." : "Upload & Process"}
          </Button>
        </div>
      )}

      {audioFileInfo && (
        <div className="bg-gray-50 p-4 rounded-lg space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-medium text-gray-700">{audioFileInfo.name}</span>
            <span className="text-sm text-gray-500">
              {Math.floor(audioFileInfo.currentTime)}s / {Math.floor(audioFileInfo.duration)}s
            </span>
          </div>
          
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={audioFileInfo.isPlaying ? onAudioPause : onAudioPlay}
            >
              {audioFileInfo.isPlaying ? <Pause size={16} /> : <Play size={16} />}
            </Button>
            
            <div className="flex-1 bg-gray-200 rounded-full h-2">
              <div
                className="bg-blue-500 h-2 rounded-full transition-all"
                style={{
                  width: `${(audioFileInfo.currentTime / audioFileInfo.duration) * 100}%`
                }}
              />
            </div>
          </div>

          {audioFileInfo.isProcessing && (
            <div className="text-center text-sm text-blue-600">
              Processing audio file...
            </div>
          )}
        </div>
      )}

      <audio
        ref={audioRef}
        onTimeUpdate={onAudioTimeUpdate}
        onLoadedMetadata={() => {
          if (audioRef.current) {
            // Update duration when metadata loads
            console.log('Audio duration:', audioRef.current.duration);
          }
        }}
        className="hidden"
      />
    </div>
  );
} 