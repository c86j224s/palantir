import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { expect, test, vi, beforeEach } from 'vitest';
import ResourceDetail from '../components/ResourceDetail';
import * as tauri from '@tauri-apps/api/tauri';
import { toast } from 'sonner';

// 모킹 정의
vi.mock('@tauri-apps/api/tauri', () => ({
  invoke: vi.fn(),
}));

// sonner 모킹
vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    promise: vi.fn().mockImplementation((promise) => promise),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

test('ResourceDetail blocks invalid YAML and calls toast.error', async () => {
  const mockResource = {
    name: 'test-resource',
    definition: { label: 'ConfigMaps', kind: 'ConfigMap', group: '', version: 'v1', icon: null }
  };
  const mockYaml = 'apiVersion: v1\nkind: ConfigMap';
  vi.mocked(tauri.invoke).mockResolvedValue(mockYaml);

  const { container } = render(
    <ResourceDetail resource={mockResource} namespace="default" onClose={vi.fn()} onUpdated={vi.fn()} onDeleted={vi.fn()} onDeleteStart={vi.fn()} onOpenTerminal={vi.fn()} />
  );

  await waitFor(() => {
    expect(screen.getByText(/Specifications/i)).toBeInTheDocument();
  });

  // Edit 모드 진입
  const editBtn = container.querySelector('button'); 
  if (editBtn) fireEvent.click(editBtn);

  // 잘못된 YAML 입력
  const textarea = container.querySelector('textarea');
  if (textarea) {
    fireEvent.change(textarea, { target: { value: 'invalid: yaml: : syntax' } });
  }

  // Save 버튼 클릭
  const saveBtn = screen.getByText(/Apply Configuration/i);
  fireEvent.click(saveBtn);

  // 1. 유효성 검사에 걸려서 invoke가 호출되지 않아야 함
  expect(tauri.invoke).not.toHaveBeenCalledWith('apply_resource_yaml', expect.any(Object));

  // 2. toast.error가 호출되었는지 확인 (UI 배너 대신 토스트 사용)
  expect(toast.error).toHaveBeenCalledWith(expect.stringContaining("Invalid YAML Syntax"), expect.any(Object));
});

test('ResourceDetail requires double confirmation for deletion', async () => {
  const mockResource = {
    name: 'test-resource',
    definition: { label: 'ConfigMaps', kind: 'ConfigMap', group: '', version: 'v1', icon: null }
  };
  vi.mocked(tauri.invoke).mockResolvedValue('');

  const { container } = render(
    <ResourceDetail resource={mockResource} namespace="default" onClose={vi.fn()} onUpdated={vi.fn()} onDeleted={vi.fn()} onDeleteStart={vi.fn()} onOpenTerminal={vi.fn()} />
  );

  await waitFor(() => {
    expect(container.querySelector('pre')).toBeInTheDocument();
  });

  // Delete 버튼 찾기
  const buttons = container.querySelectorAll('button');
  const deleteBtn = buttons[1]; 

  fireEvent.click(deleteBtn);
  expect(tauri.invoke).not.toHaveBeenCalledWith('delete_resource_generic', expect.any(Object));
  
  await waitFor(() => {
    expect(screen.getByText(/Confirm\?/i)).toBeInTheDocument();
  });

  fireEvent.click(deleteBtn);
  await waitFor(() => {
    expect(tauri.invoke).toHaveBeenCalledWith('delete_resource_generic', expect.any(Object));
  });
});
