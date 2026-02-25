// src/lib/supabase.ts
// Cliente Supabase centralizado — importado pelos hooks e serverless functions
import { createClient } from "@supabase/supabase-js";

const supabaseUrl  = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnon = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnon) {
  throw new Error("Faltam as variáveis VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no .env");
}

export const supabase = createClient(supabaseUrl, supabaseAnon);

// ── Tipos do banco ──────────────────────────────────────────────────────────
export interface AnimeRow {
  id: string;
  data: any; // JSON completo (mesma estrutura dos arquivos .json)
  created_at: string;
  updated_at: string;
}

export interface WatchlistRow {
  id: string;
  user_id: string;
  anime_id: string;
  status: "assistindo" | "concluido" | "droppado" | "quero-ver";
  progress: number;
  added_at: string;
  updated_at: string;
}

export interface HistoryRow {
  id: string;
  user_id: string;
  anime_id: string;
  anime_title: string;
  anime_cover: string;
  ep_id: string;
  ep_title: string;
  ep_number: number;
  audio: string;
  watched_at: string;
}