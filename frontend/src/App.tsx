import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Box, Grid, Activity, Shield, Cpu, Zap, Layout, Terminal as TerminalIcon,
  Settings, ChevronDown, Command, Search, Bell, Layers, FileCode, Plus, Minus,
  Pin, PinOff
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/tauri';
import { listen } from '@tauri-apps/api/event';
import ResourcesPage from './pages/ResourcesPage';
import ResourceDetail from './components/ResourceDetail';
import Terminal from './components/Terminal';
import EventsViewer from './components/EventsViewer';
import { Toaster } from 'sonner';

export interface ResourceDefinition {
  label: string;
  kind: string;
  group: string;
  version: string;
  icon: React.ReactNode;
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
  const [selectedResource, setSelectedResource] = useState<{name: string, definition: ResourceDefinition} | null>(null);
  const [terminalSession, setTerminalSession] = useState<{podId: string, type: 'exec' | 'logs', container?: string} | null>(null);
  const [deletingResources, setDeletingResources] = useState<Set<string>>(new Set());
  const [uiScale, setUiScale] = useState(1.0);
  const [sidebarPinned, setSidebarPinned] = useState(false);
  const [eventsOpen, setEventsOpen] = useState(false);

  useEffect(() => {
    // [K8s Diagnostic] 연결 정보 출력
    invoke('get_connection_info')
      .then((info: any) => {
        console.log("🌐 [K8s Diagnostic] Connection Info:", info);
      })
      .catch(err => {
        console.error("❌ [K8s Diagnostic] Failed to get connection info:", err);
      });

    invoke<string[]>('get_namespaces')
      .then(setNamespaces)
      .catch(err => console.error("Failed to fetch namespaces:", err));

    const unlisten = listen('event-batch', (event: any) => {
      // Global event batch handler if needed
    });
    return () => { unlisten.then(f => f()); };
  }, []);

  useEffect(() => {
    document.documentElement.style.fontSize = `${uiScale * 16}px`;
  }, [uiScale]);

  const deletingArray = Array.from(deletingResources);

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden font-sans">
      <Toaster position="top-right" theme="dark" richColors closeButton />
      <div className="noise" />
      
      <aside className={`${sidebarPinned ? 'w-64' : 'w-[72px] hover:w-64'} border-r border-border flex flex-col p-4 bg-card/80 backdrop-blur-3xl transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] group z-50 shrink-0`}>
        <div className="flex items-center gap-4 py-6 mb-8 px-1">
          <div className="w-10 h-10 min-w-[40px] bg-primary rounded-2xl flex items-center justify-center font-bold text-primary-foreground shadow-[0_0_20px_hsl(var(--primary)/0.4)] ring-1 ring-white/20 transition-transform duration-500 group-hover:rotate-[360deg]">
            <Box size={20} />
          </div>
          <span className={`text-xl font-black tracking-tighter transition-all duration-300 delay-100 uppercase ${sidebarPinned ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>PALANTIR</span>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto overflow-x-hidden custom-scrollbar pr-2">
          <SidebarItem pinned={sidebarPinned} icon={<Grid size={20} />} label="Overview" active={activeTab === 'overview'} onClick={() => setActiveTab('overview')} />
          <div className={`py-4 px-3 text-[9px] font-black text-muted-foreground/50 uppercase tracking-[0.3em] transition-opacity ${sidebarPinned ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>Workloads</div>
          {Object.entries(RESOURCES).map(([id, def]) => (
            <SidebarItem pinned={sidebarPinned} key={id} icon={def.icon} label={def.label} active={activeTab === id} onClick={() => setActiveTab(id)} />
          ))}
        </nav>

        <div className="pt-4 border-t border-border mt-auto space-y-1">
          {/* 사이드바 핀 고정 토글 */}
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

      <main className="flex-1 flex flex-col min-w-0 bg-transparent overflow-hidden relative">
        <header className="h-20 flex items-center justify-between px-10 relative z-40 bg-background/40 backdrop-blur-md border-b border-border/50">
          <div className="flex items-center gap-8">
            <div className="relative group">
              <button onClick={() => setIsNsOpen(!isNsOpen)} className="flex items-center gap-3 bg-secondary/50 hover:bg-secondary px-5 py-2.5 rounded-2xl border border-border transition-all active:scale-95 shadow-sm">
                <div className="flex flex-col items-start leading-tight">
                  <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest mb-0.5">Namespace</span>
                  <span className="text-sm font-bold text-primary tracking-tight">{selectedNamespace}</span>
                </div>
                <ChevronDown size={14} className={`text-muted-foreground transition-transform duration-300 ${isNsOpen ? 'rotate-180' : ''}`} />
              </button>
              <AnimatePresence>
                {isNsOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setIsNsOpen(false)} />
                    <motion.div initial={{ opacity: 0, scale: 0.95, y: -10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: -10 }} className="absolute top-full left-0 mt-3 w-64 bg-popover border border-border rounded-3xl p-3 z-20 shadow-2xl ring-1 ring-white/10">
                      <div className="px-3 py-2 text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2 border-b border-border">Select Context</div>
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
            <div className="flex items-center gap-4 px-4 py-2 rounded-2xl bg-secondary/30 border border-border">
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

        <div
          className="flex-1 overflow-auto custom-scrollbar relative"
          style={{
            padding: '2.5rem',
            paddingRight: selectedResource ? 'calc(48rem + 2.5rem)' : '2.5rem',
            paddingBottom: eventsOpen ? 'calc(320px + 2.5rem)' : 'calc(40px + 2.5rem)',
            transition: 'padding-right 0.3s ease, padding-bottom 0.3s ease',
          }}
        >
          <ResourcesPage
            definition={RESOURCES[activeTab] || RESOURCES.pods}
            namespace={selectedNamespace}
            deletingResources={deletingArray}
            onViewDetail={(name: string) => setSelectedResource({ name, definition: RESOURCES[activeTab] || RESOURCES.pods })}
          />
        </div>

        <EventsViewer
          namespace={selectedNamespace}
          sidebarWidth={sidebarPinned ? 256 : 72}
          isOpen={eventsOpen}
          onToggle={() => setEventsOpen(v => !v)}
        />
      </main>

      <AnimatePresence>
        {selectedResource && (
          <ResourceDetail 
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

      {terminalSession && (
        <Terminal 
          session={terminalSession} 
          onClose={() => setTerminalSession(null)} 
        />
      )}
    </div>
  );
};

const SidebarItem = ({ icon, label, active, onClick, pinned }: { icon: React.ReactNode, label: string, active?: boolean, onClick: () => void, pinned?: boolean }) => (
  <button onClick={onClick} className={`w-full flex items-center gap-4 px-3 py-3 rounded-2xl transition-all duration-300 group/item ${active ? 'bg-primary/10 text-primary shadow-[inset_0_0_15px_hsl(var(--primary)/0.1)]' : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground'}`}>
    <div className={`p-2 rounded-xl transition-all duration-300 shrink-0 ${active ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20' : 'bg-transparent group-hover/item:bg-white/5'}`}>{icon}</div>
    <span className={`text-sm font-bold tracking-tight whitespace-nowrap transition-opacity duration-300 delay-100 ${pinned ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>{label}</span>
  </button>
);

export default App;
