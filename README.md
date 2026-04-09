# CanLII MCP Server

[![npm version](https://img.shields.io/npm/v/canlii-mcp)](https://www.npmjs.com/package/canlii-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

A [Model Context Protocol (MCP)](https://modelcontextprotocol.io) server for searching Canadian legal information via the [CanLII](https://www.canlii.org) API. Search cases, browse legislation, and check citations — all from Claude Desktop or Claude Code.

```bash
npx canlii-mcp
```

## Features

- **Full-text search** — search across all of CanLII by keyword, case name, or legal concept
- **Case citator** — check if a case is still good law by finding what later cases cite it
- **Legislation browsing** — browse statutes and regulations by jurisdiction
- **Bilingual** — English and French support across all tools including the citator
- **9 tools** — search, browse courts, browse cases, case metadata, full citator, citator preview, legislation databases, browse legislation, legislation metadata
- **Built-in rate limiting** — serialized request queue respects CanLII's API limits (2 req/sec, 1 concurrent, 5,000/day)
- **Input validation** — all parameters regex-validated and URI-encoded to prevent injection
- **Minimal footprint** — 2 runtime dependencies, ~500 lines of code, runs locally as a stdio process
- **Security-first** — no file system access, no shell execution, only connects to `api.canlii.org`

## Quick Start

**Prerequisites:** Node.js 18+ and a [CanLII API key](https://www.canlii.org/en/feedback/feedback.html) (free for research use).

**Claude Desktop** — add to your config (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "canlii": {
      "command": "npx",
      "args": ["-y", "canlii-mcp"],
      "env": {
        "CANLII_API_KEY": "your_api_key_here"
      }
    }
  }
}
```

Restart Claude Desktop after saving.

**Claude Code:**

```bash
claude mcp add canlii -e CANLII_API_KEY=your_key -- npx -y canlii-mcp
```

**From source** (for development):

```bash
git clone https://github.com/mohammadfarooqi/canlii-mcp.git
cd canlii-mcp
npm install && npm run build
```

## Available Tools (9)

### search

Full-text keyword search across all of CanLII — cases, legislation, and commentary. This is the primary entry point for legal research.

```
search({ query: "material change in circumstances Ontario", resultCount: 10 })
```

### get_courts_and_tribunals

List all available court and tribunal databases. Returns database IDs needed by other tools.

Key Ontario databases: `onsc` (Superior Court), `onca` (Court of Appeal), `oncj` (Court of Justice), `csc-scc` (Supreme Court of Canada).

### get_case_law_decisions

Browse case law decisions from a specific court database, ordered by most recently added. Supports date filters.

```
get_case_law_decisions({ databaseId: "onsc", resultCount: 20 })
```

### get_case_metadata

Get full details for a specific case — citation, decision date, docket number, keywords, and **CanLII URL** for reading the full decision.

```
get_case_metadata({ databaseId: "onsc", caseId: "2021onsc8582" })
```

### get_case_citator

Look up citation relationships for a case. Use `citingCases` to check if a case is still good law.

```
get_case_citator({ databaseId: "csc-scc", caseId: "1996canlii190", metadataType: "citingCases" })
```

### get_case_citator_tease

Quick citation preview returning max 5 results. Faster than the full citator for a quick check.

```
get_case_citator_tease({ databaseId: "csc-scc", caseId: "1996canlii190", metadataType: "citingCases" })
```

### get_legislation_databases

List all legislation databases. Ontario: `ons` (Statutes), `onr` (Regulations). Federal: `cas` (Statutes), `car` (Regulations).

### browse_legislation

List legislation items within a specific database.

```
browse_legislation({ databaseId: "ons" })
```

### get_legislation_regulation_metadata

Get metadata for a specific statute or regulation, including its CanLII URL.

## Typical Research Workflow

1. **Search** — `search({ query: "gatekeeping parenting time" })` to find relevant cases
2. **Get details** — `get_case_metadata(...)` to get the full citation and CanLII URL
3. **Check citations** — `get_case_citator(..., metadataType: "citingCases")` to verify the case is still good law
4. **Read the decision** — Click the CanLII URL to read the full text on canlii.org

## API Rate Limits

Per CanLII's API terms:
- **5,000 queries per day**
- **2 requests per second**
- **1 request at a time**
- Metadata access only — full document text is not available via the API

The server enforces these limits automatically with a built-in rate limiter.

## Development

```bash
npm run build    # Compile TypeScript
npm run start    # Run the server (needs CANLII_API_KEY env var)
```

### Project Structure

```
src/
  index.ts     # MCP server — tools, rate limiter, stdio transport
  schema.ts    # Zod schemas for CanLII API responses
```

## Contributing

Contributions are welcome! This project aims to make Canadian legal research more accessible through AI tooling.

**Ways to contribute:**
- Report bugs or unexpected API behavior — [open an issue](https://github.com/mohammadfarooqi/canlii-mcp/issues)
- Suggest new tools or improvements — [start a discussion](https://github.com/mohammadfarooqi/canlii-mcp/issues)
- Submit a PR with fixes or new features

**To submit a PR:**
1. Fork this repository
2. Create a feature branch (`git checkout -b feature/my-improvement`)
3. Make your changes and test locally (`npm run build && CANLII_API_KEY=your_key npm run start`)
4. Commit and push to your fork
5. Open a pull request with a description of what you changed and why

If you find issues with the CanLII API responses, schema mismatches, or have ideas for new tools that would help legal researchers, please open an issue — even if you're not sure how to fix it. We'll investigate together.

## Security

This server is designed to be transparent and minimal:

- **Only connects to `api.canlii.org`** — no other network calls, no telemetry, no analytics
- **API key stays local** — passed via environment variable, never logged or included in responses
- **All inputs validated** — database IDs, case IDs, and dates are regex-validated before use; path segments are URI-encoded
- **All API responses validated** — parsed through Zod schemas before being returned
- **No file system access** — the server only makes HTTPS calls to CanLII
- **No shell execution** — no `child_process`, `exec`, or `spawn`
- **2 runtime dependencies** — `@modelcontextprotocol/sdk` (official Anthropic MCP SDK) and `zod` (schema validation)
- **Rate limiter built in** — serialized request queue prevents API abuse
- **MIT licensed, fully open source** — read every line at [src/index.ts](src/index.ts) (~350 lines) and [src/schema.ts](src/schema.ts) (~140 lines)

If you discover a security issue, please see [SECURITY.md](SECURITY.md).

## Known Limitations

- **No decision body text** — full-text *search* works (searching across case titles, citations, and content), but the API cannot return the full text of a decision. You must click the CanLII URL to read the decision on canlii.org (the URL is always included in metadata responses)
- **Search endpoint is undocumented** — it works but is not in CanLII's official API docs, so it could change without notice
- **Search has no database/jurisdiction filter** — you cannot limit search results to a specific court or province server-side; add jurisdiction keywords to your query instead (e.g., "custody Ontario" instead of just "custody")
- **Rate limits are strict** — 5,000 queries/day, 2 req/sec, 1 concurrent request (enforced automatically by the built-in rate limiter)

## License

MIT — see [LICENSE](LICENSE).
