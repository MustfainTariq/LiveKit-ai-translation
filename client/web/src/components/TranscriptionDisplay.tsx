import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Mic } from 'react-feather';

interface TranscriptionDisplayProps {
  transcript: string;
  partialTranscript: string;
  translation: string;
}

export default function TranscriptionDisplay({
  transcript,
  partialTranscript,
  translation
}: TranscriptionDisplayProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* Transcription */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Mic size={18} />
            Transcription
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="min-h-[200px] p-4 bg-gray-50 rounded-md space-y-2">
            {transcript && (
              <div className="text-gray-800 whitespace-pre-wrap">
                {transcript}
              </div>
            )}
            {partialTranscript && (
              <div className="text-gray-500 italic whitespace-pre-wrap">
                {partialTranscript}
              </div>
            )}
            {!transcript && !partialTranscript && (
              <div className="text-gray-400 italic">
                Transcription will appear here...
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Translation */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            🌐 Translation
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="min-h-[200px] p-4 bg-gray-50 rounded-md">
            {translation ? (
              <div className="text-gray-800 whitespace-pre-wrap">
                {translation}
              </div>
            ) : (
              <div className="text-gray-400 italic">
                Translation will appear here...
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
} 