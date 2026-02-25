// api/animes/[id].js — Vercel Serverless Function com Supabase
import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-api-key");
  if (req.method === "OPTIONS") return res.status(200).end();

  const supabase = getSupabase();
  const { id } = req.query;

  if (req.method === "GET") {
    const { data, error } = await supabase
      .from("animes")
      .select("data")
      .eq("id", id)
      .single();
    if (error) return res.status(404).json({ error: "Not found" });
    return res.status(200).json(data.data);
  }

  if (req.method === "DELETE") {
    if (req.headers["x-api-key"] !== process.env.API_KEY)
      return res.status(401).json({ error: "Unauthorized" });

    const { error } = await supabase.from("animes").delete().eq("id", id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ success: true, message: `${id} removido do Supabase!` });
  }

  return res.status(405).json({ error: "Method not allowed" });
}