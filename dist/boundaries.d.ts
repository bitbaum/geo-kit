import type { AreaAssertion, AreaPoliticalSummary, BoundaryDraft, BoundaryDraftValidation, BoundaryDraftValidationOptions, ISODate } from "./types.ts";
export declare function summarizeAreaAssertions(areaId: string, assertions: readonly AreaAssertion[], asOf: ISODate): AreaPoliticalSummary;
/** Validate a boundary submitted for a proposal; only the owning app can approve publication. */
export declare function validateBoundaryDraft(draft: BoundaryDraft, options: BoundaryDraftValidationOptions): BoundaryDraftValidation;
