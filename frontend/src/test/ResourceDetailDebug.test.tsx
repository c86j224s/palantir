import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { expect, test, vi, beforeEach } from 'vitest';
import ResourceDetail from '../components/ResourceDetail';
import * as tauri from '@tauri-apps/api/tauri';
import { toast } from 'sonner';

// 모킹 정의
vi.mock('@tauri-apps/api/tauri', () => ({
  invoke: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    info: vi.fn(),
    promise: vi.fn().mockImplementation((promise) => promise),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

test('ResourceDetail shows Debug Session tab only for Pods', async () => {
  const podResource = {
    name: 'test-pod',
    definition: { label: 'Pods', kind: 'Pod', group: '', version: 'v1', icon: null }
  };
  
  vi.mocked(tauri.invoke).mockResolvedValue('kind: Pod');

  const { rerender } = render(
    <ResourceDetail resource={podResource} namespace="default" onClose={vi.fn()} onUpdated={vi.fn()} onDeleted={vi.fn()} onDeleteStart={vi.fn()} onOpenTerminal={vi.fn()} />
  );

  await waitFor(() => {
    expect(screen.getByText(/Debug Session/i)).toBeInTheDocument();
  });

  // Service 리소스로 변경 테스트
  const svcResource = {
    name: 'test-svc',
    definition: { label: 'Services', kind: 'Service', group: '', version: 'v1', icon: null }
  };
  rerender(
    <ResourceDetail resource={svcResource} namespace="default" onClose={vi.fn()} onUpdated={vi.fn()} onDeleted={vi.fn()} onDeleteStart={vi.fn()} onOpenTerminal={vi.fn()} />
  );

  await waitFor(() => {
    expect(screen.queryByText(/Debug Session/i)).not.toBeInTheDocument();
  });
});

test('ResourceDetail calls inject_debug_container with correct params', async () => {
  const podResource = {
    name: 'debug-pod',
    definition: { label: 'Pods', kind: 'Pod', group: '', version: 'v1', icon: null }
  };
  vi.mocked(tauri.invoke).mockResolvedValueOnce('kind: Pod'); // fetch resource data
  vi.mocked(tauri.invoke).mockResolvedValueOnce('palantir-debug-abcde'); // inject command response

  render(
    <ResourceDetail resource={podResource} namespace="debug-ns" onClose={vi.fn()} onUpdated={vi.fn()} onDeleted={vi.fn()} onDeleteStart={vi.fn()} onOpenTerminal={vi.fn()} />
  );

  // Debug 탭 클릭
  await waitFor(() => {
    fireEvent.click(screen.getByText(/Debug Session/i));
  });

  // 이미지 선택 (Netshoot 선택 시뮬레이션)
  const netshootOption = screen.getByText(/Netshoot/i);
  fireEvent.click(netshootOption);

  // 주입 버튼 클릭
  const injectBtn = screen.getByText(/Initiate Debug Session/i);
  fireEvent.click(injectBtn);

  // invoke 호출 검증
  await waitFor(() => {
    expect(tauri.invoke).toHaveBeenCalledWith('inject_debug_container', expect.objectContaining({
      namespace: 'debug-ns',
      podName: 'debug-pod',
      image: 'nicolaka/netshoot:latest'
    }));
  });
});
