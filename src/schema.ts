import { z } from "zod";

export const CaseDatabaseSchema = z.object({
    databaseId: z.string(),
    jurisdiction: z.string(),
    name: z.string(),
    url: z.string().optional(),
}).passthrough();

export const CaseDatabasesResponseSchema = z.object({
    caseDatabases: z.array(CaseDatabaseSchema),
}).passthrough();

export const CaseIdSchema = z.record(z.string(), z.string());

export const CaseSchema = z.object({
    databaseId: z.string(),
    caseId: CaseIdSchema,
    title: z.string(),
    citation: z.string(),
    aiContentId: z.record(z.string(), z.string()).optional(),
}).passthrough();

export const CasesResponseSchema = z.object({
    cases: z.array(CaseSchema),
}).passthrough();

export const CitedCasesResponseSchema = z.object({
    citedCases: z.array(CaseSchema),
}).passthrough();

export const CitingCasesResponseSchema = z.object({
    citingCases: z.array(CaseSchema),
}).passthrough();

export const CaseMetadataSchema = z.object({
    databaseId: z.string(),
    caseId: z.string(),
    url: z.string(),
    title: z.string(),
    citation: z.string(),
    language: z.string().optional(),
    docketNumber: z.string().optional(),
    decisionDate: z.string().optional(),
    keywords: z.string().optional(),
    topics: z.string().optional(),
    concatenatedId: z.string().optional(),
    aiContentId: z.string().optional(),
}).passthrough();

export const LegislationMetadataContentSchema = z.object({
    partId: z.string(),
    partName: z.string(),
}).passthrough();

export const LegislationMetadataSchema = z.object({
    legislationId: z.string(),
    url: z.string(),
    title: z.string(),
    citation: z.string(),
    language: z.string().optional(),
    dateSchema: z.string().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    repealed: z.string().optional(),
    content: z.array(LegislationMetadataContentSchema).optional(),
}).passthrough();

export const LegislationSchema = z.object({
    databaseId: z.string(),
    type: z.string(),
    jurisdiction: z.string(),
    name: z.string(),
}).passthrough();

export const LegislationResponseSchema = z.object({
    legislationDatabases: z.array(LegislationSchema),
}).passthrough();

export const LegislationItemSchema = z.object({
    databaseId: z.string(),
    legislationId: z.string(),
    title: z.string(),
    citation: z.string(),
    type: z.string(),
}).passthrough();

export const LegislationItemResponseSchema = z.object({
    legislations: z.array(LegislationItemSchema),
}).passthrough();

export const CitedLegislationsResponseSchema = z.object({
    citedLegislations: z.array(LegislationItemSchema),
}).passthrough();

// Search result types — use passthrough + fallback for unknown result types
export const SearchCaseResultSchema = z.object({
    case: CaseSchema,
}).passthrough();

export const SearchCommentarySchema = z.object({
    dataId: z.string(),
    databaseType: z.string().optional(),
    publisher: z.string().optional(),
    citation: z.string(),
    title: z.string(),
    url: z.string().optional(),
    pubDate: z.string().optional(),
}).passthrough();

export const SearchCommentaryResultSchema = z.object({
    commentary: SearchCommentarySchema,
}).passthrough();

export const SearchLegislationResultSchema = z.object({
    legislation: LegislationItemSchema,
}).passthrough();

// Fallback for unknown result types (treatise, practice-guide, etc.)
export const SearchUnknownResultSchema = z.object({}).passthrough();

export const SearchResultSchema = z.union([
    SearchCaseResultSchema,
    SearchCommentaryResultSchema,
    SearchLegislationResultSchema,
    SearchUnknownResultSchema,
]);

export const SearchResponseSchema = z.object({
    resultCount: z.number(),
    results: z.array(SearchResultSchema),
}).passthrough();

// Type exports
export type CaseDatabase = z.infer<typeof CaseDatabaseSchema>;
export type CaseId = z.infer<typeof CaseIdSchema>;
export type Case = z.infer<typeof CaseSchema>;
export type CaseDatabasesResponse = z.infer<typeof CaseDatabasesResponseSchema>;
export type CasesResponse = z.infer<typeof CasesResponseSchema>;
export type CitedCasesResponse = z.infer<typeof CitedCasesResponseSchema>;
export type CitingCasesResponse = z.infer<typeof CitingCasesResponseSchema>;
export type CitedLegislationsResponse = z.infer<typeof CitedLegislationsResponseSchema>;
export type CaseMetadataResponse = z.infer<typeof CaseMetadataSchema>;
export type SearchResponse = z.infer<typeof SearchResponseSchema>;
