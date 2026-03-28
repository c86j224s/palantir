import React, { useState, useEffect } from 'react';
import { 
  Search, Grid, List, Activity, Settings, 
  Terminal as TerminalIcon, ChevronDown, 
  Bell, Command, Box, Monitor, Minus, Plus, Zap,
  Layers, Shield, HardDrive, Cpu, Network, FileCode
} from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import PodsPage from './pages/PodsPage';
import ResourcesPage from './pages/ResourcesPage';
import Terminal from './components/Terminal';
import ResourceDetail from './components/ResourceDetail';
import EventsViewer from './components/EventsViewer';
import { invoke } from '@tauri-apps/api/tauri';
import { Toaster } from 'sonner';

export interface TerminalSession {
  id: string;
  podId: string;
  type: 'exec' | 'logs';
}

export interface ResourceDefinition {
  label: string;
  kind: string;
  group: string;
  version: string;
  icon: any;
}

const RESOURCES: Record<string, ResourceDefinition> = {
  pods: { label: 'Pods', kind: 'Pod', group: '', version: 'v1', icon: <List size={20} /> },
  deployments: { label: 'Deployments', kind: 'Deployment', group: 'apps', version: 'v1', icon: <Activity size={20} /> },
  statefulsets: { label: 'StatefulSets', kind: 'StatefulSet', group: 'apps', version: 'v1', icon: <Layers size={20} /> },
  services: { label: 'Services', kind: 'Service', group: '', version: 'v1', icon: <TerminalIcon size={20} /> },
  ingresses: { label: 'Ingresses', kind: 'Ingress', group: 'networking.k8s.io', version: 'v1', icon: <Network size={20} /> },
  configmaps: { label: 'ConfigMaps', kind: 'ConfigMap', group: '', version: 'v1', icon: <FileCode size={20} /> },
  secrets: { label: 'Secrets', kind: 'Secret', group: '', version: 'v1', icon: <Shield size={20} /> },
  nodes: { label: 'Nodes', kind: 'Node', group: '', version: 'v1', icon: <Cpu size={20} /> },
  pvs: { label: 'Volumes', kind: 'PersistentVolume', group: '', version: 'v1', icon: <HardDrive size={20} /> },
};

const App = () => {
  const [activeTab, setActiveTab] = useState('pods');
  const [namespaces, setNamespaces] = useState<string[]>(['default']);
  const [selectedNamespace, setSelectedNamespace] = useState('default');
  const [isNsOpen, setIsNsOpen] = useState(false);
  const [uiScale, setUiScale] = useState(1.0);
  
  const [terminalSession, setTerminalSession] = useState<{podId: string, type: 'exec' | 'logs'} | null>(null);
  const [selectedResource, setSelectedResource] = useState<{name: string, definition: ResourceDefinition} | null>(null);
  
  // 삭제 진행 중인 리소스 목록 추적
  const [deletingResources, setDeletingResources] = useState<string[]>([]);

  // 리프레시 토글
  const [refreshKey, setRefreshKey] = useState(0);
  const triggerRefresh = () => {
    setRefreshKey(prev => prev + 1);
    setDeletingResources([]);
  };

  const markAsDeleting = (name: string) => {
    setDeletingResources(prev => [...prev, name]);
  };

  useEffect(() => {
    const fetchNamespaces = async () => {
      try {
        const data = await invoke<string[]>('get_namespaces');
        setNamespaces(data);
      } catch (err) {
        setNamespaces(['default', 'kube-system', 'prod', 'staging', 'development']);
      }
    };
    fetchNamespaces();
  }, []);

  useEffect(() => {
    document.documentElement.style.fontSize = `${uiScale * 16}px`;
  }, [uiScale]);

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden font-sans">
      <Toaster position="top-right" theme="dark" richColors closeButton />
      <div className="noise" />
      
      <aside className="w-[72px] hover:w-64 border-r border-border flex flex-col p-4 bg-card/80 backdrop-blur-3xl transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] group z-50">
        <div className="flex items-center gap-4 py-6 mb-8 px-1">
          <div className="w-10 h-10 min-w-[40px] bg-primary rounded-2xl flex items-center justify-center font-bold text-primary-foreground shadow-[0_0_20px_hsl(var(--primary)/0.4)] ring-1 ring-white/20 transition-transform duration-500 group-hover:rotate-[360deg]">
            <Box size={20} />
          </div>
          <span className="text-xl font-black tracking-tighter opacity-0 group-hover:opacity-100 transition-all duration-300 delay-100 uppercase">PALANTIR</span>
        </div>
        
        <nav className="flex-1 space-y-1 overflow-y-auto overflow-x-hidden custom-scrollbar pr-2">
          <SidebarItem icon={<Grid size={20} />} label="Overview" active={activeTab === 'overview'} onClick={() => setActiveTab('overview')} />
          <div className="py-4 px-3 text-[9px] font-black text-muted-foreground/50 uppercase tracking-[0.3em] opacity-0 group-hover:opacity-100 transition-opacity">Workloads</div>
          {Object.entries(RESOURCES).map(([id, def]) => (
            <SidebarItem key={id} icon={def.icon} label={def.label} active={activeTab === id} onClick={() => setActiveTab(id)} />
          ))}
        </nav>

        <div className="pt-4 border-t border-border mt-auto">
          <SidebarItem icon={<Settings size={20} />} label="Settings" active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} />
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
            <button className="relative p-2.5 bg-secondary/50 hover:bg-secondary border border-border rounded-2xl transition-all text-muted-foreground hover:text-foreground">
              <Bell size={18} />
              <div className="absolute top-2.5 right-2.5 w-2 h-2 bg-destructive rounded-full border-2 border-background shadow-[0_0_10px_hsl(var(--destructive)/0.5)]" />
            </button>
          </div>
        </header>

        <section className="flex-1 overflow-auto p-10 custom-scrollbar relative">
          {activeTab === 'pods' && (
            <PodsPage 
              key={`${selectedNamespace}-${refreshKey}`}
              namespace={selectedNamespace} 
              deletingResources={deletingResources}
              onOpenTerminal={(podId, type) => setTerminalSession({podId, type})} 
              onViewDetail={(name) => setSelectedResource({name, definition: RESOURCES.pods})}
            />
          )}
          {RESOURCES[activeTab] && activeTab !== 'pods' && (
            <ResourcesPage 
              key={`${selectedNamespace}-${refreshKey}`}
              definition={RESOURCES[activeTab]} 
              namespace={selectedNamespace} 
              deletingResources={deletingResources}
              onViewDetail={(name) => setSelectedResource({name, definition: RESOURCES[activeTab]})}
            />
          )}
          {activeTab === 'settings' && <SettingsView uiScale={uiScale} setUiScale={setUiScale} />}
          {activeTab === 'overview' && <OverviewMock />}
          
          <AnimatePresence>
            {terminalSession && <Terminal podId={terminalSession.podId} type={terminalSession.type} onClose={() => setTerminalSession(null)} />}
          </AnimatePresence>

          <AnimatePresence>
            {selectedResource && (
              <ResourceDetail 
                resource={selectedResource}
                namespace={selectedNamespace}
                onClose={() => setSelectedResource(null)}
                onUpdated={triggerRefresh}
                onDeleted={triggerRefresh}
                onDeleteStart={() => markAsDeleting(selectedResource.name)}
              />
            )}
          </AnimatePresence>
        </section>

        <EventsViewer />
      </main>
    </div>
  );
};

