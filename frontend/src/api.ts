const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8001';

function getHeaders(): HeadersInit {
  const token = localStorage.getItem('token');
  return {
    'Content-Type': 'application/json',
    'Authorization': token ? `Bearer ${token}` : '',
  };
}

function authHeader(): HeadersInit {
  const token = localStorage.getItem('token');
  return {
    'Authorization': token ? `Bearer ${token}` : '',
  };
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: 'Request failed' }));
    throw new Error(body.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

// ---------- Auth ----------

export async function login(email: string, password: string): Promise<{ access_token: string; token?: string }> {
  const res = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  return handleResponse(res);
}

export async function register(email: string, password: string): Promise<{ access_token: string; token?: string }> {
  const res = await fetch(`${API_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  return handleResponse(res);
}

export async function logout(): Promise<void> {
  await fetch(`${API_URL}/auth/logout`, {
    method: 'POST',
    headers: getHeaders(),
  }).catch(() => {});
  localStorage.removeItem('token');
}

// ---------- Bundles ----------

export interface Bundle {
  id: string;
  filename: string;
  uploaded_at: string;
  status: 'processing' | 'completed' | 'failed';
  severity?: 'critical' | 'warning' | 'info';
}

export async function getBundles(): Promise<Bundle[]> {
  const res = await fetch(`${API_URL}/bundles`, {
    headers: getHeaders(),
  });
  return handleResponse(res);
}

export async function getBundle(bundleId: string): Promise<Bundle> {
  const res = await fetch(`${API_URL}/bundles/${bundleId}`, {
    headers: getHeaders(),
  });
  return handleResponse(res);
}

export async function uploadBundle(file: File): Promise<Response> {
  const formData = new FormData();
  formData.append('file', file);
  return fetch(`${API_URL}/bundles/upload`, {
    method: 'POST',
    headers: authHeader(),
    body: formData,
  });
}

// ---------- Analysis ----------

export interface Analysis {
  id: string;
  bundle_id: string;
  severity: 'critical' | 'warning' | 'info';
  llm_diagnosis: string;
  rule_findings?: {
    findings: Array<{
      rule: string;
      severity: string;
      description: string;
      file: string;
      matches?: Array<{ line_number: number; line: string }>;
    }>;
    scanned_files: number;
    total_files: number;
  };
  created_at: string;
}

export interface RuleFinding {
  rule: string;
  severity: 'critical' | 'warning' | 'info';
  message: string;
  file_path?: string;
  matches?: Array<{ line_number: number; line: string }>;
}

export async function getAnalysis(bundleId: string): Promise<Analysis> {
  const res = await fetch(`${API_URL}/analysis/${bundleId}`, {
    headers: getHeaders(),
  });
  return handleResponse(res);
}

// ---------- Similar Incidents ----------

export interface SimilarIncident {
  analysis_id: string;
  bundle_filename: string;
  severity: 'critical' | 'warning' | 'info';
  similarity_score: number;
  summary: string;
}

export async function getSimilar(analysisId: string): Promise<SimilarIncident[]> {
  const res = await fetch(`${API_URL}/similar/${analysisId}`, {
    headers: getHeaders(),
  });
  return handleResponse(res);
}

// ---------- Chat ----------

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
}

export async function getChatHistory(analysisId: string): Promise<ChatMessage[]> {
  const res = await fetch(`${API_URL}/chat/${analysisId}`, {
    headers: getHeaders(),
  });
  return handleResponse(res);
}

export async function sendChatMessage(analysisId: string, message: string): Promise<Response> {
  return fetch(`${API_URL}/chat/${analysisId}`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ message }),
  });
}

// ---------- SSE Helpers ----------

export interface SSEEvent {
  event?: string;
  data: string;
}

export function parseSSEStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  onEvent: (event: SSEEvent) => void,
  onDone?: () => void,
  onError?: (err: Error) => void,
): () => void {
  const decoder = new TextDecoder();
  let buffer = '';
  let cancelled = false;

  const processBuffer = () => {
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    let currentEvent: string | undefined;

    for (const line of lines) {
      if (line.startsWith('event:')) {
        currentEvent = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        const data = line.slice(5).trim();
        onEvent({ event: currentEvent, data });
        currentEvent = undefined;
      } else if (line.trim() === '') {
        currentEvent = undefined;
      }
    }
  };

  const read = async () => {
    try {
      while (!cancelled) {
        const { done, value } = await reader.read();
        if (done) {
          if (buffer.trim()) processBuffer();
          onDone?.();
          return;
        }
        buffer += decoder.decode(value, { stream: true });
        processBuffer();
      }
    } catch (err) {
      if (!cancelled) {
        onError?.(err instanceof Error ? err : new Error(String(err)));
      }
    }
  };

  read();

  return () => {
    cancelled = true;
    reader.cancel().catch(() => {});
  };
}
