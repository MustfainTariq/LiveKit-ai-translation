import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';

interface STTSettings {
  max_delay: number;
  punctuation_overrides: number;
}

interface LLMSettings {
  context_enabled: boolean;
  context_sentences: number;
  custom_prompt: string;
}

interface AppSettings {
  stt: STTSettings;
  llm: LLMSettings;
}

interface SettingsPanelProps {
  backendUrl: string;
  onBackendUrlChange: (url: string) => void;
}

const DEFAULT_SETTINGS: AppSettings = {
  stt: {
    max_delay: 5.0,
    punctuation_overrides: 0.3
  },
  llm: {
    context_enabled: true,
    context_sentences: 10,
    custom_prompt: ""
  }
};

const DEFAULT_PROMPT = `You are an expert Arabic-to-{language} translator. Translate the following Arabic text to {language}. Only provide the {language} translation, without any additional commentary or explanations.

Arabic text: {text}

{language} translation:`;

export default function SettingsPanel({
  backendUrl,
  onBackendUrlChange
}: SettingsPanelProps) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

  // Load settings on component mount
  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('http://localhost:8080/api/settings');
      if (response.ok) {
        const data = await response.json();
        setSettings(data);
        toast({
          title: "Settings Loaded",
          description: "Settings loaded successfully from backend",
        });
      } else {
        throw new Error(`HTTP ${response.status}`);
      }
    } catch (error) {
      console.error('Error loading settings:', error);
      toast({
        title: "Load Error",
        description: "Could not load settings from backend, using defaults",
        variant: "destructive",
      });
      setSettings(DEFAULT_SETTINGS);
    } finally {
      setIsLoading(false);
    }
  };

  const saveSettings = async () => {
    setIsSaving(true);
    try {
      const response = await fetch('http://localhost:8080/api/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(settings),
      });

      if (response.ok) {
        const result = await response.json();
        toast({
          title: "Settings Saved",
          description: "Settings updated successfully",
        });
      } else {
        throw new Error(`HTTP ${response.status}`);
      }
    } catch (error) {
      console.error('Error saving settings:', error);
      toast({
        title: "Save Error",
        description: "Failed to save settings",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const resetToDefaults = () => {
    setSettings(DEFAULT_SETTINGS);
    toast({
      title: "Reset to Defaults",
      description: "Settings reset to default values",
    });
  };

  const setDefaultPrompt = () => {
    setSettings(prev => ({
      ...prev,
      llm: {
        ...prev.llm,
        custom_prompt: DEFAULT_PROMPT
      }
    }));
    toast({
      title: "Default Prompt Set",
      description: "Translation prompt set to default template",
    });
  };

  const updateSTTSetting = (key: keyof STTSettings, value: number) => {
    setSettings(prev => ({
      ...prev,
      stt: {
        ...prev.stt,
        [key]: value
      }
    }));
  };

  const updateLLMSetting = (key: keyof LLMSettings, value: any) => {
    setSettings(prev => ({
      ...prev,
      llm: {
        ...prev.llm,
        [key]: value
      }
    }));
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center">Loading settings...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">STT/LLM Configuration</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* STT Settings */}
          <div className="space-y-4">
            <h3 className="font-semibold text-gray-700">STT Settings</h3>
            
            <div className="space-y-2">
              <Label htmlFor="punctuation-sensitivity">
                Punctuation Sensitivity (0.0 - 1.0)
              </Label>
              <Input
                id="punctuation-sensitivity"
                type="number"
                min="0"
                max="1"
                step="0.1"
                value={settings.stt.punctuation_overrides}
                onChange={(e) => updateSTTSetting('punctuation_overrides', parseFloat(e.target.value) || 0)}
                placeholder="0.3"
              />
              <div className="text-xs text-gray-500">
                Default: 0.3 - Controls how sensitive punctuation detection is
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="max-delay">
                Max Delay (seconds)
              </Label>
              <Input
                id="max-delay"
                type="number"
                min="1"
                max="30"
                step="0.5"
                value={settings.stt.max_delay}
                onChange={(e) => updateSTTSetting('max_delay', parseFloat(e.target.value) || 5.0)}
                placeholder="5.0"
              />
              <div className="text-xs text-gray-500">
                Default: 5.0 - Maximum delay before transcription is finalized
              </div>
            </div>
          </div>

          {/* LLM Settings */}
          <div className="space-y-4">
            <h3 className="font-semibold text-gray-700">LLM Settings</h3>
            
            <div className="flex items-center space-x-2">
              <Checkbox
                id="llm-context"
                checked={settings.llm.context_enabled}
                onCheckedChange={(checked) => updateLLMSetting('context_enabled', checked)}
              />
              <Label htmlFor="llm-context">Enable LLM Context</Label>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="context-sentences">
                Context Sentences ({settings.llm.context_enabled ? 'Active' : 'Disabled'})
              </Label>
              <Input
                id="context-sentences"
                type="number"
                min="1"
                max="50"
                value={settings.llm.context_sentences}
                onChange={(e) => updateLLMSetting('context_sentences', parseInt(e.target.value) || 10)}
                disabled={!settings.llm.context_enabled}
                placeholder="10"
              />
              <div className="text-xs text-gray-500">
                Default: 10 - Number of previous sentence pairs to remember for context
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="backend-url">Backend WebSocket URL</Label>
              <Input
                id="backend-url"
                value={backendUrl}
                onChange={(e) => onBackendUrlChange(e.target.value)}
                placeholder="ws://localhost:8765"
              />
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label htmlFor="translation-prompt">Custom Translation Prompt</Label>
            <Button
              onClick={setDefaultPrompt}
              variant="outline"
              size="sm"
            >
              Use Default Template
            </Button>
          </div>
          <textarea
            id="translation-prompt"
            className="w-full p-3 border rounded-md resize-none h-32 font-mono text-sm"
            value={settings.llm.custom_prompt}
            onChange={(e) => updateLLMSetting('custom_prompt', e.target.value)}
            placeholder="Enter custom translation prompt... Use {language} and {text} as placeholders"
          />
          <div className="text-xs text-gray-500">
            Use placeholders: {"{language}"} for target language, {"{text}"} for Arabic text to translate
          </div>
        </div>

        <div className="flex flex-wrap gap-3 pt-4 border-t">
          <Button
            onClick={saveSettings}
            disabled={isSaving}
            className="bg-green-500 hover:bg-green-600 text-white"
          >
            {isSaving ? "Saving..." : "Save Settings"}
          </Button>
          
          <Button
            onClick={loadSettings}
            variant="outline"
            disabled={isLoading}
          >
            {isLoading ? "Loading..." : "Reload from Backend"}
          </Button>
          
          <Button
            onClick={resetToDefaults}
            variant="outline"
          >
            Reset to Defaults
          </Button>
        </div>

        <div className="text-xs text-gray-500 pt-2 border-t">
          <strong>Note:</strong> Changes take effect when you save settings. The backend will use these settings for new transcription sessions.
        </div>
      </CardContent>
    </Card>
  );
} 