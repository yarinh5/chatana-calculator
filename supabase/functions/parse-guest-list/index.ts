const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `אתה מערכת ניתוח רשימות מוזמנים לחתונה.
קבל טקסט חופשי (שמות בשורות, "משפחת כהן - 4", "דני ורונית 2", הערות, טלפונים, פורמטים מעורבים) וחלץ ממנו רשימת אורחים מובנית.
החזר JSON בלבד, ללא שום טקסט נוסף, במבנה:
{"guests":[{"full_name":"שם מלא","group_size":1,"phone":"050-0000000 או null","notes":"הערות או null","side":"חתן|כלה|משותף"}],"total_parsed":0,"warnings":["אזהרות"]}
אם הצד אינו ברור — "משותף". אל תמציא אורחים שלא מופיעים בטקסט.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { rawText } = await req.json();
    if (!rawText || typeof rawText !== "string" || !rawText.trim()) {
      return new Response(JSON.stringify({ error: "חסר טקסט לניתוח" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `הטקסט לניתוח:\n${rawText.slice(0, 40000)}` },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) {
      const details = await res.text();
      console.error(`AI gateway failed [${res.status}]: ${details}`);
      const msg =
        res.status === 429
          ? "יותר מדי בקשות, נסה שוב בעוד רגע"
          : res.status === 402
            ? "נגמרו הקרדיטים ל-AI"
            : "ניתוח הרשימה נכשל";
      return new Response(JSON.stringify({ error: msg, details }), {
        status: res.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await res.json();
    const text: string = data.choices?.[0]?.message?.content ?? "{}";
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      const m = text.match(/\{[\s\S]*\}/);
      parsed = m ? JSON.parse(m[0]) : { guests: [], total_parsed: 0, warnings: ["לא הצלחנו לנתח את התשובה"] };
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("parse-guest-list error", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
