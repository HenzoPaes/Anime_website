// api/animes.js — Vercel Serverless Function com Supabase
import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-api-key");
  if (req.method === "OPTIONS") return res.status(200).end();

  const supabase = getSupabase();

  if (req.method === "GET") {
    const { data, error } = await supabase
      .from("animes")
      .select("data")
      .order("created_at", { ascending: true });
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json((data ?? []).map(r => r.data));
  }

  if (req.method === "POST") {
    if (req.headers["x-api-key"] !== process.env.API_KEY)
      return res.status(401).json({ error: "Unauthorized" });

    const anime = req.body;
    if (!anime?.id || !anime?.title)
      return res.status(400).json({ error: "id e title são obrigatórios" });

    const { error } = await supabase
      .from("animes")
      .upsert({ id: anime.id, data: anime }, { onConflict: "id" });

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ success: true, message: `${anime.title} salvo!`, anime });
  }

  return res.status(405).json({ error: "Method not allowed" });
}