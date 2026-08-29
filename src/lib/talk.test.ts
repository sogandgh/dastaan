import { vi, describe, it, expect, beforeEach } from 'vitest';
import { sendTalkMessage } from './talk';
import { apiFetch } from './api';

vi.mock('./api', () => ({
  apiFetch: vi.fn(),
  describeError: vi.fn(async () => 'failed'),
}));

beforeEach(() => {
  vi.mocked(apiFetch).mockReset();
});

describe('sendTalkMessage', () => {
  it('posts the audio as a data URL and returns the parsed result', async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      ok: true,
      json: async () => ({ transcript: 'hi', reply: 'hello!' }),
    } as Response);

    const blob = new Blob(['fake-audio'], { type: 'audio/webm' });
    const result = await sendTalkMessage(blob, 'fa');

    expect(result).toEqual({ transcript: 'hi', reply: 'hello!' });
    expect(apiFetch).toHaveBeenCalledTimes(1);
    const [path, options] = vi.mocked(apiFetch).mock.calls[0];
    expect(path).toBe('/api/talk');
    const body = JSON.parse(options!.body as string);
    expect(body.language).toBe('fa');
    expect(body.audio).toMatch(/^data:audio\/webm;base64,/);
  });

  it('throws a descriptive error when the request fails', async () => {
    vi.mocked(apiFetch).mockResolvedValue({ ok: false } as Response);
    const blob = new Blob(['x'], { type: 'audio/webm' });
    await expect(sendTalkMessage(blob, 'fa')).rejects.toThrow('failed');
  });
});
