import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { expect, test, vi, beforeEach } from 'vitest';
import Terminal from '../components/Terminal';
import * as tauri from '@tauri-apps/api/tauri';
import * as event from '@tauri-apps/api/event';

// 모킹 정의
vi.mock('@tauri-apps/api/tauri', () => ({
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(),
  emit: vi.fn(),
}));

vi.mock('xterm', () => ({
  Terminal: vi.fn().mockImplementation(function() {
    return {
      open: vi.fn(),
      loadAddon: vi.fn(),
      writeln: vi.fn(),
      write: vi.fn(),
      onData: vi.fn().mockReturnValue({ dispose: vi.fn() }),
      dispose: vi.fn(),
    };
  }),
}));

vi.mock('xterm-addon-fit', () => ({
  FitAddon: vi.fn().mockImplementation(function() {
    return { fit: vi.fn() };
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

test('Terminal (Overlay) component starts session on mount', async () => {
  const podId = 'default/nginx-pod';
  vi.mocked(tauri.invoke).mockResolvedValue('sid-overlay-123');

  render(<Terminal podId={podId} type="exec" onClose={vi.fn()} />);

  // start_exec 호출 확인
  await waitFor(() => {
    expect(tauri.invoke).toHaveBeenCalledWith('start_exec', expect.objectContaining({
      namespace: 'default',
      podName: 'nginx-pod'
    }));
  });

  // 세션 ID 기반 리슨 확인
  await waitFor(() => {
    expect(event.listen).toHaveBeenCalledWith('exec-output:sid-overlay-123', expect.any(Function));
  });
});

test('Terminal (Overlay) component cleans up on close', async () => {
  const podId = 'default/nginx-pod';
  vi.mocked(tauri.invoke).mockResolvedValue('sid-cleanup-456');

  const { unmount } = render(<Terminal podId={podId} type="exec" onClose={vi.fn()} />);

  await waitFor(() => {
    expect(tauri.invoke).toHaveBeenCalledWith('start_exec', expect.any(Object));
  });

  unmount();

  // stop_session 호출 확인
  expect(tauri.invoke).toHaveBeenCalledWith('stop_session', expect.objectContaining({
    sessionId: 'sid-cleanup-456'
  }));
});
