#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema, } from "@modelcontextprotocol/sdk/types.js";
import fs from "fs/promises";
import path from "path";
import os from 'os';
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import mammoth from "mammoth";
// Configure content paths
const DATA_DIR = path.join(process.cwd(), 'data');
const READ_DIR = path.join(DATA_DIR, 'read');
const WRITE_DIR = path.join(DATA_DIR, 'write');
// Initialize directories
async function initDirectories() {
    await fs.mkdir(READ_DIR, { recursive: true });
    await fs.mkdir(WRITE_DIR, { recursive: true });
}
// Security utilities
function normalizePath(p) {
    return path.normalize(p);
}
function expandHome(filepath) {
    if (filepath.startsWith('~/') || filepath === '~') {
        return path.join(os.homedir(), filepath.slice(1));
    }
    return filepath;
}
const allowedDirectories = [
    normalizePath(path.resolve(expandHome(READ_DIR))),
    normalizePath(path.resolve(expandHome(WRITE_DIR)))
];
async function validatePath(requestedPath) {
    const expandedPath = expandHome(requestedPath);
    const absolute = path.isAbsolute(expandedPath)
        ? path.resolve(expandedPath)
        : path.resolve(process.cwd(), expandedPath);
    const normalizedRequested = normalizePath(absolute);
    const isAllowed = allowedDirectories.some(dir => normalizedRequested.startsWith(dir));
    if (!isAllowed) {
        throw new Error(`Access denied: ${absolute} not in allowed directories`);
    }
    return absolute;
}
// Schemas
const SummarizeMeetingArgsSchema = z.object({
    fileName: z.string().describe("Name of meeting file in read directory (supports .txt, .doc, .docx)")
});
const DocumentOperationArgsSchema = z.object({
    fileName: z.string().describe("Name of file in write directory")
});
const DiscordSendArgsSchema = z.object({
    summaryName: z.string().describe("Name of summary file in write directory")
});
const RenameFileArgsSchema = z.object({
    oldName: z.string().describe("Current file name in write directory"),
    newName: z.string().describe("New file name in write directory")
});
// Enhanced content processing
async function processMeetingContent(content) {
    const sections = {
        summary: { title: '### 📅 Meeting Summary', items: [] },
        actions: { title: '### ✅ Action Items', items: [] },
        decisions: { title: '### 📌 Key Decisions', items: [] },
        attendees: { title: '### 👥 Attendees', items: [] }
    };
    let currentSection = null;
    const lines = content.split('\n');
    for (const line of lines) {
        const cleanLine = line.trim();
        // Section detection
        if (/^#{1,3}\s*Summary/gi.test(cleanLine)) {
            currentSection = 'summary';
            continue;
        }
        if (/^#{1,3}\s*Action Items/gi.test(cleanLine)) {
            currentSection = 'actions';
            continue;
        }
        if (/^#{1,3}\s*Decisions/gi.test(cleanLine)) {
            currentSection = 'decisions';
            continue;
        }
        if (/^#{1,3}\s*Attendees/gi.test(cleanLine)) {
            currentSection = 'attendees';
            continue;
        }
        // Content processing
        if (cleanLine && currentSection) {
            const processedLine = cleanLine.replace(/^-?\s*/, '- ').replace(/\s{2,}/g, ' ');
            const section = sections[currentSection];
            if (currentSection === 'actions') {
                const actionMatch = processedLine.match(/@(\w+):\s*(.+)/i);
                actionMatch ? section.items.push(`- @${actionMatch[1]}: ${actionMatch[2]}`)
                    : section.items.push(processedLine);
            }
            else if (currentSection === 'attendees') {
                const attendeeMatch = processedLine.match(/^- (?:@?)(\w+)/i);
                attendeeMatch && section.items.push(`- ${attendeeMatch[1]}`);
            }
            else {
                section.items.push(processedLine);
            }
        }
    }
    // Build structured summary
    return Object.values(sections)
        .map(section => {
        let items = section.items;
        if (section.title.includes('Summary'))
            items = items.slice(0, 5);
        return items.length > 0 ? `${section.title}\n${items.join('\n')}` : '';
    })
        .filter(Boolean)
        .join('\n\n');
}
// Server setup
const server = new Server({
    name: "meeting-docs-manager",
    version: "3.0.0",
}, {
    capabilities: {
        tools: {},
    },
});
// Tool registration
server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
        tools: [
            {
                name: "summarize_meeting",
                description: "Analyzes meeting notes from read directory and generates structured summaries in write directory",
                inputSchema: zodToJsonSchema(SummarizeMeetingArgsSchema)
            },
            {
                name: "send_to_discord",
                description: "Shares summary from write directory to Discord",
                inputSchema: zodToJsonSchema(DiscordSendArgsSchema)
            },
            {
                name: "rename_document",
                description: "Renames a file in the write directory",
                inputSchema: zodToJsonSchema(RenameFileArgsSchema)
            },
            {
                name: "delete_document",
                description: "Deletes a file from the write directory",
                inputSchema: zodToJsonSchema(DocumentOperationArgsSchema)
            }
        ]
    };
});
// Request handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
        const { name, arguments: args } = request.params;
        switch (name) {
            case "summarize_meeting": {
                const parsed = SummarizeMeetingArgsSchema.safeParse(args);
                if (!parsed.success)
                    throw new Error(`Invalid arguments: ${parsed.error}`);
                const filePath = path.join(READ_DIR, parsed.data.fileName);
                const validPath = await validatePath(filePath);
                const ext = path.extname(validPath).toLowerCase();
                let content;
                if (['.docx', '.doc'].includes(ext)) {
                    const buffer = await fs.readFile(validPath);
                    const result = await mammoth.extractRawText({ buffer });
                    content = result.value;
                }
                else if (ext === '.txt') {
                    content = await fs.readFile(validPath, "utf-8");
                }
                else {
                    throw new Error(`Unsupported file type: ${ext}`);
                }
                const summary = await processMeetingContent(content);
                const summaryFileName = `meeting_summary_${Date.now()}.txt`;
                const summaryPath = path.join(WRITE_DIR, summaryFileName);
                await fs.writeFile(summaryPath, summary, "utf-8");
                return {
                    content: [{
                            type: "text",
                            text: `✅ Meeting summary saved: ${summaryFileName}`
                        }]
                };
            }
            case "send_to_discord": {
                const parsed = DiscordSendArgsSchema.safeParse(args);
                if (!parsed.success)
                    throw new Error(`Invalid arguments: ${parsed.error}`);
                const summaryPath = path.join(WRITE_DIR, parsed.data.summaryName);
                const validPath = await validatePath(summaryPath);
                const content = await fs.readFile(validPath, "utf-8");
                return {
                    content: [{
                            type: "text",
                            text: `**Discord Summary**\n${content}`
                        }]
                };
            }
            case "rename_document": {
                const parsed = RenameFileArgsSchema.safeParse(args);
                if (!parsed.success)
                    throw new Error(`Invalid arguments: ${parsed.error}`);
                const oldPath = path.join(WRITE_DIR, parsed.data.oldName);
                const newPath = path.join(WRITE_DIR, parsed.data.newName);
                await fs.rename(await validatePath(oldPath), await validatePath(newPath));
                return {
                    content: [{
                            type: "text",
                            text: `✅ Renamed document: ${parsed.data.oldName} → ${parsed.data.newName}`
                        }]
                };
            }
            case "delete_document": {
                const parsed = DocumentOperationArgsSchema.safeParse(args);
                if (!parsed.success)
                    throw new Error(`Invalid arguments: ${parsed.error}`);
                const filePath = path.join(WRITE_DIR, parsed.data.fileName);
                await fs.unlink(await validatePath(filePath));
                return {
                    content: [{
                            type: "text",
                            text: `🗑️ Deleted document: ${parsed.data.fileName}`
                        }]
                };
            }
            default:
                throw new Error(`Unknown tool: ${name}`);
        }
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
            content: [{
                    type: "text",
                    text: `❌ Error: ${errorMessage}`
                }],
            isError: true
        };
    }
});
// Server startup
async function runServer() {
    await initDirectories();
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Document Manager Server ready");
    console.error("Read directory (meetings):", READ_DIR);
    console.error("Write directory (documents):", WRITE_DIR);
}
runServer().catch((error) => {
    console.error("Server failed:", error);
    process.exit(1);
});
