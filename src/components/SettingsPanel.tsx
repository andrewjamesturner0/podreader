import { useState, useEffect, useRef } from 'react';
import { useSettings } from '../hooks/useSettings';
import { stopLocalLlm, getLocalLlmStatus } from '../services/localLlmService';
import { stopLocalWhisper, getLocalWhisperStatus } from '../services/localWhisperService';
import LocalLlmSetup from './LocalLlmSetup';
import LocalWhisperSetup from './LocalWhisperSetup';
import './SettingsPanel.css';

export default function SettingsPanel() {
  const { settings, updateSetting, loaded } = useSettings();
  const [ollamaReady, setOllamaReady] = useState(false);
  const [whisperReady, setWhisperReady] = useState(false);
  const prevProviderRef = useRef(settings.provider);
  const prevTranscriptionProviderRef = useRef(settings.transcriptionProvider);

  // Check ollama readiness on mount when provider is already ollama
  useEffect(() => {
    if (settings.provider === 'ollama') {
      getLocalLlmStatus().then(s => setOllamaReady(s.modelReady)).catch(() => {});
    }
  }, [settings.provider]);

  // Check whisper readiness on mount when provider is already local
  useEffect(() => {
    if (settings.transcriptionProvider === 'local') {
      getLocalWhisperStatus().then(s => setWhisperReady(s.modelReady)).catch(() => {});
    }
  }, [settings.transcriptionProvider]);

  // Stop ollama when switching away from it
  useEffect(() => {
    if (prevProviderRef.current === 'ollama' && settings.provider !== 'ollama') {
      setOllamaReady(false);
      stopLocalLlm().catch(() => {});
    }
    prevProviderRef.current = settings.provider;
  }, [settings.provider]);

  // Stop whisper when switching away from local
  useEffect(() => {
    if (prevTranscriptionProviderRef.current === 'local' && settings.transcriptionProvider !== 'local') {
      setWhisperReady(false);
      stopLocalWhisper().catch(() => {});
    }
    prevTranscriptionProviderRef.current = settings.transcriptionProvider;
  }, [settings.transcriptionProvider]);

  // Health check: poll ollama status every 30s when ready
  useEffect(() => {
    if (!ollamaReady || settings.provider !== 'ollama') return;
    const id = setInterval(async () => {
      try {
        const s = await getLocalLlmStatus();
        if (!s.modelReady) setOllamaReady(false);
      } catch {
        setOllamaReady(false);
      }
    }, 30_000);
    return () => clearInterval(id);
  }, [ollamaReady, settings.provider]);

  // Health check: poll whisper status every 30s when ready
  useEffect(() => {
    if (!whisperReady || settings.transcriptionProvider !== 'local') return;
    const id = setInterval(async () => {
      try {
        const s = await getLocalWhisperStatus();
        if (!s.modelReady) setWhisperReady(false);
      } catch {
        setWhisperReady(false);
      }
    }, 30_000);
    return () => clearInterval(id);
  }, [whisperReady, settings.transcriptionProvider]);

  if (!loaded) return null;

  return (
    <div className="settings-panel">
      <h2>Settings</h2>
      {/* Fix #3: API keys are now configured server-side via environment variables */}
      <div className="settings-row" style={{ fontSize: '0.85rem', color: '#888', marginBottom: 12 }}>
        API keys (OpenAI, Anthropic) are configured on the server via environment variables.
      </div>
      <div className="settings-row">
        <label>Summary Provider</label>
        <select
          value={settings.provider}
          onChange={e => updateSetting('provider', e.target.value as 'openai' | 'anthropic' | 'ollama')}
        >
          <option value="openai">OpenAI (gpt-5-mini)</option>
          <option value="anthropic">Anthropic (claude-sonnet-4-5-20250929)</option>
          <option value="ollama">Local (qwen2.5:3b-instruct)</option>
        </select>
      </div>
      {settings.provider === 'ollama' && !ollamaReady && (
        <LocalLlmSetup onReady={() => setOllamaReady(true)} />
      )}
      <div className="settings-row">
        <label>Transcription Provider</label>
        <select
          value={settings.transcriptionProvider}
          onChange={e => updateSetting('transcriptionProvider', e.target.value as 'openai' | 'local')}
        >
          <option value="openai">OpenAI (whisper-1)</option>
          <option value="local">Local (whisper.cpp)</option>
        </select>
      </div>
      {settings.transcriptionProvider === 'local' && !whisperReady && (
        <LocalWhisperSetup onReady={() => setWhisperReady(true)} />
      )}
    </div>
  );
}
