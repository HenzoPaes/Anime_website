// api/animes/[id].js — Vercel Serverless Function com Supabase (e fallback local)
import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";

const LOCAL_DIR = path.join(process.cwd(), "Api", "Animes");

function getSupabase() {
  if (!process.env.SUPABASE_URL) return null;
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );
}

function readLocal(id) {
  const p = path.join(LOCAL_DIR, `${id}.json`);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-api-key");
  if (req.method === "OPTIONS") return res.status(200).end();

  const supabase = getSupabase();
  const { id } = req.query;

  if (req.method === "GET") {
    if (supabase) {
      const { data, error } = await supabase
        .from("animes")
        .select("data")
        .eq("id", id)
        .single();
      if (error) return res.status(404).json({ error: "Not found" });
      return res.status(200).json(data.data);
    }
    const anime = readLocal(id);
    if (!anime) return res.status(404).json({ error: "Not found" });
    return res.status(200).json(anime);
  }

  if (req.method === "DELETE") {
    if (req.headers["x-api-key"] !== process.env.API_KEY)
      return res.status(401).json({ error: "Unauthorized" });

    if (supabase) {
      const { error } = await supabase.from("animes").delete().eq("id", id);
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ success: true, message: `${id} removido do Supabase!` });
    }
    const p = path.join(LOCAL_DIR, `${id}.json`);
    if (fs.existsSync(p)) {
      fs.unlinkSync(p);
      return res.status(200).json({ success: true, message: `${id} removido do disco` });
    }
    return res.status(404).json({ error: "Not found" });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
