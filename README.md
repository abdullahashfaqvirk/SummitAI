# SummitAI — MCP Agent for Meeting Management

SummitAI is a powerful and extensible [Model Context Protocol (MCP)](https://modelcontextprotocol.org) agent designed to streamline your meeting documentation workflow. It can **summarize meeting notes**, **share results to Discord**, and manage files — all securely within scoped directories.

---

## 🚀 Features

- 📄 **Summarize Meeting Notes** from `.txt`, `.doc`, and `.docx` files
- 🔁 **Send summaries to Discord** for collaboration
- ✏️ **Rename, Delete**, and manage documents with ease
- 🔒 **Scoped access control** to restrict file operations within secure directories

---

## 📁 Directory Structure

The agent uses two scoped directories under `/data` for secure file operations:

- `data/read/` — input meeting notes  
- `data/write/` — output summaries and edited files

Both directories are auto-initialized with full permissions (`777`) at runtime.

---

## 🛠️ Tools & Capabilities

| Tool               | Description |
|--------------------|-------------|
| `summarize_meeting` | Generate structured summaries from meeting notes |
| `send_to_discord`   | Send a generated summary to Discord |
| `rename_document`   | Rename a file in the write directory |
| `delete_document`   | Delete a file from the write directory |

---

## 🔎 Structured Summary Format

Summaries follow a professional structure with four main sections:

- `📅 Meeting Summary`
- `✅ Action Items`
- `📌 Key Decisions`
- `👥 Attendees`

> Example Action Item:  
> `- @alice: Finalize budget proposal by Friday`

---

## 🧪 Supported File Types

- `.txt`
- `.doc`
- `.docx`

For `.doc`/`.docx`, SummitAI uses `mammoth` to extract raw text for summarization.

---

## ⚙️ Setup & Running

### 1. Clone the repository
```bash
git clone git@github.com:abdullahashfaqvirk/SummitAI.git
cd SummitAI
```

### 2. Install dependencies
```bash
npm install
pnpm install
```

### 3. Build the project
```bash
npm run build
```

### 4. Run the MCP Agent (Option 1)
```bash
npx -y supergateway --stdio "uvx mcp-server-git"
```

### 5. Run the MCP Agent (Option 2 with compiled JS)
```bash
npx -y supergateway --stdio "node ./dist/index.js ." --port 8000 --baseUrl "http://localhost" --ssePath /sse --messagePath /message --cors "*"
```

### 6. Optional: Expose Locally Running Server
```bash
ngrok http 8000
```

---

## 📦 Tech Stack

- Node.js
- TypeScript
- Zod for input validation
- Mammoth for `.docx` parsing
- MCP SDK for agent-server communication

---

## 🧰 Development Tips

- All file paths are validated and scoped for security
- Permissions (chmod 666/777) are explicitly set for compatibility
- Extend the `CallToolRequestSchema` handler to add more capabilities

---

## 🤝 Contributing

Pull requests and ideas are welcome! Let’s make meeting management smarter together.

---

## 📄 License

MIT License © 2025 Abdullah Ashfaq
