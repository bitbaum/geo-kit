import { GeographyError } from "./errors.ts";
import { safeResourceHref } from "./validation.ts";
import type { LoadResourcesOptions } from "./types.ts";

type FetchOptions = Pick<LoadResourcesOptions, "baseUrl" | "signal" | "fetcher">;

export function publicDataUrl(href: string, baseUrl: string): URL {
  try {
    const base = new URL(baseUrl);
    if (!safeResourceHref(href) || !["https:", "http:"].includes(base.protocol) || base.username || base.password) {
      throw new Error("unsafe geography URL");
    }
    const url = new URL(href, base);
    if (url.origin !== base.origin) throw new Error("off-origin geography URL");
    return url;
  } catch {
    throw new GeographyError("invalid_manifest", "geography URLs must be safe root-relative paths on an HTTP(S) baseUrl");
  }
}

/** Shared bounded transport for manifests and geometry, including decoded compressed bodies. */
export async function fetchGeographyBytes(href: string, maxBytes: number, options: FetchOptions, label: string): Promise<Uint8Array> {
  options.signal?.throwIfAborted();
  const url = publicDataUrl(href, options.baseUrl);
  let response: Response;
  try {
    response = await (options.fetcher ?? fetch)(url, {
      method: "GET",
      credentials: "omit",
      redirect: "error",
      signal: options.signal,
      headers: { accept: "application/geo+json, application/json" },
    });
  } catch (error) {
    if (options.signal?.aborted) throw options.signal.reason ?? error;
    throw new GeographyError("resource_fetch_failed", `${label} could not be fetched`);
  }
  if (options.signal?.aborted) {
    await response.body?.cancel(options.signal.reason).catch(() => undefined);
    options.signal.throwIfAborted();
  }
  if (!response.ok) {
    await response.body?.cancel("HTTP error").catch(() => undefined);
    throw new GeographyError("resource_fetch_failed", `${label} returned HTTP ${response.status}`);
  }
  const contentLength = response.headers.get("content-length");
  const contentEncoding = response.headers.get("content-encoding");
  if ((!contentEncoding || contentEncoding === "identity") && contentLength && /^\d+$/.test(contentLength) && Number(contentLength) > maxBytes) {
    await response.body?.cancel("declared size exceeded").catch(() => undefined);
    throw new GeographyError("resource_too_large", `${label} exceeded its byte limit`);
  }
  const reader = response.body?.getReader();
  if (!reader) throw new GeographyError("resource_fetch_failed", `${label} has no response body`);
  const chunks: Uint8Array[] = [];
  let size = 0;
  const onAbort = () => { void reader.cancel(options.signal?.reason).catch(() => undefined); };
  options.signal?.addEventListener("abort", onAbort, { once: true });
  try {
    options.signal?.throwIfAborted();
    while (true) {
      const { done, value } = await reader.read();
      options.signal?.throwIfAborted();
      if (done) break;
      if (!value) continue;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel("declared size exceeded").catch(() => undefined);
        throw new GeographyError("resource_too_large", `${label} exceeded its byte limit`);
      }
      chunks.push(value);
    }
  } catch (error) {
    if (options.signal?.aborted) throw options.signal.reason ?? error;
    if (error instanceof GeographyError) throw error;
    throw new GeographyError("resource_fetch_failed", `${label} body could not be read`);
  } finally {
    options.signal?.removeEventListener("abort", onAbort);
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}
