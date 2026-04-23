// POST /api/campaign → create campaign
// GET  /api/campaign?id=xxx → get campaign
 
export async function onRequestPost(context) {
  const { env, request } = context;
  const cors = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };
 
  try {
    const body = await request.json();
    const { groupName, title, content, doc1twName, doc1cnName, doc2twName, doc2cnName, adminEmail } = body;
 
    const allowed = (env.ADMIN_EMAIL || "zenjoy99@gmail.com").split(",").map(e => e.trim().toLowerCase());
    if (!allowed.includes((adminEmail || "").toLowerCase())) {
      return new Response(JSON.stringify({ error: "unauthorized" }), { status: 403, headers: cors });
    }
 
    if (!groupName || !title || !doc1twName || !doc1cnName) {
      return new Response(JSON.stringify({ error: "missing required fields" }), { status: 400, headers: cors });
    }
 
    const id = Math.random().toString(36).slice(2, 6) + Date.now().toString(36).slice(-3);
    const campaign = {
      id,
      groupName,
      title,
      content: content || "",
      doc1: { tw: doc1twName, cn: doc1cnName },
      doc2: (doc2twName && doc2cnName) ? { tw: doc2twName, cn: doc2cnName } : null,
      createdAt: new Date().toISOString(),
      adminEmail
    };
 
    await env.CONSENT_KV.put("campaign:" + id, JSON.stringify(campaign));
 
    return new Response(JSON.stringify({ ok: true, campaign }), { headers: cors });
 
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: cors });
  }
}
 
export async function onRequestGet(context) {
  const { env, request } = context;
  const cors = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };
 
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
 
  if (!id) {
    return new Response(JSON.stringify({ error: "missing id" }), { status: 400, headers: cors });
  }
 
  const data = await env.CONSENT_KV.get("campaign:" + id);
  if (!data) {
    return new Response(JSON.stringify({ error: "not found" }), { status: 404, headers: cors });
  }
 
  return new Response(data, { headers: cors });
}
 
export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    }
  });
}
 
