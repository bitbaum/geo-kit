import type { GeographyManifest, LoadManifestOptions } from "./types.ts";
import { GeographyError } from "./errors.ts";
import { fetchGeographyBytes } from "./http.ts";
import { validateGeographyManifest } from "./validation.ts";

/** Fetch a public manifest within a byte budget, then validate its provenance and policy. */
export async function loadGeographyManifest(href: string, options: LoadManifestOptions): Promise<GeographyManifest> {
  const maxBytes = options.maxBytes ?? 64 * 1024;
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
    throw new GeographyError("invalid_manifest", "manifest maxBytes must be a positive safe integer");
  }
  const bytes = await fetchGeographyBytes(href, maxBytes, options, "geography manifest");
  let manifest: unknown;
  try {
    manifest = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new GeographyError("invalid_manifest", "geography manifest is not valid UTF-8 JSON");
  }
  const problems = validateGeographyManifest(manifest, options);
  if (problems.length) throw new GeographyError("invalid_manifest", problems.slice(0, 8).join("; "));
  return manifest as GeographyManifest;
}
