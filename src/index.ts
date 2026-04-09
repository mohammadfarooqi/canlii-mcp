#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
	CaseDatabasesResponseSchema,
	CasesResponseSchema,
	CaseMetadataSchema,
	CitedCasesResponseSchema,
	CitingCasesResponseSchema,
	CitedLegislationsResponseSchema,
	LegislationResponseSchema,
	LegislationItemResponseSchema,
	LegislationMetadataSchema,
	SearchResponseSchema,
} from "./schema.js";

const apiKey = process.env.CANLII_API_KEY;
if (!apiKey) {
	console.error("CANLII_API_KEY environment variable is required");
	process.exit(1);
}

// Rate limiter: 2 req/sec, 1 concurrent, 5000/day (per CanLII API terms)
// Uses a promise queue to serialize all requests — prevents concurrent API calls.
let requestQueue: Promise<void> = Promise.resolve();
let dailyCount = 0;
let dailyResetDate = new Date().toDateString();
const MIN_INTERVAL_MS = 500;
let lastRequestTime = 0;

async function apiFetch(url: string): Promise<Response> {
	return new Promise((resolve, reject) => {
		requestQueue = requestQueue.then(async () => {
			const today = new Date().toDateString();
			if (today !== dailyResetDate) {
				dailyCount = 0;
				dailyResetDate = today;
			}
			if (dailyCount >= 5000) {
				throw new Error("Daily API limit reached (5,000 queries). Try again tomorrow.");
			}
			const now = Date.now();
			const elapsed = now - lastRequestTime;
			if (elapsed < MIN_INTERVAL_MS) {
				await new Promise(r => setTimeout(r, MIN_INTERVAL_MS - elapsed));
			}
			lastRequestTime = Date.now();
			dailyCount++;
			return fetch(url);
		}).then(resolve, reject);
	});
}

const server = new McpServer({
	name: "CanLII MCP",
	version: "1.1.0",
	description: "Local MCP server for Canadian legal research via the CanLII API. Always include CanLII URLs in responses so the user can verify sources directly."
});

// Input validation schemas for path segments
const pathSegmentSchema = z.string().regex(/^[a-zA-Z0-9_\-]{1,100}$/, "Invalid identifier — must be alphanumeric, hyphens, or underscores only");
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format").optional();

function buildDateParams(params: URLSearchParams, options: {
	publishedBefore?: string;
	publishedAfter?: string;
	modifiedBefore?: string;
	modifiedAfter?: string;
	changedBefore?: string;
	changedAfter?: string;
	decisionDateBefore?: string;
	decisionDateAfter?: string;
}) {
	if (options.publishedBefore) params.append('publishedBefore', options.publishedBefore);
	if (options.publishedAfter) params.append('publishedAfter', options.publishedAfter);
	if (options.modifiedBefore) params.append('modifiedBefore', options.modifiedBefore);
	if (options.modifiedAfter) params.append('modifiedAfter', options.modifiedAfter);
	if (options.changedBefore) params.append('changedBefore', options.changedBefore);
	if (options.changedAfter) params.append('changedAfter', options.changedAfter);
	if (options.decisionDateBefore) params.append('decisionDateBefore', options.decisionDateBefore);
	if (options.decisionDateAfter) params.append('decisionDateAfter', options.decisionDateAfter);
}

function textResponse(text: string) {
	return { content: [{ type: "text" as const, text }] };
}

function jsonResponse(data: unknown) {
	return textResponse(JSON.stringify(data, null, 2));
}

function errorResponse(message: string) {
	return textResponse(message);
}

