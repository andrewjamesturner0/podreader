import { useState, useEffect, useRef, useCallback } from 'react';
import { getLocalWhisperStatus, startLocalWhisperSetup, LocalWhisperStatus } from '../services/localWhisperService';

interface Props {
  onReady: () => void;
}

const phaseLabels: Record<string, string> = {
  idle: 'Not started',
  'downloading-binary': 'Downloading whisper.cpp...',
  'downloading-model': 'Downloading speech model',
  starting: 'Starting transcription server...',
  ready: 'Ready',
  error: 'Setup failed',
};

export default function LocalWhisperSetup({ onReady }: Props) {
  const [status, setStatus] = useState<LocalWhisperStatus | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const failCountRef = useRef(0);

  const poll = useCallback(async () => {
    try {
      const s = await getLocalWhisperStatus();
      failCountRef.current = 0;
      setStatus(s);
      if (s.modelReady) {
        onReady();
      }
    } catch (err) {
      failCountRef.current++;
      if (failCountRef.current >= 3) {
        const msg = err instanceof Error ? err.message : 'Unable to reach server';
        setStatus(prev => prev
          ? { ...prev, setupPhase: 'error', error: msg }
          : { installed: false, running: false, modelReady: false, setupPhase: 'error', error: msg, model: '' }
        );
      }
    }
  }, [onReady]);

  useEffect(() => {
    poll();
    intervalRef.current = setInterval(poll, 2000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [poll]);

  const handleSetup = async () => {
    try {
      await startLocalWhisperSetup();
    } catch {
      // error will show via polling
    }
  };

  if (!status) return <div className="local-whisper-setup">Checking local whisper status...</div>;

  if (status.modelReady) return null;

  const phase = status.setupPhase;
  const label = phase === 'downloading-model' && status.downloadProgress != null
    ? `${phaseLabels['downloading-model']} (${status.downloadProgress}%)...`
    : phaseLabels[phase] || phase;

  const isWorking = phase === 'downloading-binary' || phase === 'downloading-model' || phase === 'starting';
  const isError = phase === 'error';
  const isCrashed = !isWorking && !isError && !status.modelReady && (phase === 'ready' || phase === 'idle');

  return (
    <div className="local-whisper-setup" style={{ marginTop: 12, padding: 12, border: '1px solid #444', borderRadius: 6 }}>
      <div style={{ marginBottom: 8, fontWeight: 'bold' }}>Local Whisper Setup</div>
      <div style={{ marginBottom: 8 }}>{label}</div>
      {status.error && (
        <div style={{ color: '#e55', marginBottom: 8, fontSize: '0.85rem' }}>{status.error}</div>
      )}
      {isCrashed && (
        <button onClick={handleSetup}>Restart</button>
      )}
      {(!isWorking && !isCrashed) && (
        <button onClick={handleSetup}>
          {isError ? 'Retry' : 'Start Setup'}
        </button>
      )}
      {isWorking && (
        <div style={{ fontSize: '0.85rem', color: '#888' }}>Please wait...</div>
      )}
    </div>
  );
}
