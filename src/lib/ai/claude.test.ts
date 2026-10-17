import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { runStructured } from "./claude";

const tool = { name: "submit_analysis", input_schema: { type: "object" } };
const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });

afterEach(() => vi.unstubAllGlobals());

describe("runStructured", () => {
  it("handles search, pause_turn and returns the tool input with usage and urls", async () => {
    process.env.ANTHROPIC_API_KEY = "test";
    const calls: unknown[] = [];
    const replies = [
      ok({
        stop_reason: "pause_turn",
        usage: { input_tokens: 1000, output_tokens: 100, server_tool_use: { web_search_requests: 2 } },
        content: [
          { type: "server_tool_use", id: "s1", name: "web_search", input: { query: "קליניקה רמת גן" } },
          { type: "web_search_tool_result", tool_use_id: "s1", content: [{ type: "web_search_result", url: "https://competitor.co.il/", title: "x" }] },
        ],
      }),
      ok({
        stop_reason: "tool_use",
        usage: { input_tokens: 2000, output_tokens: 900 },
        content: [{ type: "tool_use", id: "t1", name: "submit_analysis", input: { business_summary: "ok" } }],
      }),
    ];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => (calls.push(JSON.parse(String(init.body))), replies.shift()!)));
    const r = await runStructured<{ business_summary: string }>({ model: "claude-sonnet-5-5", system: "s", prompt: "p", submitTool: tool, webSearch: { type: "web_search_20250305", name: "web_search" } });
    expect(r.result.business_summary).toBe("ok");
    expect(r.urls).toEqual(["https://competitor.co.il/"]);
    expect(r.usage).toMatchObject({ inputTokens: 3000, outputTokens: 1000, searches: 2 });
    expect(r.usage.costUsd).toBeCloseTo((3000 * 2 + 1000 * 10) / 1e6 + 0.02, 4);
    // after pause_turn the assistant content is resent unchanged
    expect((calls[1] as { messages: { role: string }[] }).messages.map((m) => m.role)).toEqual(["user", "assistant"]);
  });

  it("forces the submit tool when the model answers in plain text", async () => {
    process.env.ANTHROPIC_API_KEY = "test";
    const bodies: { tool_choice?: unknown }[] = [];
    const replies = [
      ok({ stop_reason: "end_turn", usage: {}, content: [{ type: "text", text: "הנה הניתוח" }] }),
      ok({ stop_reason: "tool_use", usage: {}, content: [{ type: "tool_use", id: "t", name: "submit_analysis", input: { a: 1 } }] }),
    ];
    vi.stubGlobal("fetch", vi.fn(async (_u: string, init: RequestInit) => (bodies.push(JSON.parse(String(init.body))), replies.shift()!)));
    const r = await runStructured<{ a: number }>({ model: "claude-haiku-5-5", system: "s", prompt: "p", submitTool: tool, webSearch: null });
    expect(r.result.a).toBe(1);
    expect((bodies[0] as { model?: string }).model).toBe("claude-haiku-5-5");
    expect(bodies[1].tool_choice).toEqual({ type: "tool", name: "submit_analysis" });
  });

  it("maps API errors to readable Hebrew messages", async () => {
    process.env.ANTHROPIC_API_KEY = "bad";
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { message: "invalid x-api-key" } }), { status: 401 })));
    await expect(runStructured({ model: "claude-haiku-5-5", system: "s", prompt: "p", submitTool: tool })).rejects.toThrow("מפתח ה-API של Anthropic לא תקין");
  });
});
