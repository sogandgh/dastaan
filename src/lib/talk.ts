import { apiFetch, describeError } from './api';

export type TalkResult = {
  transcript: string;
  reply: string;
};

export async function sendTalkMessage(audioBlob: Blob, language: string): Promise<TalkResult> {
  const audio = await blobToDataUrl(audioBlob);
  const res = await apiFetch('/api/talk', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ audio, language }),
  });
  if (!res.ok) throw new Error(await describeError(res));
  return res.json();
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
