import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  AlertTriangle, Info, Clock, ChevronDown, 
  ChevronUp, Zap, Activity, Loader2
} from 'lucide-react';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/tauri';

interface K8sEvent {
  name: string;
  namespace: string;
  reason: string;
  message: string;
  type_: string;
  object_kind: string;
  object_name: string;
  count: number;
  last_timestamp: string;
}

interface Props {
  namespace: string;
}

const EventsViewer: React.FC<Props> = ({ namespace }) => {
  const [events, setEvents] = useState<K8sEvent[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);

  useEffect(() => {
    console.log("📡 [Frontend] Initializing Event Stream...");
    
    // 1. 백엔드 스트림 시작 요청
    invoke('start_event_stream', { namespace: null })
      .then(() => {
        console.log("✅ [Frontend] Event stream started successfully");
        setIsStreaming(true);
      })
      .catch((err) => {
        console.error("❌ [Frontend] Failed to start event stream:", err);
      });

    // 2. 이벤트 배치 리슨
    let unlisten: () => void;
    listen<K8sEvent[]>('k8s-events-batch', (event) => {
      const batch = event.payload;
      console.log(`📦 [Frontend] Received batch of ${batch.length} events`);
      
      setEvents(prev => {
        let nextEvents = [...prev];
        batch.forEach(newEv => {
          const existingIdx = nextEvents.findIndex(e => 
            e.namespace === newEv.namespace && 
            e.object_kind === newEv.object_kind && 
            e.object_name === newEv.object_name && 
            e.reason === newEv.reason &&
            e.object_name === newEv.object_name
          );

          if (existingIdx > -1) {
            nextEvents[existingIdx] = { ...newEv };
          } else {
            nextEvents.unshift(newEv);
          }
        });
        return nextEvents.slice(0, 100);
      });
    }).then(fn => unlisten = fn);

    return () => { 
      if (unlisten) {
        console.log("🧹 [Frontend] Cleaning up event listener");
        unlisten(); 
      }
    };
  }, []);

  return (
    <div className={`fixed bottom-0 left-[72px] right-0 z-[60] transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] ${isOpen ? 'h-80' : 'h-10'}`}>
      {/* Handle / Header */}
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className="h-10 bg-card/90 backdrop-blur-xl border-t border-border flex items-center justify-between px-6 cursor-pointer hover:bg-white/[0.03] transition-colors"
      >
        <div className="flex items-center gap-3">
          {isStreaming ? (
            <Activity size={14} className={events.some(e => e.type_ === 'Warning') ? 'text-red-500 animate-pulse' : 'text-primary'} />
          ) : (
            <Loader2 size={14} className="animate-spin text-muted-foreground" />
          )}
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-foreground/80">Cluster Events Timeline</span>
          {events.length > 0 && (
            <span className="bg-primary/20 text-primary text-[9px] font-black px-2 py-0.5 rounded-full ring-1 ring-primary/30 animate-in zoom-in duration-300">
              {events.length} SIGNALS
            </span>
          )}
        </div>
        <div className="flex items-center gap-4">
          <span className="text-[8px] font-mono text-muted-foreground uppercase tracking-tighter">Live Telemetry Active</span>
          {isOpen ? <ChevronDown size={16} className="text-muted-foreground" /> : <ChevronUp size={16} className="text-muted-foreground" />}
        </div>
      </div>

      {/* Events List */}
      <div className="h-[calc(100%-40px)] bg-background/95 backdrop-blur-md overflow-auto custom-scrollbar p-4 space-y-2 border-t border-white/5">
        <AnimatePresence initial={false}>
          {events.length > 0 ? events.map((ev) => (
            <motion.div
              key={`${ev.namespace}-${ev.object_name}-${ev.reason}-${ev.last_timestamp}`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`p-3 rounded-xl border flex items-start gap-4 group transition-all ${
                ev.type_ === 'Warning' 
                  ? 'bg-red-500/5 border-red-500/20 hover:border-red-500/40' 
                  : 'bg-white/[0.02] border-white/5 hover:border-white/10'
              }`}
            >
              <div className={`mt-1 p-1.5 rounded-lg ${ev.type_ === 'Warning' ? 'bg-red-500/20 text-red-500' : 'bg-primary/20 text-primary'}`}>
                {ev.type_ === 'Warning' ? <AlertTriangle size={14} /> : <Info size={14} />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-[10px] font-black uppercase tracking-widest ${ev.type_ === 'Warning' ? 'text-red-400' : 'text-primary'}`}>
                    {ev.reason}
                  </span>
                  <span className="text-gray-600 text-[10px]">•</span>
                  <span className="text-[10px] font-mono font-bold text-gray-400 uppercase">
                    {ev.object_kind}/{ev.object_name}
                  </span>
                  {ev.count > 1 && (
                    <span className="ml-auto text-[9px] font-black bg-white/5 px-2 py-0.5 rounded-md text-gray-500 ring-1 ring-white/10">
                      x{ev.count}
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-300 leading-relaxed truncate group-hover:whitespace-normal transition-all">
                  {ev.message}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <span className="text-[9px] font-mono text-gray-600 font-bold">
                  {new Date(ev.last_timestamp).toLocaleTimeString()}
                </span>
                <span className="text-[8px] font-black text-gray-700 uppercase tracking-tighter">
                  {ev.namespace}
                </span>
              </div>
            </motion.div>
          )) : (
            <div className="h-full flex flex-col items-center justify-center text-gray-600 space-y-3 opacity-20 py-10">
              <Zap size={32} />
              <span className="text-[10px] font-black uppercase tracking-widest">Awaiting signals from the cluster grid...</span>
            </div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default EventsViewer;
