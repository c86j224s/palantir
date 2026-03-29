import React, { useState, useRef } from 'react';
import ReactDOM from 'react-dom';
import { HelpCircle, Copy, Check, X } from 'lucide-react';

export interface KubectlCommand {
  label?: string;
  command: string;
}

interface Props {
  commands: KubectlCommand[];
  /** @deprecated 자동 감지로 대체됨 */
  direction?: 'up' | 'down';
}

const POPOVER_WIDTH = 380;
const MARGIN = 8;

const KubectlHint: React.FC<Props> = ({ commands }) => {
  const [show, setShow] = useState(false);
  const [style, setStyle] = useState<React.CSSProperties>({});
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const open = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!buttonRef.current) return;

    const rect = buttonRef.current.getBoundingClientRect();
    const vpW = window.innerWidth;
    const vpH = window.innerHeight;

    // 가로: 버튼 오른쪽 정렬, 화면 밖이면 왼쪽으로 당김
    let left = rect.right - POPOVER_WIDTH;
    left = Math.max(MARGIN, Math.min(left, vpW - POPOVER_WIDTH - MARGIN));

    // 세로: 공간이 더 많은 쪽(위/아래)에 표시
    const estimatedH = commands.length * 68 + 52;
    const spaceBelow = vpH - rect.bottom - MARGIN;
    const spaceAbove = rect.top - MARGIN;

    let top: number;
    if (spaceBelow >= estimatedH || spaceBelow >= spaceAbove) {
      top = rect.bottom + MARGIN;
    } else {
      top = Math.max(MARGIN, rect.top - estimatedH - MARGIN);
    }

    setStyle({ position: 'fixed', top, left, width: POPOVER_WIDTH, zIndex: 9999 });
    setShow(true);
  };

  const close = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShow(false);
  };

  const handleCopy = (command: string, idx: number, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(command);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  };

  const popover = show ? ReactDOM.createPortal(
    <>
      {/* 바깥 클릭 닫기 오버레이 */}
      <div className="fixed inset-0" style={{ zIndex: 9998 }} onClick={close} />
      <div
        style={style}
        className="bg-[#0d0d0d] border border-white/10 rounded-xl p-3 shadow-2xl"
      >
        <div className="flex items-center justify-between mb-2.5">
          <span className="text-[9px] font-black text-primary uppercase tracking-[0.2em]">kubectl</span>
          <button onClick={close} className="text-muted-foreground hover:text-foreground transition-colors">
            <X size={12} />
          </button>
        </div>
        <div className="space-y-2">
          {commands.map((cmd, idx) => (
            <div key={idx}>
              {cmd.label && (
                <div className="text-[8px] font-black text-muted-foreground uppercase tracking-[0.15em] mb-1">
                  {cmd.label}
                </div>
              )}
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-black/60 rounded-lg px-2.5 py-2 font-mono text-[10px] text-green-400/80 border border-white/5 break-all leading-relaxed">
                  {cmd.command}
                </div>
                <button
                  onClick={(e) => handleCopy(cmd.command, idx, e)}
                  className="shrink-0 p-2 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary transition-colors"
                  title="복사"
                >
                  {copiedIdx === idx ? <Check size={12} /> : <Copy size={12} />}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>,
    document.body
  ) : null;

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={open}
        className="p-1.5 hover:bg-white/5 rounded-lg text-muted-foreground hover:text-primary transition-colors"
        title="kubectl 명령어 보기"
      >
        <HelpCircle size={14} />
      </button>
      {popover}
    </div>
  );
};

export default KubectlHint;
