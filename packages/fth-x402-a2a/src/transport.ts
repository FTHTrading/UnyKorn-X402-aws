/**
 * FTH x402 A2A — JSON-RPC 2.0 Transport Layer
 *
 * Implements the A2A protocol transport:
 *   - JSON-RPC 2.0 request parsing and response building
 *   - SSE streaming for tasks/sendSubscribe
 *   - Method dispatch to agent handlers
 *   - Error handling with A2A error codes
 */

import type {
  A2AMethod,
  JsonRpcRequest,
  JsonRpcResponse,
  JsonRpcError,
  A2AErrorCode,
  SSEEvent,
  TaskSendParams,
  TaskGetParams,
  TaskCancelParams,
  Task,
} from "./types";
import { A2A_ERROR_CODES } from "./types";

// ═══════════════════════════════════════════════════════════
// Request Parsing
// ═══════════════════════════════════════════════════════════

/**
 * Parse and validate a JSON-RPC 2.0 request body.
 */
export function parseJsonRpcRequest(body: unknown): JsonRpcRequest | JsonRpcError {
  if (!body || typeof body !== "object") {
    return makeError(null, A2A_ERROR_CODES.PARSE_ERROR, "Invalid JSON-RPC request body");
  }

  const req = body as Record<string, unknown>;

  if (req.jsonrpc !== "2.0") {
    return makeError(null, A2A_ERROR_CODES.INVALID_REQUEST, "jsonrpc must be '2.0'");
  }

  if (req.id === undefined || req.id === null) {
    return makeError(null, A2A_ERROR_CODES.INVALID_REQUEST, "Missing request id");
  }

  if (typeof req.method !== "string") {
    return makeError(
      req.id as string | number,
      A2A_ERROR_CODES.INVALID_REQUEST,
      "Missing or invalid method",
    );
  }

  return {
    jsonrpc: "2.0",
    id: req.id as string | number,
    method: req.method as A2AMethod,
    params: req.params ?? {},
  };
}

/**
 * Check whether a parsed result is an error.
 */
export function isJsonRpcError(
  result: JsonRpcRequest | JsonRpcResponse | JsonRpcError,
): result is JsonRpcError {
  return "error" in result;
}

// ═══════════════════════════════════════════════════════════
// Response Building
// ═══════════════════════════════════════════════════════════

/**
 * Build a JSON-RPC 2.0 success response.
 */
export function makeResult<R>(id: string | number, result: R): JsonRpcResponse<R> {
  return { jsonrpc: "2.0", id, result };
}

/**
 * Build a JSON-RPC 2.0 error response.
 */
export function makeError(
  id: string | number | null,
  code: A2AErrorCode | number,
  message: string,
  data?: unknown,
): JsonRpcError {
  return {
    jsonrpc: "2.0",
    id: id ?? 0,
    error: { code, message, ...(data !== undefined ? { data } : {}) },
  };
}

// ═══════════════════════════════════════════════════════════
// SSE Streaming
// ═══════════════════════════════════════════════════════════

/**
 * Format an SSE event string for streaming.
 */
export function formatSSEEvent(event: SSEEvent): string {
  const lines: string[] = [];
  lines.push(`event: ${event.type}`);
  lines.push(`data: ${JSON.stringify(event.data)}`);
  lines.push(""); // trailing newline
  return lines.join("\n") + "\n";
}

/**
 * SSE writer — wraps a writable stream with typed helpers.
 */
export class SSEWriter {
  private encoder = new TextEncoder();

  constructor(private writer: WritableStreamDefaultWriter<Uint8Array>) {}

  async write(event: SSEEvent): Promise<void> {
    const text = formatSSEEvent(event);
    await this.writer.write(this.encoder.encode(text));
  }

  async close(): Promise<void> {
    await this.writer.close();
  }
}

// ═══════════════════════════════════════════════════════════
// Method Dispatcher
// ═══════════════════════════════════════════════════════════

/**
 * Handler function type — receives parsed params, returns result or throws.
 */
