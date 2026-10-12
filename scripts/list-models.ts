/**
 * `npm run models`: lists the Gemini models this key can call with generateContent (names only).
 * The key is sent in a request header and is never printed; the request URL isn't printed either.
 */
for (const f of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(f);
  } catch {}
}

(async () => {
  const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!key || /paste_your_key_here/.test(key)) {
    console.log("No GOOGLE_GENERATIVE_AI_API_KEY in .env.local.");
    process.exitCode = 1;
    return;
  }
  const names: string[] = [];
  let pageToken = "";
  do {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?pageSize=200${pageToken ? `&pageToken=${pageToken}` : ""}`, { headers: { "x-goog-api-key": key } });
    const body = (await res.json()) as { models?: { name: string; supportedGenerationMethods?: string[] }[]; nextPageToken?: string; error?: { message?: string } };
    if (!res.ok || body.error) {
      console.log(`ListModels failed: HTTP ${res.status} ${body.error?.message?.split("\n")[0] ?? ""}`);
      process.exitCode = 1;
      return;
    }
    for (const m of body.models ?? []) if (m.supportedGenerationMethods?.includes("generateContent")) names.push(m.name.replace(/^models\//, ""));
    pageToken = body.nextPageToken ?? "";
  } while (pageToken);
  console.log(names.join("\n"));
})();
