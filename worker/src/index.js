import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createMcpHandler } from "agents/mcp";
import { z } from "zod";

const REPO = "RB-forever/Rhett";
const CDN = `https://cdn.jsdelivr.net/gh/${REPO}@main/`;
const API = `https://api.github.com/repos/${REPO}/contents/`;
const WIDGET_URI = "ui://aiden-sticker/sticker.html";

const widgetHtml = `<!doctype html>
<html><head><meta charset="utf-8"><style>
html,body{margin:0;padding:0;background:transparent;overflow:hidden}
body{display:flex;justify-content:flex-start;align-items:flex-start}
img{display:none;width:120px;height:auto;border-radius:8px;object-fit:contain}
</style></head><body><img id="s"><script>
const img=document.getElementById('s');
function draw(d){if(!d||!d.url)return;img.src=d.url;img.alt=d.alt||'sticker';img.style.display='block'}
if(window.openai&&window.openai.toolOutput)draw(window.openai.toolOutput);
window.addEventListener('message',e=>{const m=e.data;if(m&&m.method==='ui/notifications/tool-result')draw(m.params&&m.params.structuredContent)});
</script></body></html>`;

function buildServer() {
  const server = new McpServer({ name: "Aiden Sticker", version: "0.1.0" });

  server.resource("sticker-widget", WIDGET_URI, async () => ({
    contents: [{
      uri: WIDGET_URI,
      mimeType: "text/html;profile=mcp-app",
      text: widgetHtml,
      _meta: {
        "openai/widgetPrefersBorder": false,
        "openai/widgetCSP": { resource_domains: ["https://cdn.jsdelivr.net"] }
      }
    }]
  }));

  server.tool(
    "list_stickers",
    "List available reaction sticker filenames. Use only when needed to choose a fitting sticker; do not call on every reply.",
    {},
    async () => {
      const r = await fetch(API, { headers: { "Accept": "application/vnd.github+json", "User-Agent": "aiden-sticker-mcp" } });
      if (!r.ok) return { content: [{ type: "text", text: `Could not list stickers (${r.status}).` }] };
      const files = await r.json();
      const names = files.filter(x => x.type === "file" && /\\.(jpg|jpeg|png|webp|gif)$/i.test(x.name)).map(x => x.name);
      return { content: [{ type: "text", text: names.join("\n") }] };
    }
  );

  server.tool(
    "show_sticker",
    "Display one small reaction sticker naturally in conversation when it genuinely fits. Do not use on every message and do not announce the tool call.",
    { filename: z.string().min(1) },
    async ({ filename }) => {
      const name = filename.trim();
      if (name.includes("/") || name.includes("\\\\") || name.includes("..") || !/\\.(jpg|jpeg|png|webp|gif)$/i.test(name)) {
        return { content: [{ type: "text", text: "Invalid sticker filename." }], isError: true };
      }
      const url = CDN + encodeURIComponent(name);
      return {
        structuredContent: { url, alt: name },
        content: [{ type: "text", text: `Displayed sticker: ${name}` }],
        _meta: { "openai/outputTemplate": WIDGET_URI }
      };
    }
  );

  return server;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/") return new Response("Aiden Sticker MCP", { status: 200 });
    if (url.pathname !== "/mcp") return new Response("Not found", { status: 404 });
    return createMcpHandler(buildServer())(request, env, ctx);
  }
};
