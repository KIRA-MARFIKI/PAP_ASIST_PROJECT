declare namespace Deno {
  namespace env {
    function get(key: string): string | undefined;
    function set(key: string, value: string): void;
    function toObject(): Record<string, string>;
  }

  interface ServeHandlerInfo {
    remoteAddr: {
      transport: 'tcp';
      hostname: string;
      port: number;
    };
  }

  type ServeHandler = (
    request: Request,
    info?: ServeHandlerInfo
  ) => Response | Promise<Response>;

  interface ServeOptions {
    port?: number;
    hostname?: string;
    signal?: AbortSignal;
    onListen?: (params: { hostname: string; port: number }) => void;
    onError?: (error: unknown) => Response | Promise<Response>;
  }

  interface HttpServer {
    finished: Promise<void>;
    shutdown(): Promise<void>;
    unref(): void;
  }

  function serve(handler: ServeHandler): HttpServer;
  function serve(options: ServeOptions, handler: ServeHandler): HttpServer;
}
