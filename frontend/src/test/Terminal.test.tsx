import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Terminal from '../components/Terminal';
import React from 'react';

// Mock Tauri APIs
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
  emit: vi.fn(),
}));

vi.mock('@tauri-apps/api/tauri', () => ({
  invoke: vi.fn(),
}));

// Mock xterm
vi.mock('xterm', () => {
  return {
    Terminal: vi.fn().mockImplementation(function() {
      return {
        loadAddon: vi.fn(),
        open: vi.fn(),
        write: vi.fn(),
        onData: vi.fn(),
        dispose: vi.fn(),
      };
    }),
  };
});

vi.mock('xterm-addon-fit', () => {
  return {
    FitAddon: vi.fn().mockImplementation(function() {
      return {
        fit: vi.fn(),
      };
    }),
  };
});

describe('Terminal Component', () => {
  const session = {
    podId: 'test-pod',
    type: 'exec' as const,
    container: 'main'
  };

  it('renders terminal header when session is provided', () => {
    render(<Terminal session={session} onClose={vi.fn()} />);
    expect(screen.getByText(/Session: test-pod/i)).toBeInTheDocument();
  });

  it('renders nothing when session is null', () => {
    const { container } = render(<Terminal session={null} onClose={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it('calls onClose when close button is clicked', async () => {
    const onClose = vi.fn();
    render(<Terminal session={session} onClose={onClose} />);
    
    // Using title because the icon might not have text
    const closeBtn = screen.getByRole('button');
    closeBtn.click();
    
    expect(onClose).toHaveBeenCalled();
  });
});
