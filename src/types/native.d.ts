// Exposed by electron/preload.cjs when running as the desktop app.
interface Window {
  taskerNative?: {
    ping(
      url: string,
      init: { method: 'GET' | 'POST'; headers: Record<string, string>; body: string },
    ): Promise<{ status: number; body: string }>;
    apiCall(
      url: string,
      init: {
        method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
        headers: Record<string, string>;
        body: string;
      },
    ): Promise<{ status: number; body: string }>;
    openAuth(url: string): Promise<boolean>;
    onQuickCapture(cb: () => void): () => void;
  };
}
