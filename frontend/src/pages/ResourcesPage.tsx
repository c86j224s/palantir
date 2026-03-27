import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { RefreshCw, Hash, Server, Globe } from 'lucide-react';
import { ResourceDefinition } from '../App';

interface ResourceInfo {
  name: string;
  namespace: string;
  kind: string;
  status: string;
}

interface Props {
  definition: ResourceDefinition;
  namespace: string;
  onViewDetail: (name: string) => void;
}

const ResourcesPage = ({ definition, namespace, onViewDetail }: Props) => {
  const [resources, setResources] = useState<ResourceInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchResources = async () => {
    setLoading(true);
    setError(null);
    try {
      // 범용 리소스 조회 커맨드 사용
      const data = await invoke<ResourceInfo[]>('get_resources_generic', { 
        namespace,
        group: definition.group,
        version: definition.version,
        kind: definition.kind
      });
      setResources(data);
    } catch (err) {
      console.error(`Failed to fetch ${definition.kind}:`, err);
      setError(`Failed to fetch ${definition.kind}.`);
      setResources([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchResources();
  }, [definition, namespace]);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex items-end justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-primary font-bold text-xs uppercase tracking-[0.2em]">
            <div className="w-4 h-[1px] bg-primary" />
            Registry
          </div>
          <h1 className="text-4xl font-black tracking-tighter uppercase italic">{definition.label}</h1>
        </div>
        <button 
          onClick={fetchResources}
          disabled={loading}
          className="flex items-center gap-2 bg-white/[0.03] hover:bg-white/[0.08] px-6 py-3 rounded-2xl border border-white/10 transition-all active:scale-95 disabled:opacity-50 font-bold text-sm tracking-tight shadow-xl"
        >
          <RefreshCw size={18} className={loading ? 'animate-spin text-primary' : ''} />
          <span>Sync Registry</span>
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
                <th className="px-8 py-6 text-right">Reference</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.03]">
              {resources.map((res) => (
                <tr 
                  key={res.name} 
                  className="hover:bg-white/[0.02] transition-colors group cursor-pointer"
                  onClick={() => onViewDetail(res.name)}
                >
                  <td className="px-8 py-5">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-white/[0.03] flex items-center justify-center group-hover:bg-primary/10 group-hover:ring-1 ring-primary/30 transition-all">
                        <Hash size={16} className="text-gray-600 group-hover:text-primary" />
                      </div>
                      <div className="flex flex-col">
                        <span className="font-mono text-sm font-bold text-gray-200 group-hover:text-white transition-colors">{res.name}</span>
                        <span className="text-[10px] text-gray-600 font-bold uppercase tracking-widest">KIND: {res.kind}</span>
                      </div>
                    </div>
                  </td>
                  <td className="px-8 py-5">
                    <div className="inline-flex items-center px-3 py-1 rounded-full bg-white/[0.03] border border-white/5 text-[10px] font-black text-gray-500 uppercase tracking-tighter">
                      {res.namespace}
                    </div>
                  </td>
                  <td className="px-8 py-5">
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full bg-primary/50" />
                      <span className="text-xs font-black uppercase tracking-widest text-gray-400">{res.status}</span>
                    </div>
                  </td>
                  <td className="px-8 py-5 text-right font-mono text-[10px] text-gray-600">
                    ID_{res.name.substring(0, 6).toUpperCase()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {resources.length === 0 && !loading && (
            <div className="py-20 text-center text-gray-600 font-bold uppercase tracking-widest text-xs">
              No entries found in this sector.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ResourcesPage;