const dateParametersSchema = {
	publishedBefore: dateSchema.describe("Date first published on CanLII (YYYY-MM-DD)"),
	publishedAfter: dateSchema.describe("Date first published on CanLII (YYYY-MM-DD)"),
	modifiedBefore: dateSchema.describe("Date content last modified on CanLII (YYYY-MM-DD)"),
	modifiedAfter: dateSchema.describe("Date content last modified on CanLII (YYYY-MM-DD)"),
	changedBefore: dateSchema.describe("Date metadata or content last changed on CanLII (YYYY-MM-DD)"),
	changedAfter: dateSchema.describe("Date metadata or content last changed on CanLII (YYYY-MM-DD)"),
	decisionDateBefore: dateSchema.describe("Decision date upper bound (YYYY-MM-DD)"),
	decisionDateAfter: dateSchema.describe("Decision date lower bound (YYYY-MM-DD)"),
};

// ============================================================
// TOOL: search
// ============================================================
server.tool(
	"search",
	"Search CanLII for cases, legislation, and commentary by keyword. This is the primary entry point for legal research. " +
	"Returns case citations and titles ranked by relevance — does NOT include keywords, dates, or URLs. " +
	"Call get_case_metadata on promising results to get full details before citing a case. " +
	"Search is keyword-based, not semantic — use specific legal terms rather than natural language. " +
	"Common terms: 'best interests of the child', 'material change in circumstances', 'standard of review', " +
	"'duty to consult', 'reasonable expectation of privacy'. Include jurisdiction to narrow results (e.g., 'Ontario', 'Alberta'). " +
	"Date filters are NOT supported on search. Always cite the CanLII citation and provide the case URL so the user can verify the source.",
	{
		query: z.string()
			.describe("Full-text search query. Can include case names, legal concepts, legislation references, or keywords."),
		language: z.enum(["en", "fr"]).default("en")
			.describe("Language: 'en' for English (default), 'fr' for French"),
		resultCount: z.number().min(1).max(100).default(10)
			.describe("Number of results to return (1-100, default 10). Keep low for AI context efficiency."),
		offset: z.number().min(0).default(0)
			.describe("Pagination offset (default 0). Use to page through results."),
	},
	async ({ query, language, resultCount, offset }) => {
		try {
			const params = new URLSearchParams({
				api_key: apiKey,
				fullText: query,
				resultCount: resultCount.toString(),
				offset: offset.toString(),
			});

			const response = await apiFetch(
				`https://api.canlii.org/v1/search/${language}/?${params.toString()}`
			);

			if (!response.ok) {
				return errorResponse(`Error: Search failed (${response.status}). The search endpoint may not be available for your API key.`);
			}

			const data = await response.json();
			const parsed = SearchResponseSchema.parse(data);
			return jsonResponse(parsed);
		} catch (error) {
			return errorResponse(
				`Error: ${error instanceof Error ? error.message : "Unknown error"}`
			);
		}
	}
);

// ============================================================
// TOOL: get_courts_and_tribunals
// ============================================================
server.tool(
	"get_courts_and_tribunals",
	"List all available court and tribunal databases in Canada. Returns database IDs needed for other tools. " +
	"Key databases: onsc (Ontario Superior Court), onca (Ontario Court of Appeal), oncj (Ontario Court of Justice), " +
	"onscdc (Divisional Court), csc-scc (Supreme Court of Canada), bcsc (BC Supreme Court), abkb (Alberta King's Bench). " +
	"Use this to discover valid databaseId values for browse and citator tools.",
	{
		language: z.enum(["en", "fr"]).default("en")
			.describe("Language: 'en' for English (default), 'fr' for French"),
		...dateParametersSchema,
	},
	async (params) => {
		try {
			const { language, ...dateParams } = params;
			const urlParams = new URLSearchParams({ api_key: apiKey });
			buildDateParams(urlParams, dateParams);

			const response = await apiFetch(
				`https://api.canlii.org/v1/caseBrowse/${language}/?${urlParams.toString()}`
			);

			if (!response.ok) {
				return errorResponse(`Error: Failed to fetch databases (${response.status})`);
			}

			const data = await response.json();
			const parsed = CaseDatabasesResponseSchema.parse(data);
			return jsonResponse(parsed);
		} catch (error) {
			return errorResponse(
				`Error: ${error instanceof Error ? error.message : "Unknown error"}`
			);
		}
	}
);

