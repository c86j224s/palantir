import React, { useEffect, useRef, useState } from 'react';
import { Terminal as XTerm } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/tauri';
import { motion } from 'framer-motion';
import { X, Terminal as TerminalIcon, Activity } from 'lucide-react';
import 'xterm/css/xterm.css';

interface TerminalProps {
  session: {
    podId: string;
    type: 'exec' | 'logs';
    container?: string;
  } | null;
  onClose: () => void;
}

const Terminal: React.FC<TerminalProps> = ({ session, onClose }) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const [isTerminated, setIsTerminated] = useState(false);

  useEffect(() => {
    // 세션이 없으면 아무것도 하지 않음 (Hooks는 이미 위에서 선언됨)
    if (!session || !terminalRef.current) return;

    const initTerminal = async () => {
      const term = new XTerm({
        theme: {
          background: '#0a0a0a',
          foreground: '#3b82f6',
          cursor: '#3b82f6',
          selectionBackground: 'rgba(59, 130, 246, 0.3)',
        },
        fontFamily: 'JetBrains Mono, Menlo, Monaco, Consolas, monospace',
        fontSize: 13,
        letterSpacing: 0.5,
        cursorBlink: true,
      });

      const fitAddon = new FitAddon();
      term.loadAddon(fitAddon);
      term.open(terminalRef.current!);
      fitAddon.fit();
      xtermRef.current = term;

      try {
        const { podId, type, container } = session;
        const [namespace, name] = podId.split('/');
        
        const cmd = type === 'exec' ? 'start_exec' : 'start_logs';
        const sessionId: string = await invoke(cmd, { namespace, podName: name, containerName: container || null });
        sessionIdRef.current = sessionId;

        term.onData((data) => {
          if (type === 'exec') {
            invoke('write_to_session', { sessionId, data }).catch(console.error);
          }
        });

        const unlisten = await listen(`session-data-${sessionId}`, (event: any) => {
          term.write(event.payload);
        });

        const unlistenExit = await listen(`session-exit-${sessionId}`, (event: any) => {
          term.write('\r\n\x1b[31m[Session Terminated]\x1b[0m\r\n');
          setIsTerminated(true);
        });

        return () => {
          unlisten();
          unlistenExit();
          term.dispose();
          if (sessionIdRef.current) {
            invoke('stop_session', { sessionId: sessionIdRef.current }).catch(console.error);
          }
        };
      } catch (err) {
        term.write(`\r\n\x1b[31mError connecting to session: ${err}\x1b[0m\r\n`);
      }
    };

    const cleanup = initTerminal();
    return () => { cleanup.then(f => f && f()); };
  }, [session]);

  if (!session) return null;

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: 20 }}
      className="fixed inset-x-10 bottom-10 h-[400px] bg-black/90 backdrop-blur-2xl border border-white/10 rounded-3xl shadow-2xl z-[200] flex flex-col overflow-hidden ring-1 ring-white/5"
    >
      <div className="h-14 flex items-center justify-between px-6 border-b border-white/5 bg-white/[0.02]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
            <TerminalIcon size={16} className="text-primary" />
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] font-black text-primary uppercase tracking-widest">
              {session.type === 'exec' ? 'Interactive Shell' : 'Stream Logs'}
            </span>
            <span className="text-xs font-bold text-muted-foreground truncate max-w-[400px]">
              Session: {session.podId} {session.container ? `(${session.container})` : ''}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isTerminated && <span className="text-[9px] font-black text-red-500 uppercase bg-red-500/10 px-2 py-1 rounded-md animate-pulse">Terminated</span>}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 border border-white/5">
            <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            <span className="text-[9px] font-bold text-green-500 uppercase tracking-tight">Active</span>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-white/5 rounded-xl text-muted-foreground hover:text-red-500 transition-colors"
          >
            <X size={18} />
          </button>
        </div>
      </div>
      <div ref={terminalRef} className="flex-1 p-4 overflow-hidden" />
    </motion.div>
  );
};

export default Terminal;
