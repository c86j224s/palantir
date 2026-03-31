import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Box, Grid, Activity, Shield, Cpu, Zap, Layout, Terminal as TerminalIcon,
  Settings, ChevronDown, Command, Search, Bell, Layers, FileCode, Plus, Minus,
  Pin, PinOff, Globe, Puzzle, Loader2, AlertTriangle
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/tauri';
import { listen } from '@tauri-apps/api/event';
import ResourcesPage from './pages/ResourcesPage';
import HelmPage from './pages/HelmPage';
import ResourceDetail from './components/ResourceDetail';
import Terminal from './components/Terminal';
import EventsViewer from './components/EventsViewer';
import { Toaster, toast } from 'sonner';

export interface ResourceDefinition {
  label: string;
  kind: string;
  group: string;
  version: string;
  icon: React.ReactNode;
  scope?: 'Namespaced' | 'Cluster';
  plural?: string;
  isCrd?: boolean;
}

export interface CrdInfo {
  name: string;       // "foos.example.com"
  group: string;      // "example.com"
  kind: string;       // "Foo"
  plural: string;     // "foos"
  scope: 'Namespaced' | 'Cluster';
  version: string;    // storage 버전
  versions: string[]; // served 버전 전체 목록
}

export interface ContextInfo {
  name: string;
  cluster: string;
  user: string;
  is_current: boolean;
}

