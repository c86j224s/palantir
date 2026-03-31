import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Layers, Package, FileCode, Search, RefreshCw, ChevronRight, 
  ExternalLink, Copy, Check, FolderOpen, Play, AlertCircle, Loader2, Braces
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/tauri';
import { open } from '@tauri-apps/api/dialog';
import { toast } from 'sonner';

interface HelmRelease {
  name: string;
  namespace: string;
  version: number;
  status: string;
  chart: {
    metadata: {
      name: string;
      version: string;
      app_version?: string;
    };
  };
}

const HelmPage: React.FC<{ namespace: string }> = ({ namespace }) => {
  const [activeTab, setActiveTab] = useState<'live' | 'local'>('live');
  const [releases, setReleases] = useState<HelmRelease[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedRelease, setSelectedRelease] = useState<HelmRelease | null>(null);
  const [manifest, setManifest] = useState<string>('');
  const [manifestLoading, setManifestLoading] = useState(false);

  // Local Preview States
  const [localChartPath, setLocalChartPath] = useState<string>('');
  const [localValuesPaths, setLocalValuesPaths] = useState<string[]>([]);
  const [localPreview, setLocalPreview] = useState<string>('');
  const [previewLoading, setPreviewLoading] = useState(false);

  useEffect(() => {
    if (activeTab === 'live') fetchReleases();
  }, [activeTab, namespace]);

  const fetchReleases = async () => {
    setLoading(true);
    try {
      const data = await invoke<HelmRelease[]>('get_helm_releases', { namespace: namespace === 'all' ? null : namespace });
      setReleases(data);
    } catch (err) {
      toast.error("Failed to fetch Helm releases");
    } finally {
      setLoading(false);
    }
  };

  const fetchManifest = async (rel: HelmRelease) => {
    setSelectedRelease(rel);
    setManifestLoading(true);
    try {
      const data = await invoke<string>('get_helm_manifest', { 
        namespace: rel.namespace, 
        name: rel.name, 
        revision: rel.version 
      });
      setManifest(data);
    } catch (err) {
      toast.error("Failed to fetch manifest");
    } finally {
      setManifestLoading(false);
    }
  };

  const handlePickChart = async () => {
    const selected = await open({ directory: true, multiple: false });
    if (selected && typeof selected === 'string') setLocalChartPath(selected);
  };

  const handlePickValues = async () => {
    const selected = await open({ filters: [{ name: 'YAML', extensions: ['yaml', 'yml'] }], multiple: true });
    if (selected) {
      const paths = Array.isArray(selected) ? selected : [selected];
      setLocalValuesPaths(prev => [...new Set([...prev, ...paths])]);
    }
  };

  const handleRunPreview = async () => {
    if (!localChartPath) return toast.error("Select a chart directory first");
    setPreviewLoading(true);
    try {
      const data = await invoke<string>('preview_helm_template', {
        chartPath: localChartPath,
        valuesPaths: localValuesPaths,
        namespace
      });
      setLocalPreview(data);
      toast.success("Template compiled successfully");
    } catch (err) {
      setLocalPreview(`Error: ${err}`);
      toast.error("Template compilation failed");
    } finally {
      setPreviewLoading(false);
    }
  };

  return (
    <div className="h-full flex flex-col space-y-8 animate-in fade-in duration-500">
      <header className="flex flex-col space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center shadow-lg shadow-primary/5">
              <Layers size={24} className="text-primary" />
            </div>
            <div>
              <h1 className="text-3xl font-black tracking-tighter uppercase italic">Helm Dashboard</h1>
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-widest opacity-60">Package Management & Template Preview</p>
            </div>
          </div>
          <div className="flex bg-secondary/30 p-1 rounded-xl border border-white/5">
            <button onClick={() => setActiveTab('live')} className={`px-6 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'live' ? 'bg-primary text-primary-foreground shadow-lg' : 'text-muted-foreground hover:text-foreground'}`}>Deployed Releases</button>
            <button onClick={() => setActiveTab('local')} className={`px-6 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'local' ? 'bg-primary text-primary-foreground shadow-lg' : 'text-muted-foreground hover:text-foreground'}`}>Local Preview</button>
          </div>
        </div>
      </header>

      <div className="flex-1 min-h-0 flex gap-8">
        {activeTab === 'live' ? (
          <>
            {/* Release List */}
            <div className="w-1/3 flex flex-col space-y-4">
              <div className="flex items-center justify-between px-2">
                <span className="text-[10px] font-black text-primary uppercase tracking-[0.2em]">Active Releases ({releases.length})</span>
                <button onClick={fetchReleases} className="p-2 hover:bg-white/5 rounded-lg transition-colors"><RefreshCw size={14} className={loading ? 'animate-spin' : ''} /></button>
              </div>
              <div className="flex-1 overflow-auto custom-scrollbar space-y-2 pr-2">
                {releases.map(rel => (
                  <button 
                    key={`${rel.name}-${rel.version}`} 
                    onClick={() => fetchManifest(rel)}
                    className={`w-full text-left p-4 rounded-2xl border transition-all group ${selectedRelease?.name === rel.name ? 'bg-primary/10 border-primary/40 shadow-[inset_0_0_20px_rgba(59,130,246,0.1)]' : 'bg-white/[0.02] border-white/5 hover:border-white/10'}`}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <span className={`text-sm font-black tracking-tight ${selectedRelease?.name === rel.name ? 'text-primary' : 'text-foreground'}`}>{rel.name}</span>
                      <span className="text-[8px] font-black px-2 py-0.5 rounded bg-white/5 text-muted-foreground uppercase">v{rel.version}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-[9px] font-black px-2 py-0.5 rounded-md uppercase ${rel.status === 'deployed' ? 'bg-green-500/20 text-green-500' : 'bg-yellow-500/20 text-yellow-500'}`}>{rel.status}</span>
                      <span className="text-[9px] text-muted-foreground font-mono">{rel.chart.metadata.name}:{rel.chart.metadata.version}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Manifest Viewer */}
            <div className="flex-1 flex flex-col bg-black/40 rounded-3xl border border-white/5 overflow-hidden">
              <div className="p-6 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
                <div className="flex items-center gap-3">
                  <FileCode size={18} className="text-primary" />
                  <span className="text-xs font-black uppercase tracking-widest">{selectedRelease ? `Compiled Manifest: ${selectedRelease.name}` : 'Select a release to view manifest'}</span>
                </div>
                {manifest && (
                  <button onClick={() => { navigator.clipboard.writeText(manifest); toast.success("Copied to clipboard"); }} className="p-2 hover:bg-white/10 rounded-lg text-muted-foreground transition-colors"><Copy size={16} /></button>
                )}
              </div>
              <div className="flex-1 overflow-auto custom-scrollbar relative bg-[#050505]">
                {manifestLoading ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center space-y-4">
                    <Loader2 size={32} className="text-primary animate-spin" />
                    <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Decompressing Helm Secret...</span>
                  </div>
                ) : manifest ? (
                  <pre className="p-8 font-mono text-[11px] leading-relaxed text-blue-300/80">
                    {manifest.split('\n').map((line, i) => (
                      <div key={i} className="flex group">
                        <span className="w-12 shrink-0 text-gray-700 select-none text-right pr-6">{i + 1}</span>
                        <span className={line.startsWith('---') || line.includes(':') ? 'text-primary/90' : ''}>{line}</span>
                      </div>
                    ))}
                  </pre>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-gray-600 space-y-4 opacity-30">
                    <Package size={64} />
                    <span className="text-xs font-black uppercase tracking-widest">No Manifest Loaded</span>
                  </div>
                )}
              </div>
            </div>
          </>
        ) : (
          /* Local Preview Track */
          <div className="flex-1 flex gap-8">
            {/* Configuration Panel */}
            <div className="w-1/3 flex flex-col space-y-6">
              <div className="glass-card rounded-3xl p-8 space-y-6">
                <div className="space-y-4">
                  <h3 className="text-xs font-black text-primary uppercase tracking-[0.2em] flex items-center gap-2">
                    <FolderOpen size={14} /> Chart Configuration
                  </h3>
                  <div className="space-y-2">
                    <label className="text-[9px] font-black text-muted-foreground uppercase tracking-widest ml-1">Chart Directory</label>
                    <div className="flex gap-2">
                      <input readOnly value={localChartPath} placeholder="Select folder..." className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-primary font-mono truncate" />
                      <button onClick={handlePickChart} className="p-2.5 bg-secondary/50 hover:bg-secondary rounded-xl border border-white/10 transition-all"><FolderOpen size={16} /></button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center ml-1">
                      <label className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">Value Files</label>
                      <button onClick={() => setLocalValuesPaths([])} className="text-[8px] text-red-500/60 hover:text-red-500 font-bold uppercase tracking-tighter">Clear All</button>
                    </div>
                    <div className="space-y-2">
                      {localValuesPaths.map((p, i) => (
                        <div key={i} className="flex items-center justify-between p-2 bg-white/[0.03] border border-white/5 rounded-lg group">
                          <span className="text-[10px] text-muted-foreground font-mono truncate max-w-[200px]">{p.split('/').pop()}</span>
                          <button onClick={() => setLocalValuesPaths(prev => prev.filter((_, idx) => idx !== i))} className="p-1 text-gray-600 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all">×</button>
                        </div>
                      ))}
                      <button onClick={handlePickValues} className="w-full py-2 border border-dashed border-white/10 rounded-xl text-[9px] font-bold text-muted-foreground hover:border-primary/30 hover:text-primary transition-all uppercase">+ Add Values File</button>
                    </div>
                  </div>
                </div>
                <button 
                  onClick={handleRunPreview}
                  disabled={previewLoading || !localChartPath}
                  className="w-full py-4 bg-primary text-primary-foreground rounded-2xl font-black uppercase tracking-[0.2em] text-xs hover:scale-[1.02] active:scale-95 transition-all shadow-[0_0_30px_rgba(59,130,246,0.3)] disabled:opacity-50 flex items-center justify-center gap-3"
                >
                  {previewLoading ? <Loader2 size={18} className="animate-spin" /> : <Play size={18} />}
                  Compile Template
                </button>
              </div>
              <div className="p-6 bg-yellow-500/5 border border-yellow-500/10 rounded-2xl flex gap-4">
                <AlertCircle className="text-yellow-500 shrink-0" size={20} />
                <p className="text-[10px] text-yellow-500/80 leading-relaxed font-medium"><b>Note:</b> This uses the local <code>helm</code> binary. Make sure it's installed and in your PATH.</p>
              </div>
            </div>

            {/* Output Viewer */}
            <div className="flex-1 flex flex-col bg-black/40 rounded-3xl border border-white/5 overflow-hidden">
              <div className="p-6 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
                <div className="flex items-center gap-3">
                  <Braces size={18} className="text-primary" />
                  <span className="text-xs font-black uppercase tracking-widest">Template Output Preview</span>
                </div>
                {localPreview && (
                  <button onClick={() => { navigator.clipboard.writeText(localPreview); toast.success("Copied to clipboard"); }} className="p-2 hover:bg-white/10 rounded-lg text-muted-foreground transition-colors"><Copy size={16} /></button>
                )}
              </div>
              <div className="flex-1 overflow-auto custom-scrollbar relative bg-[#050505]">
                {previewLoading ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center space-y-4">
                    <Loader2 size={32} className="text-primary animate-spin" />
                    <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Running helm template...</span>
                  </div>
                ) : localPreview ? (
                  <pre className="p-8 font-mono text-[11px] leading-relaxed text-green-400/80">
                    {localPreview.split('\n').map((line, i) => (
                      <div key={i} className="flex group">
                        <span className="w-12 shrink-0 text-gray-800 select-none text-right pr-6 font-mono">{i + 1}</span>
                        <span className={line.startsWith('#') ? 'text-gray-600 italic' : line.startsWith('---') ? 'text-primary font-black' : ''}>{line}</span>
                      </div>
                    ))}
                  </pre>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-gray-600 space-y-4 opacity-30">
                    <FileCode size={64} />
                    <span className="text-xs font-black uppercase tracking-widest">Configure Chart & Run Preview</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default HelmPage;
