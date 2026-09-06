Deno.serve(() => {
  const config = {
    GEMINI_TEXT_MODEL: Deno.env.get("GEMINI_TEXT_MODEL") ?? "NOT SET",
    GEMINI_RAG_MODEL: Deno.env.get("GEMINI_RAG_MODEL") ?? "NOT SET",
    GEMINI_LIVE_MODEL: Deno.env.get("GEMINI_LIVE_MODEL") ?? "NOT SET",

    VERTEX_LOCATION: Deno.env.get("VERTEX_LOCATION") ?? "NOT SET",
    VERTEX_RAG_LOCATION:
      Deno.env.get("VERTEX_RAG_LOCATION") ?? "NOT SET",
  };

  return new Response(JSON.stringify(config), {
    headers: {
      "Content-Type": "application/json",
    },
  });
});