const SidebarItem = ({ icon, label, active, onClick }: { icon: any, label: string, active: boolean, onClick: () => void }) => (
  <button onClick={onClick} className={`w-full flex items-center gap-4 px-3 py-3 rounded-2xl transition-all duration-300 group relative ${active ? 'bg-primary/10 text-primary shadow-[inset_0_0_20px_hsl(var(--primary)/0.1)]' : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'}`}>
    {active && <div className="absolute left-[-16px] w-2 h-8 bg-primary rounded-r-full shadow-[5px_0_20px_hsl(var(--primary)/0.6)]" />}
    <div className={`transition-transform duration-300 ${active ? 'scale-110' : 'group-hover:scale-110'}`}>{icon}</div>
    <span className="text-sm font-bold tracking-tight opacity-0 group-hover:opacity-100 transition-all duration-300 whitespace-nowrap delay-75">{label}</span>
  </button>
);

const SettingsView = ({ uiScale, setUiScale }: any) => (
  <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 text-foreground">
    <h1 className="text-4xl font-black tracking-tighter uppercase italic">Control Panel</h1>
    <div className="glass-card rounded-3xl p-8 max-w-xl space-y-6">
      <div className="flex items-center gap-3 text-primary">
        <Monitor size={20} />
        <h2 className="font-bold uppercase tracking-widest text-sm">Visual Calibration</h2>
      </div>
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <span className="text-sm font-medium text-muted-foreground">Interface Scaling</span>
          <span className="text-sm font-mono font-bold text-primary">{Math.round(uiScale * 100)}%</span>
        </div>
        <input type="range" min="0.8" max="1.5" step="0.05" value={uiScale} onChange={(e) => setUiScale(parseFloat(e.target.value))} className="w-full h-1.5 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary" />
      </div>
    </div>
  </div>
);

const OverviewMock = () => (
  <div className="flex flex-col items-center justify-center h-full text-muted-foreground space-y-6">
    <div className="w-24 h-24 rounded-[2.5rem] bg-primary/5 border border-primary/10 flex items-center justify-center animate-pulse shadow-[0_0_50px_hsl(var(--primary)/0.05)]">
      <Zap size={40} className="text-primary/40" />
    </div>
    <div className="text-center space-y-2">
      <h2 className="text-2xl font-black text-foreground tracking-tighter uppercase italic">System Engaged</h2>
      <p className="text-sm max-w-xs mx-auto text-muted-foreground leading-relaxed font-medium">Palantir core modules are active. Select a resource to begin telemetry monitoring.</p>
    </div>
  </div>
);

export default App;
