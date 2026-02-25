// api/animes.js — Vercel Serverless Function com Supabase (com fallback para arquivos locais)
import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";

// diretório onde você mantém JSONs quando não usa Supabase
const LOCAL_DIR = path.join(process.cwd(), "Api", "Animes");

function getSupabase() {
  if (!process.env.SUPABASE_URL) return null;
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );
}

function readAllLocal() {
  if (!fs.existsSync(LOCAL_DIR)) return [];
  return fs
    .readdirSync(LOCAL_DIR)
    .filter(f => f.endsWith(".json"))
    .map(f => JSON.parse(fs.readFileSync(path.join(LOCAL_DIR, f), "utf-8")));
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-api-key");
  if (req.method === "OPTIONS") return res.status(200).end();

  const supabase = getSupabase();

  if (req.method === "GET") {
    if (supabase) {
      const { data, error } = await supabase
        .from("animes")
        .select("data")
        .order("created_at", { ascending: true });
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json((data ?? []).map(r => r.data));
    }
    return res.status(200).json(readAllLocal());
  }

  if (req.method === "POST") {
    if (req.headers["x-api-key"] !== process.env.API_KEY)
      return res.status(401).json({ error: "Unauthorized" });

    const anime = req.body;
    if (!anime?.id || !anime?.title)
      return res.status(400).json({ error: "id e title são obrigatórios" });

    if (supabase) {
      const { error } = await supabase
        .from("animes")
        .upsert({ id: anime.id, data: anime }, { onConflict: "id" });
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ success: true, message: `${anime.title} salvo!`, anime });
    }

    // grava em disco (nota: em Vercel o filesystem é efêmero)
    const target = path.join(LOCAL_DIR, `${anime.id}.json`);
    fs.writeFileSync(target, JSON.stringify(anime, null, 2));
    return res.status(200).json({ success: true, message: `${anime.title} salvo em ${target}!`, anime });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
