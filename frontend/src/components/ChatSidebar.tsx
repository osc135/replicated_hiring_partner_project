import { useState, useEffect, useRef, useCallback } from 'react';
import { Send } from 'lucide-react';
import { getChatHistory, sendChatMessage, parseSSEStream, type ChatMessage } from '../api';
import StreamingMarkdown from './StreamingMarkdown';

interface Props {
  analysisId: string;
}

export default function ChatSidebar({ analysisId }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    getChatHistory(analysisId)
      .then(setMessages)
      .catch(() => {});
  }, [analysisId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || streaming) return;

    setInput('');
    setError(null);
    setMessages(prev => [...prev, { role: 'user', content: text }]);
    setStreaming(true);

    let assistantContent = '';
    setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

    try {
      const res = await sendChatMessage(analysisId, text);
      if (!res.ok) {
        const body = await res.json().catch(() => ({ detail: 'Chat request failed' }));
        throw new Error(body.detail || `HTTP ${res.status}`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('No response stream');

      cancelRef.current = parseSSEStream(
        reader,
        (event) => {
          try {
            const parsed = JSON.parse(event.data);
            if (parsed.type === 'token' || parsed.token) {
              const token = parsed.token || parsed.content || '';
              assistantContent += token;
              setMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1] = { role: 'assistant', content: assistantContent };
                return updated;
              });
            } else if (parsed.type === 'done') {
              setStreaming(false);
            } else if (parsed.type === 'error') {
              setError(parsed.message || 'An error occurred');
              setStreaming(false);
            }
          } catch {
            // Non-JSON data, treat as raw token
            assistantContent += event.data;
            setMessages(prev => {
              const updated = [...prev];
              updated[updated.length - 1] = { role: 'assistant', content: assistantContent };
              return updated;
            });
          }
        },
        () => setStreaming(false),
        (err) => {
          setError(err.message);
          setStreaming(false);
        },
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message');
      setStreaming(false);
      // Remove the empty assistant message
      setMessages(prev => prev.slice(0, -1));
    }
  }, [analysisId, input, streaming]);

  useEffect(() => {
    return () => {
      cancelRef.current?.();
    };
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full bg-white border-l border-gray-200">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 shrink-0">
        <h3 className="text-sm font-semibold text-gray-900">Chat</h3>
        <p className="text-xs text-gray-500 mt-0.5">Ask questions about this analysis</p>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <p className="text-sm text-gray-400 text-center mt-8">
            No messages yet. Ask a question about this analysis.
          </p>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                msg.role === 'user'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-800'
              }`}
            >
              {msg.role === 'assistant' ? (
                <StreamingMarkdown
                  content={msg.content}
                  streaming={streaming && i === messages.length - 1}
                />
              ) : (
                <p className="whitespace-pre-wrap">{msg.content}</p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="px-4 py-2 text-xs text-red-600 bg-red-50 border-t border-red-100">
          {error}
        </div>
      )}

      {/* Input */}
      <div className="p-3 border-t border-gray-200 shrink-0">
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about this analysis..."
            rows={1}
            className="flex-1 resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder:text-gray-400"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || streaming}
            className="shrink-0 p-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
