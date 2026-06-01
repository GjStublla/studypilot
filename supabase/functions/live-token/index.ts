import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req: Request) => {
  // Only allow POST
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  // --- 1. Verify Supabase JWT ---
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Missing authorization header" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const jwt = authHeader.replace("Bearer ", "");

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: { user }, error: authError } = await supabase.auth.getUser(jwt);

  if (authError || !user) {
    return new Response(JSON.stringify({ error: "Invalid or expired token" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  // --- 2. Parse request body ---
  let sessionId: string | undefined;
  try {
    const body = await req.json();
    sessionId = body.sessionId;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!sessionId) {
    return new Response(JSON.stringify({ error: "sessionId is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // --- 3. Verify the session belongs to this user ---
  const { data: session, error: sessionError } = await supabase
    .from("sessions")
    .select("id, user_id")
    .eq("id", sessionId)
    .eq("user_id", user.id)
    .single();

  if (sessionError || !session) {
    return new Response(JSON.stringify({ error: "Session not found or access denied" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  // --- 4. Request ephemeral token from Gemini Live ---
  // Gemini Live ephemeral tokens are created via the token exchange endpoint.
  const tokenExpirySeconds = 60 * 60; // 1 hour

  const geminiResponse = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/ephemeralTokens?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "models/gemini-2.0-flash-live-001",
        config: {
          // Socratic coaching system instruction baked into the token config
          systemInstruction: {
            parts: [
              {
                text: `You are StudyPilot, a academic coach helping a student improve their work.
You may: explain rubric criteria, ask guiding questions, critique structure and evidence, suggest revision strategies.
You must not: write assignments for the student, complete their work, generate final answers for submission, or ignore academic integrity.
If asked to write something for the student, redirect with a guiding question instead.`,
              },
            ],
          },
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: "Aoede" },
            },
          },
        },
        expireTime: new Date(Date.now() + tokenExpirySeconds * 1000).toISOString(),
      }),
    }
  );

  if (!geminiResponse.ok) {
    const errorText = await geminiResponse.text();
    console.error("Gemini token error:", errorText);
    return new Response(
      JSON.stringify({ error: "Failed to create Gemini Live token" }),
      {
        status: 502,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  const geminiData = await geminiResponse.json();

  // --- 5. Log the token request in activity_logs ---
  await supabase.from("activity_logs").insert({
    user_id: user.id,
    event_type: "live_token_issued",
    details: { session_id: sessionId },
  });

  // --- 6. Return only the ephemeral token — never the API key ---
  return new Response(
    JSON.stringify({
      ephemeralToken: geminiData.token,
      expiresAt: geminiData.expireTime,
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }
  );
});
