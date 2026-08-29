import { useRef, useState } from 'react';

export function useRecorder(maxDurationMs = 12000) {
  const [recording, setRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function start(onDone: (blob: Blob) => void): Promise<void> {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = stream;
    chunksRef.current = [];
    const recorder = new MediaRecorder(stream);
    recorder.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    recorder.onstop = () => {
      if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
      streamRef.current?.getTracks().forEach(t => t.stop());
      streamRef.current = null;
      setRecording(false);
      onDone(blob);
    };
    mediaRecorderRef.current = recorder;
    recorder.start();
    setRecording(true);
    timeoutRef.current = setTimeout(() => stop(), maxDurationMs);
  }

  function stop() {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
  }

  return { recording, start, stop };
}
