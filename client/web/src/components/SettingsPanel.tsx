import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';

interface SettingsPanelProps {
  backendUrl: string;
  customPrompt: string;
  onBackendUrlChange: (url: string) => void;
  onCustomPromptChange: (prompt: string) => void;
  onUpdatePrompt: () => void;
}

export default function SettingsPanel({
  backendUrl,
  customPrompt,
  onBackendUrlChange,
  onCustomPromptChange,
  onUpdatePrompt
}: SettingsPanelProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">STT/LLM Configuration</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* STT Settings */}
          <div className="space-y-3">
            <h3 className="font-semibold text-gray-700">STT Settings</h3>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="stt-punctuation"
                defaultChecked={true}
              />
              <Label htmlFor="stt-punctuation">STT Punctuation</Label>
            </div>
            <div className="space-y-2">
              <Label htmlFor="stt-delay">STT Max delay settings</Label>
              <Input
                id="stt-delay"
                type="number"
                defaultValue="2000"
                placeholder="2000"
              />
            </div>
          </div>

          {/* LLM Settings */}
          <div className="space-y-3">
            <h3 className="font-semibold text-gray-700">LLM Settings</h3>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="llm-context"
                defaultChecked={true}
              />
              <Label htmlFor="llm-context">Turn LLM context on and off</Label>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="backend-url">Backend URL</Label>
              <Input
                id="backend-url"
                value={backendUrl}
                onChange={(e) => onBackendUrlChange(e.target.value)}
                placeholder="ws://localhost:8000"
              />
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="translation-prompt">Update translation Prompt</Label>
          <textarea
            id="translation-prompt"
            className="w-full p-2 border rounded-md resize-none h-24"
            value={customPrompt}
            onChange={(e) => onCustomPromptChange(e.target.value)}
            placeholder="Enter translation prompt..."
          />
          <Button
            onClick={onUpdatePrompt}
            className="bg-blue-500 hover:bg-blue-600 text-white"
          >
            Update Prompt
          </Button>
        </div>
      </CardContent>
    </Card>
  );
} 