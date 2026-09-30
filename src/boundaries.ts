import type {
  AreaAssertion,
  AreaAssertionKind,
  AreaPoliticalSummary,
  BoundaryDraft,
  BoundaryDraftValidation,
  BoundaryDraftValidationOptions,
  ISODate,
} from "./types.ts";
import { GeographyError } from "./errors.ts";
import { isISODate, isPlainObject, isStableKey, periodContains, validateAreaAssertions, validateGeometry, validPeriod, validUrl } from "./validation.ts";

export function summarizeAreaAssertions(
  areaId: string,
  assertions: readonly AreaAssertion[],
  asOf: ISODate,
): AreaPoliticalSummary {
  if (!isISODate(asOf)) throw new GeographyError("invalid_manifest", "asOf must be a real ISO date");
  const assertionProblems = validateAreaAssertions(assertions);
  if (assertionProblems.length) {
    throw new GeographyError("invalid_resource", assertionProblems.slice(0, 8).join("; "));
  }
  const current = assertions.filter(
    (assertion) =>
      assertion.areaId === areaId &&
      periodContains(assertion.validFrom, assertion.validTo, asOf),
  );
  const unique = (kind: AreaAssertionKind) =>
    [...new Set(current.filter((item) => item.assertion === kind).map((item) => item.jurisdictionId))].sort();
  const claimants = unique("claims");
  const administrators = unique("administers");
  const proposers = unique("proposes");
  return {
    claimants,
    administrators,
    proposers,
    disputed:
      claimants.length > 1 ||
      (claimants.length === 1 && administrators.some((id) => id !== claimants[0])),
    unclaimed: claimants.length === 0,
  };
}
/** Validate a boundary submitted for a proposal; only the owning app can approve publication. */
export function validateBoundaryDraft(
  draft: BoundaryDraft,
  options: BoundaryDraftValidationOptions,
): BoundaryDraftValidation {
  const problems: string[] = [];
  if (!isStableKey(draft.id)) problems.push("draft id is invalid");
  if (!isStableKey(draft.proposalId)) problems.push("proposalId is invalid");
  if (!draft.title.trim()) problems.push("title is required");
  if (!isStableKey(draft.geographyId) || !isStableKey(draft.kindKey)) {
    problems.push("geographyId and kindKey must be stable keys");
  }
  if (!validPeriod(draft.validFrom, draft.validTo)) problems.push("validity period is invalid");
  if (draft.geometry.type !== "Polygon" && draft.geometry.type !== "MultiPolygon") {
    problems.push("a territory draft must be a Polygon or MultiPolygon");
  }
  const maxVertices = options.maxVertices ?? 100_000;
  const geometryProblems = validateGeometry(draft.geometry, maxVertices);
  problems.push(...geometryProblems);
  const serialized = JSON.stringify(draft.geometry);
  const byteSize = new TextEncoder().encode(serialized).byteLength;
  const maxBytes = options.maxBytes ?? 5 * 1024 * 1024;
  if (byteSize > maxBytes) problems.push(`geometry is ${byteSize} bytes; limit is ${maxBytes}`);
  const vertexCount = countPositions(draft.geometry);

  const source = draft.source;
  const rule = options.licensePolicy.find((candidate) => candidate.spdx === source.licenseSPDX);
  if (!source.publisher.trim() || !source.dataset.trim() || !source.licenseSPDX.trim()) {
    problems.push("boundary source needs a publisher, dataset, and license");
  }
  if (!rule) {
    problems.push(`license ${source.licenseSPDX} is outside the supplied policy`);
  } else if (rule.requiresAttribution && !source.attribution?.trim()) {
    problems.push(`license ${source.licenseSPDX} requires attribution`);
  }
  if (source.url && !validUrl(source.url, ["https:", "http:"])) problems.push("source url must be HTTP(S)");

  const topology = options.validateTopology?.(draft.geometry);
  if (!options.validateTopology) problems.push("a full topology validator is required before publication");
  else if (!topology?.valid) problems.push(...(topology?.problems?.length ? topology.problems : ["geometry topology is invalid"]));
  if (!options.proposalApproved) problems.push("the app must verify the proposal is approved before publication");
  else if (!options.proposalApproved(draft.proposalId)) problems.push("proposal is not approved for publication");

  return {
    problems,
    publishable: problems.length === 0,
    vertexCount,
    byteSize,
  };
}
function countPositions(value: unknown): number {
  let count = 0;
  const visit = (part: unknown): void => {
    if (!Array.isArray(part)) return;
    if (part.length >= 2 && part.every((coordinate) => typeof coordinate === "number")) {
      count += 1;
      return;
    }
    for (const child of part) visit(child);
  };
  if (isPlainObject(value)) {
    if ("coordinates" in value) visit(value.coordinates);
    if (Array.isArray(value.geometries)) value.geometries.forEach(visit);
  }
  return count;
}
