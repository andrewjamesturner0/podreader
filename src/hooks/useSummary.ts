import { useState, useCallback, useEffect, useRef } from 'react';
import { getTranscript, saveTranscript, getSummary, saveSummary } from '../services/dataApi';
import { transcribeEpisode } from '../services/transcriptionService';
import { transcribeYouTube } from '../services/youtubeService';
import { summariseTranscript } from '../services/summarisationService';
import { useSettings } from './useSettings';
import type { Transcript, Summary } from '../types';

type Stage = 'idle' | 'transcribing' | 'summarising';

export function useSummary(episodeId: string | null, audioUrl: string | null, onStatusChange?: () => void) {
  const { settings } = useSettings();
  const onStatusChangeRef = useRef(onStatusChange);
  onStatusChangeRef.current = onStatusChange;

  const [stage, setStage] = useState<Stage>('idle');
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<Transcript | null>(null);
  const [summary, setSummaryState] = useState<Summary | null>(null);

  // Clear state when episode changes
  useEffect(() => {
    setTranscript(null);
    setSummaryState(null);
    setError(null);
    setStage('idle');
  }, [episodeId]);

  const loadCached = useCallback(async () => {
    if (!episodeId) return;
    const t = await getTranscript(episodeId);
    setTranscript(t || null);
    const s = await getSummary(episodeId);
    setSummaryState(s || null);
  }, [episodeId]);

  const runTranscription = useCallback(async () => {
    if (!episodeId || !audioUrl) return;
    setStage('transcribing');
    setError(null);
    try {
      const isYouTube = episodeId.startsWith('yt:');
      let text: string;
      let model: string;

      if (isYouTube) {
        const result = await transcribeYouTube(audioUrl, settings.transcriptionProvider);
        text = result.transcript;
        model = result.source === 'captions' ? 'youtube-captions' : (settings.transcriptionProvider === 'local' ? 'whisper.cpp-base.en' : 'whisper-1');
      } else {
        // Fix #3: No longer passing API keys from frontend
        text = await transcribeEpisode(audioUrl, settings.transcriptionProvider);
        model = settings.transcriptionProvider === 'local' ? 'whisper.cpp-base.en' : 'whisper-1';
      }

      const t: Transcript = { episodeId, text, createdAt: Date.now(), model };
      await saveTranscript(t);
      setTranscript(t);
      onStatusChangeRef.current?.();
      return t;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Transcription failed');
      return null;
    } finally {
      setStage('idle');
    }
  }, [episodeId, audioUrl, settings.transcriptionProvider]);

  const runSummarisation = useCallback(async (transcriptText?: string) => {
    if (!episodeId) return;
    const text = transcriptText || transcript?.text;
    if (!text) {
      setError('No transcript available');
      return;
    }
    setStage('summarising');
    setError(null);
    try {
      // Fix #3: No longer passing API keys from frontend
      const md = await summariseTranscript({
        transcript: text,
        provider: settings.provider,
      });
      const s: Summary = {
        episodeId,
        markdown: md,
        provider: settings.provider,
        model: settings.provider === 'openai' ? 'gpt-5-mini' : settings.provider === 'ollama' ? 'qwen2.5:3b-instruct' : 'claude-sonnet-4-5-20250929',
        createdAt: Date.now(),
      };
      await saveSummary(s);
      setSummaryState(s);
      onStatusChangeRef.current?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Summarisation failed');
    } finally {
      setStage('idle');
    }
  }, [episodeId, transcript, settings]);

  const runPipeline = useCallback(async () => {
    if (!episodeId || !audioUrl) return;
    // Check cached transcript first
    let t = await getTranscript(episodeId);
    if (!t) {
      t = (await runTranscription()) ?? undefined;
    } else {
      setTranscript(t);
    }
    if (!t) return;
    // Check cached summary
    const s = await getSummary(episodeId);
    if (s) {
      setSummaryState(s);
      return;
    }
    await runSummarisation(t.text);
  }, [episodeId, audioUrl, runTranscription, runSummarisation]);

  return {
    stage,
    error,
    transcript,
    summary,
    loadCached,
    runTranscription,
    runSummarisation,
    runPipeline,
  };
}
