# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in this MCP server, please report it responsibly:

1. **Do NOT open a public issue** for security vulnerabilities
2. Email **mohammad.farooqi@gmail.com** with:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
3. You can expect an initial response within 48 hours

## Scope

This MCP server:
- Only makes HTTPS requests to `api.canlii.org`
- Does not access the local file system
- Does not execute shell commands
- Does not send data to any third party
- Validates all inputs with regex and Zod schemas
- Has 2 runtime dependencies (official MCP SDK + Zod)

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.1.x   | Yes       |
| < 1.1   | No        |
