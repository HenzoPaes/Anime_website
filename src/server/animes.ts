// src/server/animes.ts
import express from "express";
import cors from "cors";
import "dotenv/config";

// URL para o arquivo JSON com os dados dos animes
const ANIME_DATA_URL = "https://raw.githubusercontent.com/HenzoPaes/Anime_website/refs/heads/main/output.json?token=GHSAT0AAAAAADUWSGS6UBMKKL3WIP5BWXJW2NASJOA";

// Cache em memória para os dados dos animes
let animesCache: any[] = [];

/**
 * Busca os dados dos animes da URL e atualiza o cache em memória.
 */
async function fetchAnimes() {
  console.log("Buscando animes da URL...");
  try {
    const response = await fetch(ANIME_DATA_URL);
    if (!response.ok) {
      throw new Error(`Erro na requisição: ${response.statusText}`);
    }
    const data = await response.json();
    animesCache = data; // Armazena os dados no cache
    console.log(`${animesCache.length} animes carregados e cacheados com sucesso.`);
  } catch (error) {
    console.error("Falha ao buscar ou processar os dados dos animes:", error);
  }
}

/**
 * Retorna todos os animes do cache.
 */
export async function readAllAnimes() {
  return animesCache;
}

/**
 * Busca um anime específico pelo ID no cache.
 * @param {string} id - O ID do anime.
 */
export async function readAnime(id: string) {
  // Encontra o anime no cache. A propriedade 'id' deve existir nos seus dados.
  // Se o identificador for diferente, ajuste a propriedade (ex: anime.slug)
  const anime = animesCache.find(a => a.id === id);
  return anime || null;
}

// ── Servidor API ─────────────────────────────────────────────────────

export async function startServer() {
  // Inicia o processo de busca de dados imediatamente
  await fetchAnimes();
  
  // Configura a atualização automática a cada 30 segundos
  setInterval(fetchAnimes, 30000);

  const app = express();
  const PORT = process.env.PORT || 8080;

  // Permite que o frontend acesse a API
  app.use(cors());
  app.use(express.json());

  // Rota para obter todos os animes
  app.get("/api/animes", async (_req, res) => {
    const data = await readAllAnimes();
    res.json(data);
  });

  // Rota para obter um anime específico pelo ID
  app.get("/api/animes/:id", async (req, res) => {
    const anime = await readAnime(req.params.id);
    if (!anime) {
      return res.status(404).json({ error: "Anime não encontrado" });
    }
    res.json(anime);
  });

  app.listen(PORT, () => {
    console.log(`\n🚀 API rodando em http://localhost:${PORT}`);
    console.log(`📡 Buscando dados de: ${ANIME_DATA_URL}`);
    console.log(`🔄 Verificando atualizações a cada 30 segundos.`);
  });
}

// Inicia o servidor
startServer();
