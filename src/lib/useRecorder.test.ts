import { renderHook, act, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { useRecorder } from './useRecorder';

class FakeMediaRecorder {
  static instances: FakeMediaRecorder[] = [];
  state: 'inactive' | 'recording' = 'inactive';
  mimeType = 'audio/webm';
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;

  stream: MediaStream;

  constructor(stream: MediaStream) {
    this.stream = stream;
    FakeMediaRecorder.instances.push(this);
  }

  start() {
    this.state = 'recording';
  }

  stop() {
    this.state = 'inactive';
    this.ondataavailable?.({ data: new Blob(['clip'], { type: 'audio/webm' }) });
    this.onstop?.();
  }
}

beforeEach(() => {
  FakeMediaRecorder.instances = [];
  vi.stubGlobal('MediaRecorder', FakeMediaRecorder);
  const fakeTrack = { stop: vi.fn() };
  vi.stubGlobal('navigator', {
    mediaDevices: {
      getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [fakeTrack] }),
    },
  });
});

describe('useRecorder', () => {
  it('sets recording to true after start and calls onDone with a blob on stop', async () => {
    const { result } = renderHook(() => useRecorder(50000));
    const onDone = vi.fn();

    await act(async () => {
      await result.current.start(onDone);
    });
    expect(result.current.recording).toBe(true);

    act(() => {
      result.current.stop();
    });

    await waitFor(() => expect(result.current.recording).toBe(false));
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onDone.mock.calls[0][0]).toBeInstanceOf(Blob);
  });

  it('auto-stops after the max duration and still calls onDone', async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useRecorder(1000));
    const onDone = vi.fn();

    await act(async () => {
      await result.current.start(onDone);
    });

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(onDone).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
