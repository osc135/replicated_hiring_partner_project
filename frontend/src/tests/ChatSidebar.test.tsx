import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ChatSidebar from '../components/ChatSidebar';

// Mock the api module
vi.mock('../api', () => ({
  getChatHistory: vi.fn().mockResolvedValue([]),
  sendChatMessage: vi.fn(),
  parseSSEStream: vi.fn(),
}));

import * as api from '../api';

describe('ChatSidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (api.getChatHistory as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  });

  it('renders chat header and empty state', async () => {
    render(<ChatSidebar analysisId="test-123" />);
    expect(screen.getByText('Chat')).toBeInTheDocument();
    expect(screen.getByText(/ask questions about this analysis/i)).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText(/no messages yet/i)).toBeInTheDocument();
    });
  });

  it('renders input field and send button', () => {
    render(<ChatSidebar analysisId="test-123" />);
    expect(screen.getByPlaceholderText(/ask about this analysis/i)).toBeInTheDocument();
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('disables send button when input is empty', () => {
    render(<ChatSidebar analysisId="test-123" />);
    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
  });

  it('enables send button when input has text', () => {
    render(<ChatSidebar analysisId="test-123" />);
    const input = screen.getByPlaceholderText(/ask about this analysis/i);
    fireEvent.change(input, { target: { value: 'What pods are crashing?' } });
    const button = screen.getByRole('button');
    expect(button).not.toBeDisabled();
  });

  it('loads chat history on mount', async () => {
    const mockHistory = [
      { role: 'user' as const, content: 'What is wrong?' },
      { role: 'assistant' as const, content: 'The pod is crash looping.' },
    ];
    (api.getChatHistory as ReturnType<typeof vi.fn>).mockResolvedValue(mockHistory);

    render(<ChatSidebar analysisId="test-123" />);
    await waitFor(() => {
      expect(screen.getByText('What is wrong?')).toBeInTheDocument();
      expect(screen.getByText('The pod is crash looping.')).toBeInTheDocument();
    });
  });

  it('adds user message to chat on send', async () => {
    const mockResponse = {
      ok: true,
      body: { getReader: () => ({ read: vi.fn().mockResolvedValue({ done: true }) }) },
    };
    (api.sendChatMessage as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse);
    (api.parseSSEStream as ReturnType<typeof vi.fn>).mockImplementation(
      (_reader: unknown, _onEvent: unknown, onDone?: () => void) => {
        onDone?.();
        return vi.fn();
      },
    );

    render(<ChatSidebar analysisId="test-123" />);
    const input = screen.getByPlaceholderText(/ask about this analysis/i);
    fireEvent.change(input, { target: { value: 'Explain the CrashLoopBackOff' } });
    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(screen.getByText('Explain the CrashLoopBackOff')).toBeInTheDocument();
    });
    expect(api.sendChatMessage).toHaveBeenCalledWith('test-123', 'Explain the CrashLoopBackOff');
  });

  it('shows error when chat request fails', async () => {
    (api.sendChatMessage as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network error'));

    render(<ChatSidebar analysisId="test-123" />);
    const input = screen.getByPlaceholderText(/ask about this analysis/i);
    fireEvent.change(input, { target: { value: 'test message' } });
    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });
  });
});
