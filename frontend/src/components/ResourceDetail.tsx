import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Copy, Check, FileCode, Search, Terminal, Globe, Shield, Braces } from 'lucide-react';
import { invoke } from '@tauri-apps/api/tauri';
import { ResourceDefinition } from '../App';

interface Props {
  resource: { name: string, definition: ResourceDefinition };
  namespace: string;
  onClose: () => void;
}

const ResourceDetail: React.FC<Props> = ({ resource, namespace, onClose }) => {
  const [yaml, setYaml] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [copied, setCopying] = useState(false);
  const [activeTab, setActiveTab] = useState<'yaml' | 'env'>('yaml');

  useEffect(() => {
    const fetchYaml = async () => {
      setLoading(true);
      try {
        const data = await invoke<string>('get_resource_yaml', {
          namespace,
          group: resource.definition.group,
          version: resource.definition.version,
          kind: resource.definition.kind,
          name: resource.name
        });
        setYaml(data);
      } catch (err) {
        setYaml(`--- \n# Error fetching YAML: ${err}`);
      } finally {
        setLoading(false);
      }
    };
    fetchYaml();
  }, [resource, namespace]);

  // YAML에서 환경 변수 파싱 (간이 Describe 기능)
  const envVars = useMemo(() => {
    if (!yaml || resource.definition.kind !== 'Pod') return [];
    
    // 정규표현식으로 env: 섹션 하위의 name/value 쌍 추출 시도
    // (완벽한 파싱을 위해서는 yaml 라이브러리가 필요하지만, 가독성을 위해 간단히 구현)
    const vars: {name: string, value: string}[] = [];
    const lines = yaml.split('\n');
    let inEnvSection = false;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line === 'env:') inEnvSection = true;
      else if (inEnvSection && line.startsWith('- name:')) {
        const name = line.replace('- name:', '').trim();
        const valueLine = lines[i+1]?.trim() || '';
        if (valueLine.startsWith('value:')) {
          const value = valueLine.replace('value:', '').trim();
          vars.push({ name, value });
        }
      }
      // 대략적인 섹션 종료 판별 (들여쓰기 기준)
      if (inEnvSection && line === '' && i > 0) inEnvSection = false;
    }
    return vars;
  }, [yaml, resource.definition.kind]);

  const copyToClipboard = () => {
    const text = activeTab === 'yaml' ? yaml : JSON.stringify(envVars, null, 2);
    navigator.clipboard.writeText(text);
    setCopying(true);
    setTimeout(() => setCopying(false), 2000);
  };

  return (
    <motion.div
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
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
          <button onClick={copyToClipboard} className="p-2.5 hover:bg-white/5 rounded-xl border border-border text-muted-foreground hover:text-foreground transition-all">
            {copied ? <Check size={18} className="text-green-500" /> : <Copy size={18} />}
          </button>
          <button onClick={onClose} className="p-2.5 hover:bg-red-500/10 rounded-xl border border-border text-muted-foreground hover:text-red-500 transition-all">
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex px-8 pt-4 gap-4 border-b border-border bg-card/30">
        <TabItem active={activeTab === 'yaml'} label="Specifications (YAML)" onClick={() => setActiveTab('yaml')} />
        {resource.definition.kind === 'Pod' && (
          <TabItem active={activeTab === 'env'} label="Environment" onClick={() => setActiveTab('env')} />
        )}
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-auto p-8 custom-scrollbar bg-[#050505]">
        {loading ? (
          <div className="h-full flex flex-col items-center justify-center space-y-4">
            <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Accessing Cluster Data...</span>
          </div>
        ) : activeTab === 'yaml' ? (
          <pre className="font-mono text-xs leading-relaxed text-blue-300/90 selection:bg-primary/30">
            {yaml.split('\n').map((line, i) => (
              <div key={i} className="flex group">
                <span className="w-10 shrink-0 text-gray-700 select-none text-right pr-4">{i + 1}</span>
                <span className={line.includes(':') ? 'text-primary/80' : ''}>{line}</span>
              </div>
            ))}
          </pre>
        ) : (
          <div className="space-y-4">
            {envVars.length > 0 ? envVars.map((v, i) => (
              <div key={i} className="flex flex-col p-4 bg-white/[0.02] border border-white/5 rounded-2xl group hover:border-primary/30 transition-colors">
                <span className="text-[10px] font-black text-primary uppercase tracking-[0.2em] mb-1">Key</span>
                <span className="font-mono text-sm text-gray-200 mb-3">{v.name}</span>
                <span className="text-[10px] font-black text-gray-600 uppercase tracking-[0.2em] mb-1">Value</span>
                <div className="bg-black/40 p-3 rounded-xl font-mono text-xs text-green-400/80 break-all border border-white/5">
                  {v.value}
                </div>
              </div>
            )) : (
              <div className="py-20 text-center text-gray-600 font-bold uppercase tracking-widest text-xs">
                No environment variables detected in this pod.
              </div>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
};

const TabItem = ({ active, label, onClick }: any) => (
  <button 
    onClick={onClick}
    className={`pb-3 px-2 text-[10px] font-black uppercase tracking-[0.2em] transition-all relative ${
      active ? 'text-primary' : 'text-gray-600 hover:text-gray-400'
    }`}
  >
    {label}
    {active && <motion.div layoutId="tab-underline" className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary shadow-[0_0_10px_hsl(var(--primary))]" />}
  </button>
);

export default ResourceDetail;
