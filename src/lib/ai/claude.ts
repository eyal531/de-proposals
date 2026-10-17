import "server-only";

// Minimal Anthropic Messages API client (no SDK). Env: ANTHROPIC_API_KEY. The model is chosen in settings (economy/quality).
import { AI_MODELS, type AiModelChoice } from "../types";
import { requestCost } from "./cost";

export function aiConfigured() {
  return !!process.env.ANTHROPIC_API_KEY;
}
export function aiModel(choice: AiModelChoice | undefined) {
  return AI_MODELS[choice ?? "economy"] ?? AI_MODELS.economy;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export type Block = { type: string; [k: string]: any };
export type ToolDef = { name: string; [k: string]: any };
export interface Message {
  role: "user" | "assistant";
  content: string | Block[];
}
export interface Usage {
  inputTokens: number;
  outputTokens: number;
  searches: number;
  costUsd: number;
  model: string;
}

interface CallOpts {
  model: string;
  system: string;
  messages: Message[];
  tools?: ToolDef[];
  toolChoice?: Block;
  maxTokens?: number;
}

async function call(opts: CallOpts): Promise<any> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": process.env.ANTHROPIC_API_KEY!, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: opts.model,
      max_tokens: opts.maxTokens ?? 8000,
      system: opts.system,
      messages: opts.messages,
      ...(opts.tools ? { tools: opts.tools } : {}),
      ...(opts.toolChoice ? { tool_choice: opts.toolChoice } : {}),
    }),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = json?.error?.message ?? `HTTP ${res.status}`;
    if (res.status === 401) throw new Error("מפתח ה-API של Anthropic לא תקין");
    if (res.status === 429) throw new Error("חרגנו ממכסת השימוש של Anthropic. נסו שוב בעוד דקה");
    if (/credit balance/i.test(msg)) throw new Error("נגמרה יתרת הקרדיט בחשבון Anthropic");
    throw new Error(`שגיאה מ-Claude: ${msg}`);
  }
  return json;
}

// cost is computed per request because some models price a request by its own prompt size
function addUsage(u: Usage, resp: any) {
  const inp = resp?.usage?.input_tokens ?? 0;
  const out = resp?.usage?.output_tokens ?? 0;
  const searches = resp?.usage?.server_tool_use?.web_search_requests ?? 0;
  u.inputTokens += inp;
  u.outputTokens += out;
  u.searches += searches;
  u.costUsd += requestCost(u.model, inp, out, searches);
}

function finishUsage(u: Usage): Usage {
  u.costUsd = Math.round(u.costUsd * 10000) / 10000;
  return u;
}

/**
 * Runs a conversation that may use web search, and ends with Claude calling the client tool `submitTool.name`.
 * Returns the tool input plus every URL Claude saw in search results.
 */
export async function runStructured<T>(opts: { model: string; system: string; prompt: string; submitTool: ToolDef; webSearch?: ToolDef | null; maxTokens?: number }) {
  const usage: Usage = { inputTokens: 0, outputTokens: 0, searches: 0, costUsd: 0, model: opts.model };
  const tools = [...(opts.webSearch ? [opts.webSearch] : []), opts.submitTool];
  const messages: Message[] = [{ role: "user", content: opts.prompt }];
  const urls = new Set<string>();

  for (let step = 0; step < 6; step++) {
    const forced = step >= 4 || (step > 0 && !opts.webSearch);
    const resp = await call({
      model: opts.model,
      system: opts.system,
      messages,
      tools: forced ? [opts.submitTool] : tools,
      toolChoice: forced ? { type: "tool", name: opts.submitTool.name } : undefined,
      maxTokens: opts.maxTokens,
    });
    addUsage(usage, resp);
    for (const b of resp.content as Block[]) {
      if (b.type === "web_search_tool_result" && Array.isArray(b.content)) for (const r of b.content) if (r?.url) urls.add(r.url);
      if (b.type === "tool_use" && b.name === opts.submitTool.name) return { result: b.input as T, usage: finishUsage(usage), urls: Array.from(urls) };
    }
    if (resp.stop_reason === "max_tokens") throw new Error("התשובה של Claude נקטעה (ארוכה מדי)");
    messages.push({ role: "assistant", content: resp.content });
    if (resp.stop_reason === "pause_turn") continue; // server tool loop paused – resend as is
    messages.push({ role: "user", content: `סיימת את המחקר. עכשיו קרא לכלי ${opts.submitTool.name} עם התוצאה המלאה.` });
  }
  throw new Error("Claude לא החזיר תוצאה מובנית");
}

/** Simple text completion (used for rewriting a section). */
export async function complete(model: string, system: string, prompt: string, maxTokens = 3000) {
  const usage: Usage = { inputTokens: 0, outputTokens: 0, searches: 0, costUsd: 0, model };
  const resp = await call({ model, system, messages: [{ role: "user", content: prompt }], maxTokens });
  addUsage(usage, resp);
  const text = (resp.content as Block[])
    .filter((b) => b.type === "text")
    .map((b) => b.text as string)
    .join("")
    .trim();
  return { text, usage: finishUsage(usage) };
}
