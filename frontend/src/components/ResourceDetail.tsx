import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, Copy, Check, Trash2, Edit2, Save, ShieldAlert, 
  Braces, RefreshCw, Sliders, Loader2, AlertCircle, Info
} from 'lucide-react';
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
}

// K8s 에러 메시지를 한글로 친절하게 변환하는 유틸리티 (Agent C 승인안)
const translateK8sError = (err: string): string => {
  if (err.includes("pod updates may not change fields other than")) {
    return "파드의 설정(환경변수, 커맨드 등)은 생성 후 수정할 수 없습니다. 설정을 바꾸려면 파드를 삭제 후 재생성하거나, 상위 리소스(Deployment 등)의 YAML을 수정하세요.";
  }
  if (err.includes("metadata.managedFields must be nil")) {
    return "시스템 관리 필드 충돌이 발생했습니다. 백엔드에서 정제 처리를 시도했으나 실패했습니다.";
  }
  if (err.includes("Forbidden")) {
    return "권한이 없거나 쿠버네티스 제약 사항으로 인해 거부되었습니다.";
  }
  return err;
};

const ResourceDetail: React.FC<Props> = ({ resource, namespace, onClose, onUpdated, onDeleted, onDeleteStart }) => {
  const [yamlStr, setYamlStr] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [copied, setCopying] = useState(false);
  const [activeTab, setActiveTab] = useState<'yaml' | 'env'>('yaml');
  
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  
  const [originalReplicas, setOriginalReplicas] = useState<number>(0);
  const [pendingReplicas, setPendingReplicas] = useState<number>(0);
  const [readyReplicas, setReadyReplicas] = useState<number>(0);
  
  const [deleteConfirmPhase, setDeleteConfirmPhase] = useState(0);

  useEffect(() => {
    fetchResourceData();
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
      success: () => {
        setYamlStr(editContent);
        setIsEditing(false);
        onUpdated();
        return 'Configuration applied successfully';
      },
      error: (err) => {
        const msg = translateK8sError(String(err));
        return `Apply failed: ${msg}`;
      },
      finally: () => setIsProcessing(false)
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
      success: () => {
        setOriginalReplicas(pendingReplicas);
        onUpdated();
        return `Resource scaled to ${pendingReplicas}`;
      },
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
      success: () => {
        onUpdated();
        fetchResourceData();
        return 'Rollout restart triggered successfully';
      },
      error: (err) => `Restart failed: ${translateK8sError(String(err))}`,
      finally: () => setIsProcessing(false)
    });
  };

  const handleDelete = async () => {
    if (deleteConfirmPhase === 0) {
      setDeleteConfirmPhase(1);
      setTimeout(() => setDeleteConfirmPhase(p => p === 1 ? 0 : p), 3000);
      return;
    }
    setDeleteConfirmPhase(2);
    onDeleteStart(); // 목록 UI에 삭제 시작 알림
    const promise = invoke('delete_resource_generic', {
      namespace, group: resource.definition.group, version: resource.definition.version,
      kind: resource.definition.kind, name: resource.name
    });

    toast.promise(promise, {
      loading: `Deleting ${resource.name}...`,
      success: () => {
        onDeleted();
        onClose();
        return `${resource.name} deleted`;
      },
      error: (err) => {
        setDeleteConfirmPhase(0);
        return `Delete failed: ${translateK8sError(String(err))}`;
      }
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
  const showRestart = ['Deployment', 'StatefulSet', 'DaemonSet'].includes(resource.definition.kind);

  return (
    <motion.div
      initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      className="fixed top-0 right-0 bottom-0 w-full max-w-3xl bg-card border-l border-border shadow-2xl z-[150] flex flex-col"
    >
      {/* Header */}
      <div className="h-20 flex items-center justify-between px-8 border-b border-border bg-background/50 backdrop-blur-md">
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
              <button onClick={handleDelete} disabled={deleteConfirmPhase === 2} className={`flex items-center gap-2 p-2.5 rounded-xl border transition-all ${deleteConfirmPhase === 1 ? 'bg-red-500/20 border-red-500/50 text-red-500 font-bold px-4' : 'border-border text-muted-foreground hover:text-red-500 hover:bg-white/5'}`}>
                {deleteConfirmPhase === 2 ? <Loader2 size={18} className="animate-spin" /> : <Trash2 size={18} />}
                {deleteConfirmPhase === 1 && <span className="text-xs uppercase tracking-widest">Confirm?</span>}
              </button>
              <div className="w-[1px] h-6 bg-border mx-1" />
            </>
          )}
          {!isEditing && <button onClick={() => { navigator.clipboard.writeText(yamlStr); toast.success("Copied to clipboard"); }} className="p-2.5 hover:bg-white/5 rounded-xl border border-border text-muted-foreground hover:text-foreground transition-all"><Copy size={18} /></button>}
          <button onClick={onClose} className="p-2.5 hover:bg-red-500/10 rounded-xl border border-border text-muted-foreground hover:text-red-500 transition-all"><X size={18} /></button>
        </div>
      </div>

      {/* Pod Immutability Warning Banner (Agent A 제안) */}
      {isEditing && resource.definition.kind === 'Pod' && (
        <div className="bg-yellow-500/10 border-b border-yellow-500/20 px-8 py-3 flex items-start gap-3 animate-in slide-in-from-top-1">
          <AlertCircle size={16} className="text-yellow-500 shrink-0 mt-0.5" />
          <div className="flex flex-col">
            <span className="text-[10px] font-bold text-yellow-500 uppercase tracking-widest">Pod Immutability Warning</span>
            <span className="text-xs text-yellow-200/80 leading-relaxed font-medium">파드는 생성 후 대부분의 설정이 불변입니다. 이미지 외 필드 수정 시 에러가 발생할 수 있습니다.</span>
          </div>
        </div>
      )}

      {/* Quick Actions (Scale & Restart) */}
      {!isEditing && (showScale || showRestart) && (
        <div className="p-6 bg-white/[0.02] border-b border-border grid grid-cols-1 md:grid-cols-2 gap-6">
          {showScale && (
            <div className="space-y-3">
              <div className="flex justify-between items-end">
                <div className="flex items-center gap-2 text-primary">
                  <Sliders size={14} />
                  <span className="text-[10px] font-black uppercase tracking-widest">Replicas</span>
                </div>
                <div className="text-xs font-mono">
                  <span className="text-green-500 font-bold">{readyReplicas}</span>
                  <span className="text-gray-600 mx-1">/</span>
                  <span className="text-primary font-bold">{pendingReplicas}</span>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <input 
                  type="range" min="0" max="20" 
                  value={pendingReplicas} 
                  onChange={(e) => setPendingReplicas(parseInt(e.target.value))}
                  className="flex-1 h-1.5 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary"
                />
                {pendingReplicas !== originalReplicas && (
                  <button 
                    onClick={handleApplyScale}
                    disabled={isProcessing}
                    className="px-3 py-1 bg-primary text-primary-foreground text-[9px] font-black uppercase rounded-lg hover:scale-105 transition-all shadow-[0_0_15px_rgba(59,130,246,0.3)]"
                  >
                    Apply
                  </button>
                )}
              </div>
            </div>
          )}
          {showRestart && (
            <div className="flex flex-col justify-end">
              <button 
                onClick={handleRestart}
                disabled={isProcessing}
                className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl border border-primary/20 bg-primary/5 hover:bg-primary/10 text-primary transition-all group"
              >
                <RefreshCw size={14} className={isProcessing ? 'animate-spin' : 'group-hover:rotate-180 transition-transform duration-500'} />
                <span className="text-[10px] font-black uppercase tracking-widest">Rollout Restart</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Tabs */}
      {!isEditing && (
        <div className="flex px-8 pt-4 gap-4 border-b border-border bg-card/30">
          <TabItem active={activeTab === 'yaml'} label="Specifications" onClick={() => setActiveTab('yaml')} />
          {resource.definition.kind === 'Pod' && <TabItem active={activeTab === 'env'} label="Environment" onClick={() => setActiveTab('env')} />}
        </div>
      )}

      {/* Content Area */}
      <div className="flex-1 overflow-auto bg-[#050505] relative">
        {loading ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center space-y-4">
            <Loader2 size={32} className="text-primary animate-spin" />
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Syncing Telemetry...</span>
          </div>
        ) : isEditing ? (
          <div className="h-full flex flex-col">
            <textarea value={editContent} onChange={(e) => setEditContent(e.target.value)} spellCheck={false} className="flex-1 w-full bg-transparent text-primary/90 font-mono text-xs leading-relaxed p-8 outline-none resize-none" />
            <div className="p-4 border-t border-border bg-[#0a0a0a] flex justify-end gap-3">
              <button onClick={() => setIsEditing(false)} className="px-6 py-2 rounded-xl text-[10px] font-bold text-muted-foreground hover:bg-white/5 uppercase tracking-widest transition-colors">Cancel</button>
              <button onClick={handleSaveYAML} disabled={isProcessing} className="flex items-center gap-2 px-6 py-2 rounded-xl bg-primary text-primary-foreground font-black text-[10px] uppercase tracking-widest hover:bg-primary/90 transition-all disabled:opacity-50">
                {isProcessing ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                Apply Configuration
              </button>
            </div>
          </div>
        ) : activeTab === 'yaml' ? (
          <pre className="p-8 font-mono text-xs leading-relaxed text-blue-300/90 selection:bg-primary/30">
            {yamlStr.split('\n').map((line, i) => (
              <div key={i} className="flex group"><span className="w-10 shrink-0 text-gray-700 select-none text-right pr-4">{i + 1}</span><span className={line.includes(':') ? 'text-primary/80' : ''}>{line}</span></div>
            ))}
          </pre>
        ) : (
          <div className="p-8 space-y-4 animate-in fade-in slide-in-from-right-2 duration-300">
            {envVars.length > 0 ? envVars.map((v, i) => (
              <div key={i} className="flex flex-col p-4 bg-white/[0.02] border border-white/5 rounded-2xl group hover:border-primary/30 transition-colors">
                <span className="text-[10px] font-black text-primary uppercase tracking-widest mb-1">{v.name}</span>
                <div className="bg-black/40 p-3 rounded-xl font-mono text-xs text-green-400/80 break-all border border-white/5">{v.value}</div>
              </div>
            )) : (
              <div className="py-20 flex flex-col items-center justify-center text-gray-600 space-y-4">
                <Info size={40} className="opacity-20" />
                <span className="font-bold uppercase tracking-widest text-xs">No environment variables detected.</span>
              </div>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
};

const TabItem = ({ active, label, onClick }: any) => (
  <button onClick={onClick} className={`pb-3 px-2 text-[10px] font-black uppercase tracking-[0.2em] transition-all relative ${active ? 'text-primary' : 'text-gray-600 hover:text-gray-400'}`}>{label}{active && <motion.div layoutId="tab-underline" className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary shadow-[0_0_10px_hsl(var(--primary))]" />}</button>
);

export default ResourceDetail;
