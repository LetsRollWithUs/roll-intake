/**
 * Gemini als alternatief model voor Jouw schilderplan (PROJECTHULP_MODEL=gemini-...).
 *
 * De chat praat intern in de vorm van de Claude-API (berichten met text-, tool_use- en tool_result-blokken). Deze
 * module vertaalt die vorm naar Gemini en het antwoord weer terug, zodat de tools, de controle, het projectmodel en de
 * testset hetzelfde blijven. Geen streaming: de tekst komt in één keer.
 */

const GEMINI_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
const URL_BASIS = "https://generativelanguage.googleapis.com/v1beta/models";

export const isGemini = (model: string) => model.startsWith("gemini-");

/** Een tool in Claude-vorm naar een Gemini-functie; het JSON-schema gaat ongewijzigd mee. */
function functie(t: any) {
  return { name: t.name, description: t.description, parametersJsonSchema: t.input_schema };
}

/** De berichten in Claude-vorm naar Gemini-"contents". */
function naarContents(messages: any[]) {
  const namen = new Map<string, string>();
  return messages.map((m) => {
    const blokken = "string" === typeof m.content ? [{ type: "text", text: m.content }] : m.content;
    const parts = blokken.flatMap((b: any) => {
      if ("text" === b.type) return b.text ? [{ text: b.text }] : [];
      if ("tool_use" === b.type) {
        namen.set(b.id, b.name);
        // Gemini 3 wil de handtekening van zijn eigen functieaanroep terugzien in het vervolg van de beurt.
        return [{ functionCall: { id: b.id, name: b.name, args: b.input ?? {} }, ...(b.sig ? { thoughtSignature: b.sig } : {}) }];
      }
      if ("tool_result" === b.type) {
        let uit: unknown = b.content;
        try { uit = JSON.parse(String(b.content)); } catch { /* gewone tekst */ }
        return [{ functionResponse: { id: b.tool_use_id, name: namen.get(b.tool_use_id) ?? "onbekend", response: { result: uit } } }];
      }
      return [];
    });
    return { role: "assistant" === m.role ? "model" : "user", parts };
  });
}

let volgnr = 0;

/** Eén modelaanroep; geeft { content, usage, stop_reason } terug in dezelfde vorm als Claude. */
export async function geminiStap(o: { model: string; system: string; tools: any[]; messages: any[]; maxTokens: number }) {
  if (!GEMINI_KEY) throw new Error("GEMINI_API_KEY ontbreekt");
  // Gemini 3 kent denkniveaus; oudere modellen een denkbudget. Een gesprek als dit heeft genoeg aan weinig nadenken.
  const denken = /gemini-[3-9]/.test(o.model) ? { thinkingLevel: "low" } : { thinkingBudget: 0 };
  const res = await fetch(`${URL_BASIS}/${o.model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": GEMINI_KEY },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: o.system }] },
      contents: naarContents(o.messages),
      ...(o.tools.length ? { tools: [{ functionDeclarations: o.tools.map(functie) }] } : {}),
      generationConfig: { maxOutputTokens: o.maxTokens, thinkingConfig: denken },
    }),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(`gemini ${res.status}: ${JSON.stringify(j?.error ?? j).slice(0, 300)}`);
  const kandidaat = j.candidates?.[0];
  const content: any[] = [];
  for (const p of kandidaat?.content?.parts ?? []) {
    if (p.thought) continue;
    if (p.functionCall) content.push({ type: "tool_use", id: p.functionCall.id || `g${Date.now()}_${volgnr++}`, name: p.functionCall.name, input: p.functionCall.args ?? {}, sig: p.thoughtSignature });
    else if (p.text) content.push({ type: "text", text: p.text });
  }
  const u = j.usageMetadata ?? {};
  const cache = u.cachedContentTokenCount ?? 0;
  const reden = kandidaat?.finishReason;
  return {
    content,
    usage: { input_tokens: (u.promptTokenCount ?? 0) - cache, output_tokens: (u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0), cache_read_input_tokens: cache },
    stop_reason: ["SAFETY", "PROHIBITED_CONTENT", "BLOCKLIST", "RECITATION"].includes(reden) ? "refusal" : "MAX_TOKENS" === reden ? "max_tokens" : content.some((c) => "tool_use" === c.type) ? "tool_use" : "end_turn",
  };
}
