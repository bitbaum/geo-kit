export declare class GeographyError extends Error {
    readonly code: "invalid_manifest" | "selection_required" | "selection_limit" | "invalid_resource" | "resource_fetch_failed" | "resource_too_large" | "invalid_boundary_draft";
    constructor(code: "invalid_manifest" | "selection_required" | "selection_limit" | "invalid_resource" | "resource_fetch_failed" | "resource_too_large" | "invalid_boundary_draft", message: string);
}
