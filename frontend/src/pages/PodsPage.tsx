import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { RefreshCw, Play, Hash, Terminal as TerminalIcon, Trash2, Info, Loader2 } from 'lucide-react';

interface PodInfo {
  name: string;
  namespace: string;
  status: string;
  node: string;
}

interface Props {
  namespace: string;
  deletingResources: string[];
  onOpenTerminal: (podId: string, type: 'exec' | 'logs') => void;
  onViewDetail: (name: string) => void;
}

const PodsPage = ({ namespace, deletingResources, onOpenTerminal, onViewDetail }: Props) => {
  const [pods, setPods] = useState<PodInfo[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPods = async () => {
    setLoading(true);
    try {
      const data = await invoke<PodInfo[]>('get_pods', { namespace });
      setPods(data);
    } catch (err) {
      console.error('K8s Connection Error:', err);
      setPods([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPods();
  }, [namespace]);

  return (
    <div className="space-y-8 relative">
      <div className="flex items-end justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-primary font-bold text-xs uppercase tracking-[0.2em]">
            <div className="w-4 h-[1px] bg-primary" />
            Live Telemetry
          </div>
          <h1 className="text-4xl font-black tracking-tighter uppercase italic text-foreground">Pods</h1>
        </div>
        <button 
          onClick={fetchPods}
          disabled={loading}
          className="flex items-center gap-2 bg-white/[0.03] hover:bg-white/[0.08] px-6 py-3 rounded-2xl border border-white/10 transition-all active:scale-95 disabled:opacity-50 font-bold text-sm tracking-tight shadow-xl"
        >
          <RefreshCw size={18} className={loading ? 'animate-spin text-primary' : ''} />
          <span>Sync Cluster</span>
        </button>
      </div>

      <div className="glass-card rounded-[2rem] overflow-hidden">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-white/[0.02] text-gray-500 text-[10px] font-black uppercase tracking-[0.15em] border-b border-white/5">
                <th className="px-8 py-6">Identity</th>
                <th className="px-8 py-6">Domain</th>
                <th className="px-8 py-6">Condition</th>
                <th className="px-8 py-6">Location</th>
                <th className="px-8 py-6 text-right">Operations</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.03]">
              {pods.map((pod) => {
                const isDeleting = deletingResources.includes(pod.name);
                return (
                  <tr 
                    key={pod.name} 
                    className={`transition-all group cursor-pointer ${isDeleting ? 'opacity-40 grayscale pointer-events-none' : 'hover:bg-white/[0.02]'}`}
                    onClick={() => !isDeleting && onViewDetail(pod.name)}
                  >
                    <td className="px-8 py-5">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl bg-white/[0.03] flex items-center justify-center group-hover:bg-primary/10 group-hover:ring-1 ring-primary/30 transition-all">
                          {isDeleting ? <Loader2 size={16} className="animate-spin text-red-500" /> : <Hash size={16} className="text-gray-600 group-hover:text-primary" />}
                        </div>
                        <div className="flex flex-col">
                          <span className={`font-mono text-sm font-bold transition-colors ${isDeleting ? 'text-red-400' : 'text-gray-200 group-hover:text-white'}`}>{pod.name}</span>
                          <span className="text-[10px] text-gray-600 font-bold uppercase tracking-widest">
                            {isDeleting ? 'TERMINATING...' : `UUID: ${pod.name.split('-').pop()}`}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-5">
                      <div className="inline-flex items-center px-3 py-1 rounded-full bg-white/[0.03] border border-white/5 text-[10px] font-black text-gray-500 uppercase tracking-tighter">
                        {pod.namespace}
                      </div>
                    </td>
                    <td className="px-8 py-5">
                      <div className="flex items-center gap-3">
                        <div className={`w-2.5 h-2.5 rounded-full border-2 border-[#030303] ${
                          isDeleting ? 'bg-red-500 animate-pulse' : 
                          pod.status === 'Running' ? 'bg-green-500 status-glow-green' : 
                          pod.status === 'Pending' ? 'bg-yellow-500 status-glow-yellow' : 
                          'bg-red-500 status-glow-red'
                        }`} />
                        <span className={`text-xs font-black uppercase tracking-widest ${
                          isDeleting ? 'text-red-500' :
                          pod.status === 'Running' ? 'text-green-500/80' : 
                          pod.status === 'Pending' ? 'text-yellow-500/80' : 
                          'text-red-500/80'
                        }`}>{isDeleting ? 'Terminating' : pod.status}</span>
                      </div>
                    </td>
                    <td className="px-8 py-5 font-mono text-xs text-gray-500 font-bold">
                      {pod.node}
                    </td>
                    <td className="px-8 py-5 text-right">
                      <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 translate-x-2 group-hover:translate-x-0 transition-all duration-300" onClick={e => e.stopPropagation()}>
                        <ActionBtn icon={<TerminalIcon size={14} />} color="text-primary" onClick={() => onOpenTerminal(`${pod.namespace}/${pod.name}`, 'exec')} />
                        <ActionBtn icon={<Info size={14} />} color="text-gray-400" onClick={() => onViewDetail(pod.name)} />
                        <ActionBtn icon={<Trash2 size={14} />} color="text-red-500" onClick={() => {}} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

const ActionBtn = ({ icon, color, onClick }: { icon: any, color: string, onClick: () => void }) => (
  <button 
    onClick={onClick}
    className={`p-2.5 hover:bg-white/[0.05] rounded-xl border border-white/5 transition-all active:scale-90 ${color}`}
  >
    {icon}
  </button>
);

export default PodsPage;