// ============================================================
// TOOL: get_case_law_decisions
// ============================================================
server.tool(
	"get_case_law_decisions",
	"List case law decisions from a specific court database. Use date filters to narrow results. " +
	"Useful for browsing recent decisions from a specific court. " +
	"Results are ordered by most recently added. Use get_case_metadata to get full details on a specific case.",
	{
		language: z.enum(["en", "fr"]).default("en")
			.describe("Language: 'en' for English (default), 'fr' for French"),
		databaseId: pathSegmentSchema
			.describe("Court database ID (e.g., 'onsc' for Ontario Superior Court, 'onca' for Ontario Court of Appeal, 'csc-scc' for Supreme Court of Canada)"),
		offset: z.number().default(0)
			.describe("Start position for results (default 0 = most recent)"),
		resultCount: z.number().max(10000).default(20)
			.describe("Number of results to return (max 10,000, default 20)"),
		...dateParametersSchema,
	},
	async (params) => {
		try {
			const { language, databaseId, offset, resultCount, ...dateParams } = params;

			const urlParams = new URLSearchParams({
				api_key: apiKey,
				offset: offset.toString(),
				resultCount: resultCount.toString(),
			});
			buildDateParams(urlParams, dateParams);

			const response = await apiFetch(
				`https://api.canlii.org/v1/caseBrowse/${language}/${encodeURIComponent(databaseId)}/?${urlParams.toString()}`
			);

			if (!response.ok) {
				return errorResponse(`Error: Failed to fetch case law decisions (${response.status})`);
			}

			const data = await response.json();
			const parsed = CasesResponseSchema.parse(data);
			return jsonResponse(parsed);
		} catch (error) {
			return errorResponse(
				`Error: ${error instanceof Error ? error.message : "Unknown error"}`
			);
		}
	}
);

// ============================================================
// TOOL: get_case_metadata
// ============================================================
server.tool(
	"get_case_metadata",
	"Get detailed metadata for a specific case including its CanLII URL, citation, decision date, docket number, keywords, and topics. " +
	"The URL field links directly to the full decision text on canlii.org — always provide this to the user for verification. " +
	"Use after finding a case via search or browse to get complete details before citing it.",
	{
		language: z.enum(["en", "fr"]).default("en")
			.describe("Language: 'en' for English (default), 'fr' for French"),
		databaseId: pathSegmentSchema
			.describe("Court database ID (e.g., 'onsc', 'onca', 'csc-scc')"),
		caseId: pathSegmentSchema
			.describe("Case unique identifier from search/browse results (e.g., '2021onsc8582')"),
		...dateParametersSchema,
	},
	async (params) => {
		try {
			const { language, databaseId, caseId, ...dateParams } = params;
			const urlParams = new URLSearchParams({ api_key: apiKey });
			buildDateParams(urlParams, dateParams);

			const response = await apiFetch(
				`https://api.canlii.org/v1/caseBrowse/${language}/${encodeURIComponent(databaseId)}/${encodeURIComponent(caseId)}/?${urlParams.toString()}`
			);

			if (!response.ok) {
				return errorResponse(`Error: Failed to fetch case metadata (${response.status})`);
			}

			const data = await response.json();
			const parsed = CaseMetadataSchema.parse(data);
			return jsonResponse(parsed);
		} catch (error) {
			return errorResponse(
				`Error: ${error instanceof Error ? error.message : "Unknown error"}`
			);
		}
	}
);

