import Anthropic from "@anthropic-ai/sdk";
import { SYSTEM_PROMPT } from "./knowledge";

const ai = new Anthropic({
  baseURL: process.env.SANTAI_AI_BASE_URL,
  apiKey: process.env.SANTAI_AI_TOKEN, // identifies this app; not a provider key
});

const MODEL = "anthropic-claude-bedrock4.5-haiku";
const publicDir = `${import.meta.dir}/public`;

type ChatMessage = { role: "user" | "assistant"; content: string };

async function handleChat(req: Request): Promise<Response> {
  let body: { messages?: ChatMessage[] };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const history = Array.isArray(body.messages) ? body.messages : [];
  // Keep only well-formed turns, cap history to keep prompts small.
  const messages = history
    .filter(
      (m) =>
        m &&
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string" &&
        m.content.trim().length > 0
    )
    .slice(-12)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }));

  if (messages.length === 0 || messages[messages.length - 1].role !== "user") {
    return Response.json(
      { error: "Send at least one user message." },
      { status: 400 }
    );
  }

  try {
    const msg = await ai.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages,
    });
    const text = msg.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim();
    return Response.json({
      reply:
        text ||
        "Sorry, I couldn't come up with a response. Try rephrasing your question about Ashar.",
    });
  } catch (err) {
    console.error("AI request failed:", err);
    return Response.json(
      { error: "The assistant is having trouble right now. Please try again." },
      { status: 502 }
    );
  }
}

export default {
  port: process.env.PORT || 3000,
  async fetch(req: Request): Promise<Response> {
    const { pathname } = new URL(req.url);

    if (pathname === "/api/chat" && req.method === "POST") {
      return handleChat(req);
    }

    // Static files
    const rel = pathname === "/" ? "/index.html" : pathname;
    const file = Bun.file(`${publicDir}${rel}`);
    if (await file.exists()) {
      return new Response(file);
    }

    // SPA fallback to index for unknown GET routes
    if (req.method === "GET") {
      return new Response(Bun.file(`${publicDir}/index.html`));
    }
    return new Response("Not found", { status: 404 });
  },
};
