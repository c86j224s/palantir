import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { expect, test, vi, beforeEach } from 'vitest';
import ResourceDetail from '../components/ResourceDetail';
import * as tauri from '@tauri-apps/api/tauri';

// 모킹 정의
vi.mock('@tauri-apps/api/tauri', () => ({
  invoke: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

test('ResourceDetail parses environment variables from YAML and displays them in Env tab', async () => {
  const mockResource = {
    name: 'env-pod',
    definition: { label: 'Pods', kind: 'Pod', group: '', version: 'v1', icon: null }
  };
  
  // 가짜 YAML (값에 따옴표가 있는 경우 포함)
  const mockYaml = `
apiVersion: v1
kind: Pod
metadata:
  name: env-pod
spec:
  containers:
  - name: main
    env:
    - name: DEBUG_MODE
      value: "true"
    - name: DB_URL
      value: postgres://localhost:5432
  `;
  
  vi.mocked(tauri.invoke).mockResolvedValue(mockYaml);

  render(
    <ResourceDetail 
      resource={mockResource} 
      namespace="default" 
      width={768}
      onClose={vi.fn()}
      onUpdated={vi.fn()}
      onDeleted={vi.fn()}
      onDeleteStart={vi.fn()}
      onOpenTerminal={vi.fn()}
    />
  );

  await waitFor(() => {
    expect(screen.getByText(/apiVersion: v1/)).toBeInTheDocument();
  });

  const envTab = screen.getByText(/Environment/i);
  fireEvent.click(envTab);

  // 3. 파싱된 환경 변수 확인 (따옴표 포함 여부와 상관없이 정규표현식으로 검증)
  await waitFor(() => {
    expect(screen.getByText('DEBUG_MODE')).toBeInTheDocument();
    expect(screen.getByText(/"true"/)).toBeInTheDocument();
    expect(screen.getByText('DB_URL')).toBeInTheDocument();
    expect(screen.getByText(/postgres:\/\/localhost:5432/)).toBeInTheDocument();
  });
});

test('ResourceDetail does not show Environment tab for non-Pod resources', async () => {
  const mockResource = {
    name: 'test-svc',
    definition: { label: 'Services', kind: 'Service', group: '', version: 'v1', icon: null }
  };
  
  vi.mocked(tauri.invoke).mockResolvedValue('kind: Service');

  render(
    <ResourceDetail 
      resource={mockResource} 
      namespace="default" 
      width={768}
      onClose={vi.fn()}
      onUpdated={vi.fn()}
      onDeleted={vi.fn()}
      onDeleteStart={vi.fn()}
      onOpenTerminal={vi.fn()}
    />
  );

  await waitFor(() => {
    expect(screen.queryByText(/Environment/i)).not.toBeInTheDocument();
  });
});
