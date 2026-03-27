import React, { useEffect, useRef, useState } from 'react';
import { Terminal as XTerm } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { listen, emit } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/tauri';
import { motion } from 'framer-motion';
import { X, Terminal as TerminalIcon, Activity } from 'lucide-react';
import 'xterm/css/xterm.css';

interface TerminalProps {
  podId: string;
  type: 'exec' | 'logs';
  onClose: () => void;
}

const Terminal: React.FC<TerminalProps> = ({ podId, type, onClose }) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const [isTerminated, setIsTerminated] = useState(false);

  useEffect(() => {
    if (!terminalRef.current) return;

    // xterm.js 초기화
    const term = new XTerm({
      theme: {
        background: '#0a0a0a',
        foreground: '#ededed',
        cursor: '#3b82f6',
        selectionBackground: 'rgba(59, 130, 246, 0.3)',
      },
      fontFamily: '"JetBrains Mono", monospace',
      fontSize: 14,
      cursorBlink: true,
      disableStdin: type === 'logs',
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(terminalRef.current);
    fitAddon.fit();
    xtermRef.current = term;

    term.writeln(`\x1b[1;34m[Palantir]\x1b[0m Establishing connection to ${podId}...`);

    let unlistenOutput: () => void;
    let unlistenClosed: () => void;
    let onDataDisposable: any;

    const startSession = async () => {
      try {
        const [namespace, pod_name] = podId.split('/');
        if (type === 'exec') {
          const sid = await invoke<string>('start_exec', { namespace, podName: pod_name, containerName: null });
          sessionIdRef.current = sid;

          unlistenOutput = await listen<number[]>(`exec-output:${sid}`, (event) => {
            if (Array.isArray(event.payload)) term.write(new Uint8Array(event.payload));
          });

          unlistenClosed = await listen<string>(`session-closed:${sid}`, (event) => {
            if (event.payload === "normal") {
              term.writeln('\r\n\x1b[1;32m[System]\x1b[0m Session closed. Exiting...');
              setTimeout(onClose, 800);
            } else {
              setIsTerminated(true);
              term.writeln(`\r\n\x1b[1;31m[Terminated]\x1b[0m ${event.payload}`);
            }
          });

          onDataDisposable = term.onData((data) => {
            if (!isTerminated) emit(`exec-input:${sid}`, data);
          });

          term.writeln(`\x1b[1;32m[System]\x1b[0m Session active.\r\n`);
          emit(`exec-input:${sid}`, "\r");
        } else {
          await invoke('start_logs', { namespace, podName: pod_name, containerName: null });
          unlistenOutput = await listen<string>(`log-line:${podId}`, (event) => {
            term.writeln(event.payload);
          });
        }
      } catch (err) {
        term.writeln(`\r\n\x1b[1;31m[Error]\x1b[0m Failed to initialize: ${err}`);
      }
    };

    startSession();

    const handleResize = () => fitAddon.fit();
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (unlistenOutput) unlistenOutput();
      if (unlistenClosed) unlistenClosed();
      if (onDataDisposable) onDataDisposable.dispose();
      
      if (sessionIdRef.current) {
        invoke('stop_session', { sessionId: sessionIdRef.current }).catch(console.error);
      }
      term.dispose();
    };
  }, [podId, type]);

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: 20 }}
      className="absolute inset-0 z-[100] flex items-center justify-center p-12 bg-background/60 backdrop-blur-md"
    >
      <div className="w-full h-full glass-card rounded-[2.5rem] overflow-hidden flex flex-col shadow-[0_0_100px_rgba(0,0,0,0.5)] border-white/10 ring-1 ring-white/5">
        {/* Terminal Header */}
        <div className="h-14 flex items-center justify-between px-8 bg-card/50 border-b border-white/5">
          <div className="flex items-center gap-4">
            <div className="flex gap-2">
              <div className="w-3.5 h-3.5 rounded-full bg-red-500/20 border border-red-500/50 cursor-pointer hover:bg-red-500 transition-colors" onClick={onClose} />
              <div className="w-3.5 h-3.5 rounded-full bg-yellow-500/10 border border-yellow-500/30" />
              <div className="w-3.5 h-3.5 rounded-full bg-green-500/10 border border-green-500/30" />
            </div>
            <div className="h-4 w-[1px] bg-white/10 mx-2" />
            <div className="flex items-center gap-2">
              {type === 'exec' ? <TerminalIcon size={16} className="text-primary" /> : <Activity size={16} className="text-green-500" />}
              <span className="text-xs font-mono font-bold text-gray-400 uppercase tracking-widest">{podId}</span>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            {isTerminated && <span className="text-[10px] text-red-500 font-bold animate-pulse uppercase tracking-tighter">Disconnected</span>}
            <div className="px-3 py-1 rounded-full bg-primary/10 border border-primary/20">
              <span className="text-[10px] uppercase font-black text-primary tracking-[0.2em]">{type}</span>
            </div>
          </div>
        </div>

        {/* Terminal Body */}
        <div className="flex-1 p-6 overflow-hidden">
          <div ref={terminalRef} className="w-full h-full" />
        </div>
      </div>
    </motion.div>
  );
};

export default Terminal;
