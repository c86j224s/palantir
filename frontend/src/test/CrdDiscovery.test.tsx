import { render, screen, waitFor } from '@testing-library/react';
import { expect, test, vi, beforeEach } from 'vitest';
import ResourcesPage from '../pages/ResourcesPage';
import * as tauri from '@tauri-apps/api/tauri';

vi.mock('@tauri-apps/api/tauri', () => ({
  invoke: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

test('Cluster-scoped CRD는 scope=Cluster를 get_resources_generic에 전달한다', async () => {
  const clusterCrdDef = {
    label: 'ClusterPolicies',
    kind: 'ClusterPolicy',
    group: 'policy.io',
    version: 'v1',
    icon: null,
    scope: 'Cluster' as const,
    plural: 'clusterpolicies',
    isCrd: true,
  };
  vi.mocked(tauri.invoke).mockResolvedValue([]);

  render(
    <ResourcesPage
      definition={clusterCrdDef}
      namespace="default"
      deletingResources={[]}
      onViewDetail={vi.fn()}
    />
  );

  await waitFor(() => {
    expect(tauri.invoke).toHaveBeenCalledWith(
      'get_resources_generic',
      expect.objectContaining({
        scope: 'Cluster',
        plural: 'clusterpolicies',
      })
    );
  });
});

test('Cluster-scoped CRD는 "Cluster-scoped" 배지를 표시한다', async () => {
  const clusterCrdDef = {
    label: 'ClusterPolicies',
    kind: 'ClusterPolicy',
    group: 'policy.io',
    version: 'v1',
    icon: null,
    scope: 'Cluster' as const,
    plural: 'clusterpolicies',
    isCrd: true,
  };
  vi.mocked(tauri.invoke).mockResolvedValue([]);

  render(
    <ResourcesPage
      definition={clusterCrdDef}
      namespace="default"
      deletingResources={[]}
      onViewDetail={vi.fn()}
    />
  );

  await waitFor(() => {
    expect(screen.getByText('Cluster-scoped')).toBeInTheDocument();
  });
});

test('Namespaced CRD는 scope=Namespaced와 plural을 전달한다', async () => {
  const namespacedCrdDef = {
    label: 'Foos',
    kind: 'Foo',
    group: 'example.com',
    version: 'v1',
    icon: null,
    scope: 'Namespaced' as const,
    plural: 'foos',
    isCrd: true,
  };
  vi.mocked(tauri.invoke).mockResolvedValue([]);

  render(
    <ResourcesPage
      definition={namespacedCrdDef}
      namespace="production"
      deletingResources={[]}
      onViewDetail={vi.fn()}
    />
  );

  await waitFor(() => {
    expect(tauri.invoke).toHaveBeenCalledWith(
      'get_resources_generic',
      expect.objectContaining({
        namespace: 'production',
        group: 'example.com',
        kind: 'Foo',
        scope: 'Namespaced',
        plural: 'foos',
      })
    );
  });
});

test('리소스 조회 실패 시 에러 메시지를 표시한다', async () => {
  const def = {
    label: 'Foos',
    kind: 'Foo',
    group: 'example.com',
    version: 'v1',
    icon: null,
    scope: 'Namespaced' as const,
    plural: 'foos',
    isCrd: true,
  };
  vi.mocked(tauri.invoke).mockRejectedValue(new Error('Forbidden: access denied'));

  render(
    <ResourcesPage
      definition={def}
      namespace="default"
      deletingResources={[]}
      onViewDetail={vi.fn()}
    />
  );

  await waitFor(() => {
    expect(screen.getByText(/조회 권한 없음/)).toBeInTheDocument();
  });
});

test('기존 Namespaced 리소스는 scope=Namespaced로 호출된다', async () => {
  const podDef = {
    label: 'Pods',
    kind: 'Pod',
    group: '',
    version: 'v1',
    icon: null,
  };
  vi.mocked(tauri.invoke).mockResolvedValue([]);

  render(
    <ResourcesPage
      definition={podDef}
      namespace="kube-system"
      deletingResources={[]}
      onViewDetail={vi.fn()}
    />
  );

  await waitFor(() => {
    expect(tauri.invoke).toHaveBeenCalledWith(
      'get_resources_generic',
      expect.objectContaining({
        namespace: 'kube-system',
        kind: 'Pod',
        scope: 'Namespaced',
      })
    );
  });
});