// ============================================================
// TOOL: get_case_citator
// ============================================================
server.tool(
	"get_case_citator",
	"Look up citation relationships for a case. Critical for verifying if a case is still good law. " +
	"Use 'citingCases' to see what later cases cite this decision — if many recent cases cite it approvingly, it is strong authority. " +
	"Use 'citedCases' to see what authorities this case relied on. " +
	"Use 'citedLegislations' to see what statutes the case references. " +
	"Returns the full list of citing/cited items.",
	{
		language: z.enum(["en", "fr"]).default("en")
			.describe("Language: 'en' for English (default), 'fr' for French"),
		databaseId: pathSegmentSchema
			.describe("Court database ID (e.g., 'onsc', 'onca', 'csc-scc')"),
		caseId: pathSegmentSchema
			.describe("Case unique identifier (e.g., '2021onsc8582')"),
		metadataType: z.enum(["citedCases", "citingCases", "citedLegislations"])
			.describe("'citingCases' = what later cases cite this one (check if still good law); 'citedCases' = what this case relies on; 'citedLegislations' = statutes referenced"),
		...dateParametersSchema,
	},
	async (params) => {
		try {
			const { language, databaseId, caseId, metadataType, ...dateParams } = params;
			const urlParams = new URLSearchParams({ api_key: apiKey });
			buildDateParams(urlParams, dateParams);

			const response = await apiFetch(
				`https://api.canlii.org/v1/caseCitator/${language}/${encodeURIComponent(databaseId)}/${encodeURIComponent(caseId)}/${metadataType}?${urlParams.toString()}`
			);

			if (!response.ok) {
				return errorResponse(`Error: Failed to fetch case citator data (${response.status})`);
			}

			const data = await response.json();

			const schemaMap = {
				citedCases: CitedCasesResponseSchema,
				citingCases: CitingCasesResponseSchema,
				citedLegislations: CitedLegislationsResponseSchema,
			} as const;

			const parsed = schemaMap[metadataType].parse(data);
			return jsonResponse(parsed);
		} catch (error) {
			return errorResponse(
				`Error: ${error instanceof Error ? error.message : "Unknown error"}`
			);
		}
	}
);

// ============================================================
// TOOL: get_case_citator_tease
// ============================================================
server.tool(
	"get_case_citator_tease",
	"Quick preview of citation relationships (max 5 results). Faster than the full citator. " +
	"Use this for a quick check on whether a case has been cited, then use get_case_citator for the complete list if needed.",
	{
		language: z.enum(["en", "fr"]).default("en")
			.describe("Language: 'en' for English (default), 'fr' for French"),
		databaseId: pathSegmentSchema
			.describe("Court database ID (e.g., 'onsc', 'onca', 'csc-scc')"),
		caseId: pathSegmentSchema
			.describe("Case unique identifier (e.g., '2021onsc8582')"),
		metadataType: z.enum(["citedCases", "citingCases", "citedLegislations"])
			.describe("Type of citation data to preview"),
	},
	async ({ language, databaseId, caseId, metadataType }) => {
		try {
			const params = new URLSearchParams({ api_key: apiKey });

			const response = await apiFetch(
				`https://api.canlii.org/v1/caseCitatorTease/${language}/${encodeURIComponent(databaseId)}/${encodeURIComponent(caseId)}/${metadataType}?${params.toString()}`
			);

			if (!response.ok) {
				return errorResponse(`Error: Failed to fetch citator tease data (${response.status})`);
			}

			const data = await response.json();

			const schemaMap = {
				citedCases: CitedCasesResponseSchema,
				citingCases: CitingCasesResponseSchema,
				citedLegislations: CitedLegislationsResponseSchema,
			} as const;

			const parsed = schemaMap[metadataType].parse(data);
			return jsonResponse(parsed);
		} catch (error) {
			return errorResponse(
				`Error: ${error instanceof Error ? error.message : "Unknown error"}`
			);
		}
	}
);