export type MethodHandler<P = unknown, R = unknown> = (params: P) => Promise<R>;

/**
 * Method handlers map for an A2A agent.
 */
export interface A2AMethodHandlers {
  "tasks/send"?: MethodHandler<TaskSendParams, Task>;
  "tasks/sendSubscribe"?: MethodHandler<TaskSendParams, ReadableStream>;
  "tasks/get"?: MethodHandler<TaskGetParams, Task>;
  "tasks/cancel"?: MethodHandler<TaskCancelParams, Task>;
  "tasks/pushNotification/set"?: MethodHandler<unknown, unknown>;
  "tasks/pushNotification/get"?: MethodHandler<unknown, unknown>;
  "tasks/resubscribe"?: MethodHandler<unknown, ReadableStream>;
  "agents/discover"?: MethodHandler<unknown, unknown>;
  "agents/route"?: MethodHandler<unknown, unknown>;
  "agents/health"?: MethodHandler<unknown, unknown>;
}

/**
 * Dispatch a JSON-RPC request to the appropriate handler.
 *
 * Returns a JSON-RPC response (success or error).
 * For streaming methods, returns a ReadableStream instead.
 */
export async function dispatch(
  request: JsonRpcRequest,
  handlers: A2AMethodHandlers,
): Promise<JsonRpcResponse | JsonRpcError | { stream: ReadableStream }> {
  const handler = handlers[request.method];
  if (!handler) {
    return makeError(
      request.id,
      A2A_ERROR_CODES.METHOD_NOT_FOUND,
      `Method not found: ${request.method}`,
    );
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await handler(request.params as any);

    // Streaming responses
    if (result instanceof ReadableStream) {
      return { stream: result };
    }

    return makeResult(request.id, result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const code =
      err instanceof A2AError ? err.code : A2A_ERROR_CODES.INTERNAL_ERROR;
    const data = err instanceof A2AError ? err.data : undefined;

    return makeError(request.id, code, message, data);
  }
}

// ═══════════════════════════════════════════════════════════
// A2A Error Class
// ═══════════════════════════════════════════════════════════

/**
 * Typed error for A2A operations.
 * Throw this from handlers to return specific error codes.
 */
export class A2AError extends Error {
  constructor(
    message: string,
    public code: A2AErrorCode | number,
    public data?: unknown,
  ) {
    super(message);
    this.name = "A2AError";
  }
}

// ═══════════════════════════════════════════════════════════
// HTTP Adapter (Fastify-compatible)
// ═══════════════════════════════════════════════════════════

/**
 * Process an incoming HTTP request body as A2A JSON-RPC,
 * dispatch to handlers, and return the response payload.
 *
 * Usage in Fastify:
 *   app.post("/a2a", async (req, reply) => {
 *     const { status, headers, body } = await handleA2ARequest(req.body, handlers);
 *     return reply.status(status).headers(headers).send(body);
 *   });
 */
export async function handleA2ARequest(
  body: unknown,
  handlers: A2AMethodHandlers,
): Promise<{
  status: number;
  headers: Record<string, string>;
  body: unknown;
  stream?: ReadableStream;
}> {
  const parsed = parseJsonRpcRequest(body);

  if (isJsonRpcError(parsed)) {
    return {
      status: 400,
      headers: { "content-type": "application/json" },
      body: parsed,
    };
  }

  const result = await dispatch(parsed, handlers);

  // Streaming response
  if ("stream" in result) {
    return {
      status: 200,
      headers: {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
        "x-a2a-task-id": String((parsed.params as Record<string, unknown>)?.id ?? ""),
      },
      body: null,
      stream: result.stream,
    };
  }

  // Standard JSON-RPC response
  const isError = isJsonRpcError(result);
  return {
    status: isError ? (result.error.code === A2A_ERROR_CODES.PAYMENT_REQUIRED ? 402 : 200) : 200,
    headers: { "content-type": "application/json" },
    body: result,
  };
}
