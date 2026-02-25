// src/lib/supabase.ts
// Cliente Supabase centralizado — importado pelos hooks e serverless functions
import { createClient } from '@supabase/supabase-js';

const supabaseUrl  = "https://mcqygugvwrnhhwqolavz.supabase.co";
const supabaseAnon = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1jcXlndWd2d3JuaGh3cW9sYXZ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5OTYxMTMsImV4cCI6MjA4NzU3MjExM30.f-1BmXnLtqosrNfas_xdPMXSgHwPoZuNxYOIkqujtBs";

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