const RESOURCES: Record<string, ResourceDefinition> = {
  pods: { label: 'Pods', kind: 'Pod', group: '', version: 'v1', icon: <Box size={20} /> },
  deployments: { label: 'Deployments', kind: 'Deployment', group: 'apps', version: 'v1', icon: <Activity size={20} /> },
  statefulsets: { label: 'StatefulSets', kind: 'StatefulSet', group: 'apps', version: 'v1', icon: <Layers size={20} /> },
  jobs: { label: 'Jobs', kind: 'Job', group: 'batch', version: 'v1', icon: <Box size={20} /> },
  cronjobs: { label: 'CronJobs', kind: 'CronJob', group: 'batch', version: 'v1', icon: <Zap size={20} /> },
  services: { label: 'Services', kind: 'Service', group: '', version: 'v1', icon: <TerminalIcon size={20} /> },
  configmaps: { label: 'ConfigMaps', kind: 'ConfigMap', group: '', version: 'v1', icon: <FileCode size={20} /> },
  secrets: { label: 'Secrets', kind: 'Secret', group: '', version: 'v1', icon: <Shield size={20} /> },
  nodes: { label: 'Nodes', kind: 'Node', group: '', version: 'v1', icon: <Cpu size={20} /> },
};

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState('pods');
  const [selectedNamespace, setSelectedNamespace] = useState('default');
  const [namespaces, setNamespaces] = useState<string[]>(['default']);
  const [isNsOpen, setIsNsOpen] = useState(false);

  // Context Switching States
  const [contexts, setContexts] = useState<ContextInfo[]>([]);
  const [selectedContext, setSelectedContext] = useState<string>('');
  const [isContextOpen, setIsContextOpen] = useState(false);

  // CRD 자동 감지 상태
  const [crds, setCrds] = useState<CrdInfo[]>([]);
  const [crdsLoading, setCrdsLoading] = useState(false);
  const [crdsError, setCrdsError] = useState<string | null>(null);

  const [selectedResource, setSelectedResource] = useState<{name: string, definition: ResourceDefinition} | null>(null);
  const [terminalSession, setTerminalSession] = useState<{podId: string, type: 'exec' | 'logs', container?: string} | null>(null);
  const [deletingResources, setDeletingResources] = useState<Set<string>>(new Set());
  const [uiScale, setUiScale] = useState(1.0);
  const [sidebarPinned, setSidebarPinned] = useState(false);
  const [eventsOpen, setEventsOpen] = useState(false);

  // Resizing States
  const [sidebarWidth, setSidebarWidth] = useState(256);
  const [detailWidth, setDetailWidth] = useState(768); 
  const [eventsHeight, setEventsHeight] = useState(320);
  const [isResizing, setIsResizing] = useState<'sidebar' | 'detail' | 'events' | null>(null);

  const fetchCrds = async () => {
    setCrdsLoading(true);
    setCrdsError(null);
    try {
      const data = await invoke<CrdInfo[]>('discover_crds');
      setCrds(data);
    } catch (err) {
      const errStr = String(err);
      if (errStr.includes('Forbidden') || errStr.includes('403')) {
        setCrdsError('CRD 조회 권한 없음 (cluster-admin 필요)');
      } else if (errStr.includes('connection') || errStr.includes('refused')) {
        setCrdsError('클러스터 연결 불가');
      } else {
        setCrdsError('CRD 목록 조회 실패');
      }
      setCrds([]);
    } finally {
      setCrdsLoading(false);
    }
  };

  const fetchCoreData = async () => {
    try {
      const info: any = await invoke('get_connection_info');
      setSelectedContext(info.current_context);

      const ctxList = await invoke<ContextInfo[]>('get_contexts');
      setContexts(ctxList);

      const nsList = await invoke<string[]>('get_namespaces');
      setNamespaces(nsList);
      if (!nsList.includes(selectedNamespace)) {
        setSelectedNamespace(nsList.includes('default') ? 'default' : nsList[0]);
      }

      // CRD 조회는 독립적으로 실행 — 실패해도 다른 기능에 영향 없음
      fetchCrds();
    } catch (err) {
      console.error("Failed to fetch initial data:", err);
      toast.error("Cluster connection failed");
    }
  };

  /// activeTab에 해당하는 ResourceDefinition을 반환합니다.
  /// CRD 탭은 "crd:{crd.name}" 형식으로 저장됩니다.
  const getActiveDefinition = (): ResourceDefinition => {
    if (activeTab.startsWith('crd:')) {
      const crdName = activeTab.slice(4);
      const found = crds.find(c => c.name === crdName);
      if (found) {
        return {
          label: found.kind,
          kind: found.kind,
          group: found.group,
          version: found.version,
          icon: <Puzzle size={20} />,
          scope: found.scope,
          plural: found.plural,
          isCrd: true,
        };
      }
    }
    return RESOURCES[activeTab] || RESOURCES.pods;
  };

  useEffect(() => {
    fetchCoreData();

    const unlisten = listen('event-batch', (event: any) => {
      // Global event batch handler if needed
    });
    return () => { unlisten.then(f => f()); };
  }, []);

  const handleContextChange = async (contextName: string) => {
    try {
      setIsContextOpen(false);
      const promise = invoke('switch_context', { contextName });
      toast.promise(promise, {
        loading: `Switching to context: ${contextName}...`,
        success: () => `Switched to ${contextName}`,
        error: 'Failed to switch context'
      });
      await promise;
      
      // Refresh all data
      await fetchCoreData();
      // Reset selections
      setSelectedResource(null);
      setTerminalSession(null);
    } catch (err) {
      console.error("Context switch error:", err);
    }
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      if (isResizing === 'sidebar') {
        const newWidth = Math.max(200, Math.min(500, e.clientX));
        setSidebarWidth(newWidth);
      } else if (isResizing === 'detail') {
        const newWidth = Math.max(400, Math.min(1200, window.innerWidth - e.clientX));
        setDetailWidth(newWidth);
      } else if (isResizing === 'events') {
        const newHeight = Math.max(150, Math.min(800, window.innerHeight - e.clientY));
        setEventsHeight(newHeight);
      }
    };

    const handleMouseUp = () => setIsResizing(null);

    if (isResizing) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = isResizing === 'events' ? 'row-resize' : 'col-resize';
      document.body.style.userSelect = 'none';
    } else {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  useEffect(() => {
    document.documentElement.style.fontSize = `${uiScale * 16}px`;
  }, [uiScale]);

  const deletingArray = Array.from(deletingResources);

  return (
    <div className="flex flex-col h-screen bg-background text-foreground overflow-hidden font-sans">
      <Toaster position="top-right" theme="dark" richColors closeButton />
      <div className="noise" />

      <div className="flex-1 flex min-h-0 overflow-hidden">
        
        <aside 
          style={{ width: sidebarPinned ? sidebarWidth : 80 }}
          className={`border-r border-border flex flex-col p-4 bg-card/80 backdrop-blur-3xl transition-[width] duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] group z-50 shrink-0`}
        >
          <div className="flex items-center gap-4 py-6 mb-8 px-1">
            <div className="w-10 h-10 min-w-[40px] bg-primary rounded-2xl flex items-center justify-center font-bold text-primary-foreground shadow-[0_0_20px_hsl(var(--primary)/0.4)] ring-1 ring-white/20 transition-transform duration-500 group-hover:rotate-[360deg]">
              <Box size={20} />
            </div>
            <span className={`text-xl font-black tracking-tighter transition-all duration-300 delay-100 uppercase ${sidebarPinned ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>PALANTIR</span>
          </div>

          <nav className="flex-1 space-y-1 overflow-y-auto overflow-x-hidden custom-scrollbar pr-2">
            <SidebarItem pinned={sidebarPinned} icon={<Grid size={20} />} label="Overview" active={activeTab === 'overview'} onClick={() => setActiveTab('overview')} />
            <SidebarItem pinned={sidebarPinned} icon={<Layers size={20} />} label="Helm" active={activeTab === 'helm'} onClick={() => setActiveTab('helm')} />
            <div className={`py-4 px-3 text-[9px] font-black text-muted-foreground/50 uppercase tracking-[0.3em] transition-opacity ${sidebarPinned ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>Workloads</div>
            {Object.entries(RESOURCES).map(([id, def]) => (
              <SidebarItem pinned={sidebarPinned} key={id} icon={def.icon} label={def.label} active={activeTab === id} onClick={() => setActiveTab(id)} />
            ))}

            {/* CRD 섹션 */}
            <div className={`py-4 px-3 text-[9px] font-black text-muted-foreground/50 uppercase tracking-[0.3em] transition-opacity flex items-center gap-2 ${sidebarPinned ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
              <span>Custom Resources</span>
              {crdsLoading && <Loader2 size={10} className="animate-spin" />}
            </div>
            {crdsError ? (
              <div className={`px-3 py-2 flex items-center gap-2 text-[9px] text-amber-500/60 transition-opacity ${sidebarPinned ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                <AlertTriangle size={10} />
                <span className="truncate">{crdsError}</span>
              </div>
            ) : crds.length === 0 && !crdsLoading ? (
              <div className={`px-3 py-2 text-[9px] text-muted-foreground/30 transition-opacity ${sidebarPinned ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                No CRDs found
              </div>
            ) : (
              crds.map(crd => (
                <SidebarItem
                  pinned={sidebarPinned}
                  key={crd.name}
                  icon={<Puzzle size={20} />}
                  label={crd.kind}
                  sublabel={crd.group}
                  active={activeTab === `crd:${crd.name}`}
                  onClick={() => {
                    setActiveTab(`crd:${crd.name}`);
                    setSelectedResource(null);
                  }}
                />
              ))
            )}
          </nav>

          <div className="pt-4 border-t border-border mt-auto space-y-1">
            <button
              onClick={() => setSidebarPinned(v => !v)}
              className="w-full flex items-center gap-4 px-3 py-3 rounded-2xl transition-all duration-300 text-muted-foreground hover:bg-secondary/50 hover:text-primary"
              title={sidebarPinned ? '사이드바 자동 축소 해제' : '사이드바 고정 열기'}
            >
              <div className="p-2 rounded-xl shrink-0">
                {sidebarPinned ? <PinOff size={20} /> : <Pin size={20} />}
              </div>
              <span className={`text-sm font-bold tracking-tight whitespace-nowrap transition-opacity duration-300 delay-100 ${sidebarPinned ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                {sidebarPinned ? 'Unpin' : 'Pin Sidebar'}
              </span>
            </button>
            <SidebarItem pinned={sidebarPinned} icon={<Settings size={20} />} label="Settings" active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} />
          </div>
        </aside>

        {sidebarPinned && (
          <div 
            onMouseDown={() => setIsResizing('sidebar')}
            className={`w-1.5 h-full cursor-col-resize transition-colors hover:bg-primary/20 z-[60] shrink-0 -ml-0.75 ${isResizing === 'sidebar' ? 'bg-primary/40' : ''}`} 
          />
        )}

        <div className="flex-1 flex flex-col min-w-0 bg-transparent overflow-hidden relative">
          <header className="h-20 flex items-center justify-between px-10 relative z-40 bg-background/40 backdrop-blur-md border-b border-border/50 shrink-0">
            <div className="flex items-center gap-6 leading-none">
              
              {/* Context Selector */}
              <div className="relative group">
                <button onClick={() => setIsContextOpen(!isContextOpen)} className="flex items-center gap-3 bg-primary/10 hover:bg-primary/20 px-5 py-2.5 rounded-2xl border border-primary/20 transition-all active:scale-95 shadow-sm ring-1 ring-primary/10">
                  <div className="flex flex-col items-start leading-tight">
                    <span className="text-[10px] text-primary/70 font-black uppercase tracking-widest mb-0.5">Cluster</span>
                    <span className="text-sm font-black text-primary tracking-tighter truncate max-w-[120px]">{selectedContext || 'Loading...'}</span>
                  </div>
                  <ChevronDown size={14} className={`text-primary/70 transition-transform duration-300 ${isContextOpen ? 'rotate-180' : ''}`} />
                </button>
                <AnimatePresence>
                  {isContextOpen && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setIsContextOpen(false)} />
                      <motion.div initial={{ opacity: 0, scale: 0.95, y: -10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: -10 }} className="absolute top-full left-0 mt-3 w-80 bg-popover border border-border rounded-3xl p-3 z-20 shadow-2xl ring-1 ring-white/10 overflow-hidden">
                        <div className="px-3 py-2 text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-2 border-b border-border flex items-center gap-2">
                            <Globe size={12} />
                            Available Contexts
                        </div>
                        <div className="max-h-80 overflow-auto custom-scrollbar space-y-1">
                          {contexts.map(ctx => (
                            <button key={ctx.name} onClick={() => handleContextChange(ctx.name)} className={`w-full text-left px-4 py-3 rounded-xl transition-all group/ctx ${selectedContext === ctx.name ? 'bg-primary/10 text-primary font-bold' : 'text-muted-foreground hover:bg-secondary hover:text-foreground'}`}>
                                <div className="flex flex-col">
                                    <span className="text-sm font-bold tracking-tight">{ctx.name}</span>
                                    <span className={`text-[10px] opacity-50 group-hover/ctx:opacity-100 transition-opacity truncate ${selectedContext === ctx.name ? 'text-primary/70' : ''}`}>{ctx.cluster}</span>
                                </div>
                            </button>
                          ))}
                        </div>
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
              </div>

              {/* Namespace Selector — Cluster-scoped CRD 선택 시 비활성화 */}
              <div className={`relative group ${getActiveDefinition().scope === 'Cluster' ? 'opacity-40 pointer-events-none' : ''}`}>
                <button onClick={() => setIsNsOpen(!isNsOpen)} className="flex items-center gap-3 bg-secondary/50 hover:bg-secondary px-5 py-2.5 rounded-2xl border border-border transition-all active:scale-95 shadow-sm">
                  <div className="flex flex-col items-start leading-tight">
                    <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest mb-0.5">Namespace</span>
                    <span className="text-sm font-bold text-foreground tracking-tight">{selectedNamespace}</span>
                  </div>
                  <ChevronDown size={14} className={`text-muted-foreground transition-transform duration-300 ${isNsOpen ? 'rotate-180' : ''}`} />
                </button>
                <AnimatePresence>
                  {isNsOpen && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setIsNsOpen(false)} />
                      <motion.div initial={{ opacity: 0, scale: 0.95, y: -10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: -10 }} className="absolute top-full left-0 mt-3 w-64 bg-popover border border-border rounded-3xl p-3 z-20 shadow-2xl ring-1 ring-white/10">
                        <div className="px-3 py-2 text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2 border-b border-border">Select Namespace</div>
                        <div className="max-h-64 overflow-auto custom-scrollbar space-y-1">
                          {namespaces.map(ns => (
                            <button key={ns} onClick={() => { setSelectedNamespace(ns); setIsNsOpen(false); }} className={`w-full text-left px-4 py-2.5 rounded-xl text-sm transition-all ${selectedNamespace === ns ? 'bg-primary/10 text-primary font-bold shadow-[inset_0_0_10px_hsl(var(--primary)/0.1)]' : 'text-muted-foreground hover:bg-secondary hover:text-foreground'}`}>{ns}</button>
                          ))}
                        </div>
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
              </div>

              <div className="flex items-center gap-4 bg-secondary/30 px-5 py-2.5 rounded-2xl border border-border w-full max-w-xl focus-within:ring-2 ring-primary/20 transition-all group shadow-inner">
                <Command size={18} className="text-muted-foreground group-focus-within:text-primary transition-colors" />
                <input type="text" placeholder="Search cluster resources..." className="bg-transparent border-none outline-none text-sm w-full placeholder:text-muted-foreground/50 font-medium" />
              </div>
            </div>
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-4 px-4 py-2 rounded-2xl bg-secondary/30 border border-border leading-none">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">UI Scale</span>
                <div className="flex items-center gap-2">
                    <button onClick={() => setUiScale(s => Math.max(0.8, s - 0.1))} className="p-1 hover:bg-white/5 rounded-md"><Minus size={12}/></button>
                    <span className="text-xs font-mono font-bold text-primary w-8 text-center">{Math.round(uiScale * 100)}%</span>
                    <button onClick={() => setUiScale(s => Math.min(1.5, s + 0.1))} className="p-1 hover:bg-white/5 rounded-md"><Plus size={12}/></button>
                </div>
              </div>
              <div className="w-10 h-10 rounded-2xl bg-secondary/50 border border-border flex items-center justify-center text-muted-foreground hover:text-primary transition-colors cursor-pointer relative"><Bell size={20} /><span className="absolute top-2.5 right-2.5 w-2 h-2 bg-primary rounded-full border-2 border-background" /></div>
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-primary to-blue-600 border border-white/20 shadow-lg" />
            </div>
          </header>

          <main className="flex-1 overflow-auto custom-scrollbar relative p-10 bg-transparent">
            {activeTab === 'helm' ? (
              <HelmPage namespace={selectedNamespace} />
            ) : (
              <ResourcesPage
                definition={getActiveDefinition()}
                namespace={selectedNamespace}
                deletingResources={deletingArray}
                onViewDetail={(name: string) => setSelectedResource({ name, definition: getActiveDefinition() })}
              />
            )}
          </main>
        </div>

        {selectedResource && (
          <div 
            onMouseDown={() => setIsResizing('detail')}
            className={`w-1.5 h-full cursor-col-resize transition-colors hover:bg-primary/20 z-[160] shrink-0 -mr-0.75 ${isResizing === 'detail' ? 'bg-primary/40' : ''}`} 
          />
        )}

        <AnimatePresence mode="popLayout">
          {selectedResource && (
            <ResourceDetail 
              width={detailWidth}
              resource={selectedResource} 
              namespace={selectedNamespace} 
              onClose={() => setSelectedResource(null)}
              onUpdated={() => {}}
              onDeleteStart={() => setDeletingResources(prev => new Set(prev).add(selectedResource.name))}
              onDeleted={() => {
                setDeletingResources(prev => {
                  const next = new Set(prev);
                  next.delete(selectedResource.name);
                  return next;
                });
                setSelectedResource(null);
              }}
              onOpenTerminal={(podId, type, container) => setTerminalSession({ podId, type, container })}
            />
          )}
        </AnimatePresence>
      </div>

      {eventsOpen && (
        <div 
          onMouseDown={() => setIsResizing('events')}
          className={`h-1.5 w-full cursor-row-resize transition-colors hover:bg-primary/20 z-[70] shrink-0 -mb-0.75 ${isResizing === 'events' ? 'bg-primary/40' : ''}`} 
        />
      )}

      <EventsViewer
        height={eventsHeight}
        namespace={selectedNamespace}
        isOpen={eventsOpen}
        onToggle={() => setEventsOpen(v => !v)}
      />

      {terminalSession && (
        <Terminal 
          session={terminalSession} 
          onClose={() => setTerminalSession(null)} 
        />
      )}
    </div>
  );
};

const SidebarItem = ({
  icon, label, sublabel, active, onClick, pinned
}: {
  icon: React.ReactNode;
  label: string;
  sublabel?: string;
  active?: boolean;
  onClick: () => void;
  pinned?: boolean;
}) => (
  <button onClick={onClick} className={`w-full flex items-center gap-4 px-3 py-3 rounded-2xl transition-all duration-300 group/item ${active ? 'bg-primary/10 text-primary shadow-[inset_0_0_15px_hsl(var(--primary)/0.1)]' : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground'}`}>
    <div className={`p-2 rounded-xl transition-all duration-300 shrink-0 ${active ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20' : 'bg-transparent group-hover/item:bg-white/5'}`}>{icon}</div>
    <div className={`flex flex-col transition-opacity duration-300 delay-100 min-w-0 ${pinned ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
      <span className="text-sm font-bold tracking-tight whitespace-nowrap">{label}</span>
      {sublabel && (
        <span className="text-[9px] text-muted-foreground/50 font-mono truncate max-w-[140px]">{sublabel}</span>
      )}
    </div>
  </button>
);

export default App;
