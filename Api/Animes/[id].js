// api/animes/[id].js - Usa as funções de src/server/animes.ts
import { readAnime, removeAnime, checkAuth, config } from "../../src/server/animes.ts";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-api-key");
  if (req.method === "OPTIONS") return res.status(200).end();

  const { id } = req.query;

  if (req.method === "GET") {
    const anime = await readAnime(id);
    if (!anime) return res.status(404).json({ error: "Not found" });
    return res.status(200).json(anime);
  }

  if (req.method === "DELETE") {
    const apiKey = req.headers["x-api-key"];
    if (!checkAuth(apiKey))
      return res.status(401).json({ error: "Unauthorized" });

    const ok = removeAnime(id);
    if (!ok) return res.status(404).json({ error: "Not found" });
    return res.status(200).json({ success: true, message: "Removido! Backup salvo." });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
