import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const API_KEY = process.env.CANLII_API_KEY;
if (!API_KEY) {
	console.error("CANLII_API_KEY env var required to run tests");
	process.exit(1);
}

// Single shared client — avoids spawning multiple server processes
// which would trigger CanLII rate limits
let client: Client;

before(async () => {
	const transport = new StdioClientTransport({
		command: "node",
		args: ["dist/index.js"],
		env: { ...process.env, CANLII_API_KEY: API_KEY! },
	});
	client = new Client({ name: "test", version: "1.0.0" });
	await client.connect(transport);
});

after(async () => {
	await client.close();
});

function parseResult(result: Awaited<ReturnType<typeof client.callTool>>): unknown {
	const text = (result.content as Array<{ text: string }>)[0].text;
	if (text.startsWith("Error:")) {
		throw new Error(`API returned error: ${text}`);
	}
	return JSON.parse(text);
}

// Small delay between API-hitting tests to avoid CanLII rate limits
async function rateDelay() {
	await new Promise(r => setTimeout(r, 600));
}

describe("MCP Server", () => {
	it("registers all 9 tools", async () => {
		const { tools } = await client.listTools();
		assert.equal(tools.length, 9);
		const names = tools.map(t => t.name).sort();
		assert.deepEqual(names, [
			"browse_legislation",
			"get_case_citator",
			"get_case_citator_tease",
			"get_case_law_decisions",
			"get_case_metadata",
			"get_courts_and_tribunals",
			"get_legislation_databases",
			"get_legislation_regulation_metadata",
			"search",
		]);
	});
});

describe("search", () => {
	it("returns results for a keyword query", async () => {
		await rateDelay();
		const data = parseResult(await client.callTool({
			name: "search",
			arguments: { query: "Gordon v Goertz", resultCount: 3, offset: 0 },
		})) as { resultCount: number; results: Array<Record<string, unknown>> };
		assert.ok(data.resultCount > 0, "Should have results");
		assert.ok(data.results.length > 0, "Should return at least one result");
		assert.ok(data.results.some(r => "case" in r), "Should contain case results");
	});
});

describe("get_courts_and_tribunals", () => {
	it("returns court databases including known ones", async () => {
		await rateDelay();
		const data = parseResult(await client.callTool({
			name: "get_courts_and_tribunals",
			arguments: {},
		})) as { caseDatabases: Array<{ databaseId: string }> };
		assert.ok(data.caseDatabases.length > 0, "Should list databases");
		const ids = data.caseDatabases.map(d => d.databaseId);
		assert.ok(ids.includes("onsc"), "Should include Ontario Superior Court");
		assert.ok(ids.includes("csc-scc"), "Should include Supreme Court of Canada");
	});
});

describe("get_case_metadata", () => {
	it("returns metadata with URL for a known case", async () => {
		await rateDelay();
		const data = parseResult(await client.callTool({
			name: "get_case_metadata",
			arguments: { databaseId: "onca", caseId: "2021onca614" },
		})) as { url: string; citation: string; title: string };
		assert.ok(data.url, "Should have a CanLII URL");
		assert.ok(data.url.startsWith("https://"), "URL should be HTTPS");
		assert.ok(data.citation, "Should have a citation");
		assert.ok(data.title, "Should have a title");
	});
});

describe("get_case_citator", () => {
	it("returns citing cases for a known SCC decision", async () => {
		await rateDelay();
		const data = parseResult(await client.callTool({
			name: "get_case_citator",
			arguments: { databaseId: "csc-scc", caseId: "2022scc51", metadataType: "citingCases" },
		})) as { citingCases: unknown[] };
		assert.ok(data.citingCases.length > 0, "SCC case should have citing cases");
	});
});

describe("get_case_citator_tease", () => {
	it("returns max 5 results", async () => {
		await rateDelay();
		const data = parseResult(await client.callTool({
			name: "get_case_citator_tease",
			arguments: { databaseId: "csc-scc", caseId: "2022scc51", metadataType: "citingCases" },
		})) as { citingCases: unknown[] };
		assert.ok(data.citingCases.length <= 5, "Tease should return max 5");
		assert.ok(data.citingCases.length > 0, "Should have at least one result");
	});
});

describe("input validation", () => {
	it("rejects path traversal in databaseId", async () => {
		const result = await client.callTool({
			name: "get_case_metadata",
			arguments: { databaseId: "../etc/passwd", caseId: "test" },
		});
		const text = (result.content as Array<{ text: string }>)[0].text;
		assert.ok(text.toLowerCase().includes("invalid") || text.toLowerCase().includes("error"),
			"Should reject path traversal");
	});

	it("rejects invalid date format", async () => {
		const result = await client.callTool({
			name: "get_case_law_decisions",
			arguments: { databaseId: "onsc", resultCount: 1, decisionDateAfter: "not-a-date" },
		});
		const text = (result.content as Array<{ text: string }>)[0].text;
		assert.ok(text.toLowerCase().includes("invalid") || text.toLowerCase().includes("error"),
			"Should reject bad date format");
	});
});

describe("legislation tools", () => {
	it("lists legislation databases", async () => {
		await rateDelay();
		const data = parseResult(await client.callTool({
			name: "get_legislation_databases",
			arguments: {},
		})) as { legislationDatabases: unknown[] };
		assert.ok(data.legislationDatabases.length > 0, "Should list legislation databases");
	});

	it("browses Ontario statutes", async () => {
		await rateDelay();
		const data = parseResult(await client.callTool({
			name: "browse_legislation",
			arguments: { databaseId: "ons" },
		})) as { legislations: unknown[] };
		assert.ok(data.legislations.length > 0, "Should list Ontario statutes");
	});
});
