import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Copy, Check, Trash2, Edit2, Save, ShieldAlert,
  Braces, RefreshCw, Sliders, Loader2, AlertCircle, Info, Zap, Terminal as TerminalIcon, FileText, Play, Activity
} from 'lucide-react';
import KubectlHint from './KubectlHint';
import { invoke } from '@tauri-apps/api/tauri';
import { ResourceDefinition } from '../App';
import yamlParser from 'js-yaml';
import { toast } from 'sonner';

interface Props {
  resource: { name: string, definition: ResourceDefinition };
  namespace: string;
  onClose: () => void;
  onUpdated: () => void;
  onDeleted: () => void;
  onDeleteStart: () => void;
  onOpenTerminal: (podId: string, type: 'exec' | 'logs', container?: string) => void;
  width: number;
}

const translateK8sError = (err: string): string => {
  if (err.includes("pod updates may not change fields other than")) return "파드 설정은 불변입니다. 이미지 외 수정은 불가능합니다.";
  if (err.includes("Forbidden")) return "권한 부족 또는 정책에 의해 거부되었습니다.";
  return err;
};

const ResourceDetail: React.FC<Props> = ({ resource, namespace, onClose, onUpdated, onDeleted, onDeleteStart, onOpenTerminal, width }) => {
  const [yamlStr, setYamlStr] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'yaml' | 'env' | 'debug' | 'logs'>('yaml');
  
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  
  const [originalReplicas, setOriginalReplicas] = useState<number>(0);
  const [pendingReplicas, setPendingReplicas] = useState<number>(0);
  const [readyReplicas, setReadyReplicas] = useState<number>(0);
  
  const [deleteConfirmPhase, setDeleteConfirmPhase] = useState(0);

  // Debug states
  const [debugImage, setDebugImage] = useState('busybox:latest');
  const [isInjecting, setIsInjecting] = useState(false);
  const [ephemeralContainers, setEphemeralContainers] = useState<any[]>([]);

  // Static Logs state
  const [staticLogs, setStaticLogs] = useState<string>('');
  const [logsLoading, setLogsLoading] = useState(false);

  useEffect(() => {
    fetchResourceData();
    if (resource.definition.kind === 'Pod') fetchEphemeralContainers();
  }, [resource, namespace]);

  const fetchResourceData = async () => {
    setLoading(true);
    try {
      const data = await invoke<string>('get_resource_yaml', {
        namespace, group: resource.definition.group, version: resource.definition.version,
        kind: resource.definition.kind, name: resource.name
      });
      setYamlStr(data);
      setEditContent(data);
      
      if (['Deployment', 'StatefulSet', 'ReplicaSet'].includes(resource.definition.kind)) {
        const parsed = yamlParser.load(data) as any;
        const r = parsed.spec?.replicas ?? 0;
        setOriginalReplicas(r);
        setPendingReplicas(r);
        setReadyReplicas(parsed.status?.readyReplicas ?? parsed.status?.replicas ?? 0);
      }
    } catch (err) {
      setYamlStr(`--- \n# Error: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  const fetchEphemeralContainers = async () => {
    try {
      const pod: any = await invoke('get_pod_detail', { namespace, podName: resource.name });
      setEphemeralContainers(pod.ephemeral_containers || []);
    } catch (err) {
      console.error("Failed to fetch ephemeral containers:", err);
    }
  };

  const fetchStaticLogs = async () => {
    setLogsLoading(true);
    try {
      const data = await invoke<string>('get_static_logs', {
        namespace, podName: resource.name, containerName: null
      });
      setStaticLogs(data);
    } catch (err) {
      setStaticLogs(`Error fetching logs: ${err}`);
    } finally {
      setLogsLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'logs') fetchStaticLogs();
  }, [activeTab, resource.name]);

  const handleSaveYAML = async () => {
    try { yamlParser.load(editContent); } catch (e: any) {
      toast.error("Invalid YAML Syntax", { description: e.message });
      return;
    }
    setIsProcessing(true);
    const promise = invoke('apply_resource_yaml', {
      namespace, group: resource.definition.group, version: resource.definition.version,
      kind: resource.definition.kind, name: resource.name, yamlContent: editContent
    });
    toast.promise(promise, {
      loading: 'Applying configuration...',
      success: () => { setYamlStr(editContent); setIsEditing(false); onUpdated(); return 'Applied successfully'; },
      error: (err) => `Apply failed: ${translateK8sError(String(err))}`,
      finally: () => setIsProcessing(false)
    });
  };

  const handleInjectDebug = async () => {
    setIsInjecting(true);
    const promise = invoke<string>('inject_debug_container', {
      namespace, podName: resource.name, image: debugImage
    });

    toast.promise(promise, {
      loading: `Injecting ${debugImage} and waiting for start...`,
      success: (containerName) => {
        setIsInjecting(false);
        fetchEphemeralContainers();
        toast.success("Ready! Attaching to debug console.");
        onOpenTerminal(`${namespace}/${resource.name}`, 'exec', containerName);
        return `Container ${containerName} is live.`;
      },
      error: (err) => {
        setIsInjecting(false);
        const errStr = String(err);
        if (errStr.includes("403") || errStr.includes("Forbidden")) return "권한 부족: ephemeralcontainers 패치 권한이 필요합니다.";
        return `Injection failed: ${translateK8sError(errStr)}`;
      }
    });
  };

  const handleTerminateSession = async (containerName: string) => {
    const promise = invoke('terminate_debug_container', {
      namespace, podName: resource.name, containerName
    });

    toast.promise(promise, {
      loading: `Terminating ${containerName}...`,
      success: () => {
        fetchEphemeralContainers();
        return `${containerName} terminated.`;
      },
      error: (err) => `Failed to terminate: ${err}`
    });
  };

  const handleApplyScale = async () => {
    setIsProcessing(true);
    const promise = invoke('scale_resource', {
      namespace, group: resource.definition.group, version: resource.definition.version,
      kind: resource.definition.kind, name: resource.name, replicas: pendingReplicas
    });
    toast.promise(promise, {
      loading: `Scaling to ${pendingReplicas} replicas...`,
      success: () => { setOriginalReplicas(pendingReplicas); onUpdated(); return `Scaled to ${pendingReplicas}`; },
      error: (err) => `Scale failed: ${translateK8sError(String(err))}`,
      finally: () => setIsProcessing(false)
    });
  };

  const handleRestart = async () => {
    if (!window.confirm("Trigger Rollout Restart?")) return;
    setIsProcessing(true);
    const promise = invoke('restart_resource', {
      namespace, group: resource.definition.group, version: resource.definition.version,
      kind: resource.definition.kind, name: resource.name
    });
    toast.promise(promise, {
      loading: 'Triggering rollout restart...',
      success: () => { onUpdated(); fetchResourceData(); return 'Restart triggered successfully'; },
      error: (err) => `Restart failed: ${translateK8sError(String(err))}`,
      finally: () => setIsProcessing(false)
    });
  };

  const handleDelete = async () => {
    if (deleteConfirmPhase === 0) {
      setDeleteConfirmPhase(1);
      setTimeout(() => setDeleteConfirmPhase(0), 3000);
      return;
    }
    setDeleteConfirmPhase(2);
    onDeleteStart();
    const promise = invoke('delete_resource_generic', {
      namespace, group: resource.definition.group, version: resource.definition.version,
      kind: resource.definition.kind, name: resource.name
    });
    toast.promise(promise, {
      loading: `Deleting ${resource.name}...`,
      success: () => { onDeleted(); onClose(); return `${resource.name} deleted`; },
      error: (err) => { setDeleteConfirmPhase(0); return `Delete failed: ${translateK8sError(String(err))}`; }
    });
  };

  const envVars = useMemo(() => {
    if (!yamlStr || resource.definition.kind !== 'Pod') return [];
    const vars: {name: string, value: string}[] = [];
    const lines = yamlStr.split('\n');
    let inEnvSection = false;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line === 'env:') inEnvSection = true;
      else if (inEnvSection && line.startsWith('- name:')) {
        const name = line.replace('- name:', '').trim();
        const vLine = lines[i+1]?.trim() || '';
        if (vLine.startsWith('value:')) vars.push({ name, value: vLine.replace('value:', '').trim() });
      }
      if (inEnvSection && line === '' && i > 0) inEnvSection = false;
    }
    return vars;
  }, [yamlStr, resource.definition.kind]);

  const showScale = ['Deployment', 'StatefulSet', 'ReplicaSet'].includes(resource.definition.kind);

  return (
    <motion.div
      initial={{ width: 0, opacity: 0 }}
      animate={{ width, opacity: 1 }}
      exit={{ width: 0, opacity: 0 }}
      transition={{ type: 'spring', damping: 30, stiffness: 250 }}
      className="relative h-full bg-card border-l border-border shadow-2xl z-[150] flex flex-col font-sans shrink-0 overflow-hidden"
    >
      <div className="h-20 flex items-center justify-between px-8 border-b border-border bg-background/50 backdrop-blur-md shrink-0">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
            <Braces size={20} className="text-primary" />
          </div>
          <div className="flex flex-col">
            <h2 className="text-lg font-black tracking-tight text-foreground uppercase truncate max-w-[300px]">{resource.name}</h2>
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{resource.definition.kind} • {namespace}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!isEditing && (
            <>
              <button onClick={() => setIsEditing(true)} className="p-2.5 hover:bg-white/5 rounded-xl border border-border text-muted-foreground hover:text-primary transition-all"><Edit2 size={18} /></button>
              <div className="flex items-center gap-1">
                <button onClick={handleDelete} disabled={deleteConfirmPhase === 2} className={`flex items-center gap-2 p-2.5 rounded-xl border transition-all ${deleteConfirmPhase === 1 ? 'bg-red-500/20 border-red-500/50 text-red-500 font-bold px-4' : 'border-border text-muted-foreground hover:text-red-500 hover:bg-white/5'}`}>
                  {deleteConfirmPhase === 2 ? <Loader2 size={18} className="animate-spin" /> : <Trash2 size={18} />}
                  {deleteConfirmPhase === 1 && <span className="text-xs uppercase tracking-widest">Confirm?</span>}
                </button>
                <KubectlHint commands={[{ command: `kubectl delete ${resource.definition.kind.toLowerCase()} ${resource.name} -n ${namespace}` }]} />
              </div>
              <div className="w-[1px] h-6 bg-border mx-1" />
            </>
          )}
          {!isEditing && (
            <>
              <KubectlHint commands={[
                { label: 'get', command: `kubectl get ${resource.definition.kind.toLowerCase()} ${resource.name} -n ${namespace}` },
                { label: 'describe', command: `kubectl describe ${resource.definition.kind.toLowerCase()} ${resource.name} -n ${namespace}` },
                { label: 'yaml', command: `kubectl get ${resource.definition.kind.toLowerCase()} ${resource.name} -n ${namespace} -o yaml` },
                ...(resource.definition.kind === 'Pod' ? [
                  { label: 'logs', command: `kubectl logs -f ${resource.name} -n ${namespace}` },
                  { label: 'exec', command: `kubectl exec -it ${resource.name} -n ${namespace} -- sh` },
                ] : []),
                ...(['Deployment', 'StatefulSet'].includes(resource.definition.kind) ? [
                  { label: 'rollout status', command: `kubectl rollout status ${resource.definition.kind.toLowerCase()}/${resource.name} -n ${namespace}` },
                  { label: 'rollout history', command: `kubectl rollout history ${resource.definition.kind.toLowerCase()}/${resource.name} -n ${namespace}` },
                ] : []),
              ]} />
              <button onClick={() => { navigator.clipboard.writeText(yamlStr); toast.success("Copied to clipboard"); }} className="p-2.5 hover:bg-white/5 rounded-xl border border-border text-muted-foreground hover:text-foreground transition-all"><Copy size={18} /></button>
            </>
          )}
          <button onClick={onClose} className="p-2.5 hover:bg-red-500/10 rounded-xl border border-border text-muted-foreground hover:text-red-500 transition-all"><X size={18} /></button>
        </div>
      </div>

      {!isEditing && (
        <div className="flex px-8 pt-4 gap-4 border-b border-border bg-card/30">
          <TabItem active={activeTab === 'yaml'} label="Specifications" onClick={() => setActiveTab('yaml')} />
          {resource.definition.kind === 'Pod' && <TabItem active={activeTab === 'env'} label="Environment" onClick={() => setActiveTab('env')} />}
          {resource.definition.kind === 'Pod' && <TabItem active={activeTab === 'debug'} label="Debug Session" onClick={() => setActiveTab('debug')} />}
          {resource.definition.kind === 'Pod' && <TabItem active={activeTab === 'logs'} label="Full Logs" onClick={() => setActiveTab('logs')} />}
        </div>
      )}

      <div className="flex-1 overflow-auto bg-[#050505] relative custom-scrollbar">
        {loading ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center space-y-4"><Loader2 size={32} className="text-primary animate-spin" /><span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Syncing Telemetry...</span></div>
        ) : isEditing ? (
          <div className="h-full flex flex-col"><textarea value={editContent} onChange={(e) => setEditContent(e.target.value)} spellCheck={false} className="flex-1 w-full bg-transparent text-primary/90 font-mono text-xs leading-relaxed p-8 outline-none resize-none" /><div className="p-4 border-t border-border bg-[#0a0a0a] flex justify-end gap-3"><button onClick={() => setIsEditing(false)} className="px-6 py-2 rounded-xl text-[10px] font-bold text-muted-foreground hover:bg-white/5 uppercase tracking-widest transition-colors">Cancel</button><button onClick={handleSaveYAML} disabled={isProcessing} className="flex items-center gap-2 px-6 py-2 rounded-xl bg-primary text-primary-foreground font-black text-[10px] uppercase tracking-widest hover:bg-primary/90 transition-all disabled:opacity-50">{isProcessing ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}Apply Configuration</button></div></div>
        ) : activeTab === 'yaml' ? (
          <pre className="p-8 font-mono text-xs leading-relaxed text-blue-300/90 selection:bg-primary/30">{yamlStr.split('\n').map((line, i) => (<div key={i} className="flex group"><span className="w-10 shrink-0 text-gray-700 select-none text-right pr-4">{i + 1}</span><span className={line.includes(':') ? 'text-primary/80' : ''}>{line}</span></div>))}</pre>
        ) : activeTab === 'env' ? (
          <div className="p-8 space-y-4 animate-in fade-in slide-in-from-right-2 duration-300">{envVars.length > 0 ? envVars.map((v, i) => (<div key={i} className="flex flex-col p-4 bg-white/[0.02] border border-white/5 rounded-2xl group hover:border-primary/30 transition-colors"><span className="text-[10px] font-black text-primary uppercase tracking-widest mb-1">{v.name}</span><div className="bg-black/40 p-3 rounded-xl font-mono text-xs text-green-400/80 break-all border border-white/5">{v.value}</div></div>)) : <div className="py-20 flex flex-col items-center justify-center text-gray-600 space-y-4"><Info size={40} className="opacity-20" /><span className="font-bold uppercase tracking-widest text-xs">No env vars detected.</span></div>}</div>
        ) : activeTab === 'logs' ? (
          <div className="h-full flex flex-col relative bg-[#0a0a0a]">
            {logsLoading ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center space-y-4 bg-[#0a0a0a]/80 z-10"><Loader2 size={24} className="text-primary animate-spin" /><span className="text-[10px] font-bold text-muted-foreground uppercase">Pulling static logs...</span></div>
            ) : (
              <pre className="p-8 font-mono text-[11px] leading-relaxed text-gray-300/90 selection:bg-primary/30 whitespace-pre-wrap">{staticLogs || 'No log data available for this pod.'}</pre>
            )}
          </div>
        ) : (
          <div className="p-10 space-y-10 animate-in fade-in slide-in-from-right-4 duration-500">
            {/* Active Sessions List */}
            {ephemeralContainers.length > 0 && (
              <div className="space-y-4">
                <h4 className="text-[10px] font-black text-primary uppercase tracking-[0.2em] flex items-center gap-2"><Activity size={14} /> Active Debug Sessions</h4>
                <div className="space-y-2">
                  {ephemeralContainers.map((ec) => (
                    <div key={ec.name} className="flex items-center justify-between p-4 bg-white/[0.03] border border-white/5 rounded-2xl group hover:border-primary/20 transition-all">
                      <div className="flex flex-col">
                        <span className="text-xs font-bold text-foreground">{ec.name}</span>
                        <span className="text-[9px] text-muted-foreground font-mono uppercase">{ec.image}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`text-[8px] font-black px-2 py-0.5 rounded-md uppercase ${ec.state === 'Running' ? 'bg-green-500/20 text-green-500' : 'bg-gray-500/20 text-gray-500'}`}>{ec.state}</span>
                        {ec.state === 'Running' && (
                          <>
                            <KubectlHint commands={[{ command: `kubectl exec -it ${resource.name} -c ${ec.name} -n ${namespace} -- sh` }]} />
                            <button onClick={() => onOpenTerminal(`${namespace}/${resource.name}`, 'exec', ec.name)} className="p-2 hover:bg-primary/20 rounded-lg text-primary transition-colors" title="Reconnect"><Play size={14} /></button>
                            <button onClick={() => handleTerminateSession(ec.name)} className="p-2 hover:bg-red-500/20 rounded-lg text-red-500 transition-colors" title="Terminate"><Trash2 size={14} /></button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-2"><h3 className="text-xl font-black italic uppercase tracking-tighter text-foreground flex items-center gap-2"><Zap size={20} className="text-primary" /> New Debug Session</h3><p className="text-xs text-muted-foreground font-medium leading-relaxed">기존 파드에 임시 컨테이너를 주입하여 라이브 디버깅을 시작합니다.<br/>주의: 한 번 주입된 컨테이너는 파드가 종료될 때까지 제거할 수 없습니다.</p></div>
            <div className="glass-card rounded-3xl p-8 space-y-6">
              <div className="space-y-4"><span className="text-[10px] font-black text-primary uppercase tracking-[0.2em]">Select Debug Tooling</span><div className="grid grid-cols-1 gap-3"><ImageOption active={debugImage === 'busybox:latest'} label="Busybox (Standard)" desc="Minimal shell with basic utils" onClick={() => setDebugImage('busybox:latest')} /><ImageOption active={debugImage === 'nicolaka/netshoot:latest'} label="Netshoot (Network)" desc="Powerful set of network troubleshooting tools" onClick={() => setDebugImage('nicolaka/netshoot:latest')} /><ImageOption active={debugImage === 'curlimages/curl:latest'} label="Curl (API)" desc="Focused on HTTP/API interaction tests" onClick={() => setDebugImage('curlimages/curl:latest')} /></div></div>
              <div className="flex items-center gap-2">
                <button onClick={handleInjectDebug} disabled={isInjecting} className="flex-1 py-4 bg-primary text-primary-foreground rounded-2xl font-black uppercase tracking-[0.2em] text-xs hover:scale-[1.02] active:scale-95 transition-all shadow-[0_0_30px_rgba(59,130,246,0.3)] disabled:opacity-50 flex items-center justify-center gap-3">{isInjecting ? <Loader2 size={18} className="animate-spin" /> : <TerminalIcon size={18} />}{isInjecting ? 'Injecting System...' : 'Initiate Debug Session'}</button>
                <KubectlHint commands={[{ command: `kubectl debug -it ${resource.name} -n ${namespace} --image=${debugImage} --target=$(kubectl get pod ${resource.name} -n ${namespace} -o jsonpath='{.spec.containers[0].name}')` }]} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Quick Scale UI */}
      {!isEditing && showScale && (
        <div className="p-6 bg-white/[0.02] border-t border-border space-y-3">
          <div className="flex justify-between items-end"><div className="flex items-center gap-2 text-primary"><Sliders size={14} /><span className="text-[10px] font-black uppercase tracking-widest">Replicas</span></div><div className="text-xs font-mono"><span className="text-green-500 font-bold">{readyReplicas}</span><span className="text-gray-600 mx-1">/</span><span className="text-primary font-bold">{pendingReplicas}</span></div></div>
          <div className="flex items-center gap-4">
            <input type="range" min="0" max="20" value={pendingReplicas} onChange={(e) => setPendingReplicas(parseInt(e.target.value))} className="flex-1 h-1.5 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary" />
            {pendingReplicas !== originalReplicas && (
              <div className="flex items-center gap-1">
                <button onClick={handleApplyScale} disabled={isProcessing} className="px-3 py-1 bg-primary text-primary-foreground text-[9px] font-black uppercase rounded-lg hover:scale-105 transition-all shadow-[0_0_15px_rgba(59,130,246,0.3)]">Apply</button>
                <KubectlHint commands={[{ command: `kubectl scale ${resource.definition.kind.toLowerCase()}/${resource.name} --replicas=${pendingReplicas} -n ${namespace}` }]} />
              </div>
            )}
          </div>
        </div>
      )}
    </motion.div>
  );
};

const ImageOption = ({ active, label, desc, onClick }: any) => (
  <button onClick={onClick} className={`text-left p-4 rounded-2xl border transition-all ${active ? 'bg-primary/10 border-primary ring-1 ring-primary/30 shadow-[inset_0_0_20px_rgba(59,130,246,0.1)]' : 'bg-white/[0.02] border-white/5 hover:border-white/10'}`}>
    <div className="flex flex-col"><span className={`text-xs font-black uppercase tracking-widest ${active ? 'text-primary' : 'text-foreground'}`}>{label}</span><span className="text-[10px] text-muted-foreground mt-1">{desc}</span></div>
  </button>
);

const TabItem = ({ active, label, onClick }: any) => (
  <button onClick={onClick} className={`pb-3 px-2 text-[10px] font-black uppercase tracking-[0.2em] transition-all relative ${active ? 'text-primary' : 'text-gray-600 hover:text-gray-400'}`}>{label}{active && <motion.div layoutId="tab-underline" className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary shadow-[0_0_10px_hsl(var(--primary))]" />}</button>
);

export default ResourceDetail;