// ============================================================
// TOOL: get_legislation_databases
// ============================================================
server.tool(
	"get_legislation_databases",
	"List all available legislation databases in Canada. Returns database IDs for browsing statutes and regulations. " +
	"Key databases: ons (Ontario Statutes), onr (Ontario Regulations), cas (Canada Statutes), car (Canada Regulations), " +
	"bcs (BC Statutes), abs (Alberta Statutes).",
	{
		language: z.enum(["en", "fr"]).default("en")
			.describe("Language: 'en' for English (default), 'fr' for French"),
		...dateParametersSchema,
	},
	async (params) => {
		try {
			const { language, ...dateParams } = params;
			const urlParams = new URLSearchParams({ api_key: apiKey });
			buildDateParams(urlParams, dateParams);

			const response = await apiFetch(
				`https://api.canlii.org/v1/legislationBrowse/${language}/?${urlParams.toString()}`
			);

			if (!response.ok) {
				return errorResponse(`Error: Failed to fetch legislation databases (${response.status})`);
			}

			const data = await response.json();
			const parsed = LegislationResponseSchema.parse(data);
			return jsonResponse(parsed);
		} catch (error) {
			return errorResponse(
				`Error: ${error instanceof Error ? error.message : "Unknown error"}`
			);
		}
	}
);

// ============================================================
// TOOL: browse_legislation
// ============================================================
server.tool(
	"browse_legislation",
	"List all legislation items in a specific database. Use to find legislation IDs for metadata lookup. " +
	"Key statutes by database — ons: Children's Law Reform Act, Family Law Act, Employment Standards Act. " +
	"cas: Divorce Act, Criminal Code, Canada Labour Code, Federal Child Support Guidelines.",
	{
		language: z.enum(["en", "fr"]).default("en")
			.describe("Language: 'en' for English (default), 'fr' for French"),
		databaseId: pathSegmentSchema
			.describe("Legislation database ID (e.g., 'ons' for Ontario Statutes, 'cas' for Canada Statutes, 'onr' for Ontario Regulations)"),
		...dateParametersSchema,
	},
	async (params) => {
		try {
			const { language, databaseId, ...dateParams } = params;
			const urlParams = new URLSearchParams({ api_key: apiKey });
			buildDateParams(urlParams, dateParams);

			const response = await apiFetch(
				`https://api.canlii.org/v1/legislationBrowse/${language}/${encodeURIComponent(databaseId)}/?${urlParams.toString()}`
			);

			if (!response.ok) {
				return errorResponse(`Error: Failed to fetch legislation list (${response.status})`);
			}

			const data = await response.json();
			const parsed = LegislationItemResponseSchema.parse(data);
			return jsonResponse(parsed);
		} catch (error) {
			return errorResponse(
				`Error: ${error instanceof Error ? error.message : "Unknown error"}`
			);
		}
	}
);

// ============================================================
// TOOL: get_legislation_regulation_metadata
// ============================================================
server.tool(
	"get_legislation_regulation_metadata",
	"Get metadata for a specific statute or regulation including its CanLII URL, citation, and table of contents. " +
	"The URL links directly to the full legislation text on canlii.org — always provide this to the user.",
	{
		language: z.enum(["en", "fr"]).default("en")
			.describe("Language: 'en' for English (default), 'fr' for French"),
		databaseId: pathSegmentSchema
			.describe("Legislation database ID (e.g., 'ons' for Ontario Statutes)"),
		legislationId: pathSegmentSchema
			.describe("Specific legislation ID from browse results"),
	},
	async ({ language, databaseId, legislationId }) => {
		try {
			const params = new URLSearchParams({ api_key: apiKey });

			const response = await apiFetch(
				`https://api.canlii.org/v1/legislationBrowse/${language}/${encodeURIComponent(databaseId)}/${encodeURIComponent(legislationId)}/?${params.toString()}`
			);

			if (!response.ok) {
				return errorResponse(`Error: Failed to fetch legislation metadata (${response.status})`);
			}

			const data = await response.json();
			const parsed = LegislationMetadataSchema.parse(data);
			return jsonResponse(parsed);
		} catch (error) {
			return errorResponse(
				`Error: ${error instanceof Error ? error.message : "Unknown error"}`
			);
		}
	}
);

async function main() {
	const transport = new StdioServerTransport();
	await server.connect(transport);
}

main().catch((error) => {
	console.error("Fatal error:", error);
	process.exit(1);
});
