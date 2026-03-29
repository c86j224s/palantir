import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { expect, test, vi, beforeEach } from 'vitest';
import ResourceDetail from '../components/ResourceDetail';
import ResourcesPage from '../pages/ResourcesPage';
import * as tauri from '@tauri-apps/api/tauri';

// 모킹 정의
vi.mock('@tauri-apps/api/tauri', () => ({
  invoke: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

test('ResourceDetail fetches and displays YAML on mount', async () => {
  const mockResource = {
    name: 'test-configmap',
    definition: { label: 'ConfigMaps', kind: 'ConfigMap', group: '', version: 'v1', icon: null }
  };
  // YAML 본문 내용을 명확히 구분
  const mockYaml = 'apiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: unique-yaml-content';
  
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

  // 1. 백엔드에 YAML 데이터를 요청했는지 확인
  await waitFor(() => {
    expect(tauri.invoke).toHaveBeenCalledWith('get_resource_yaml', expect.objectContaining({
      name: 'test-configmap'
    }));
  });

  // 2. YAML 내용이 화면에 렌더링되었는지 확인 (중복되지 않는 유니크한 텍스트로 검증)
  await waitFor(() => {
    expect(screen.getByText(/unique-yaml-content/)).toBeInTheDocument();
  });
});

test('ResourcesPage calls get_resources_generic with correct GVK', async () => {
  const mockDefinition = { label: 'Ingresses', kind: 'Ingress', group: 'networking.k8s.io', version: 'v1', icon: null };
  const mockResources = [{ name: 'test-ingress', namespace: 'default', kind: 'Ingress', status: 'Active' }];
  
  vi.mocked(tauri.invoke).mockResolvedValue(mockResources);

  render(
    <ResourcesPage 
      definition={mockDefinition} 
      namespace="prod" 
      deletingResources={[]}
      onViewDetail={vi.fn()} 
    />
  );

  // 3. 범용 리소스 조회 커맨드가 정확한 GVK 정보로 호출되었는지 확인
  await waitFor(() => {
    expect(tauri.invoke).toHaveBeenCalledWith('get_resources_generic', expect.objectContaining({
      namespace: 'prod',
      group: 'networking.k8s.io',
      kind: 'Ingress'
    }));
  });
});
