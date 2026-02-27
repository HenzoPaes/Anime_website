// src/App.tsx
import { lazy, Suspense, useState } from "react";
import { Routes, Route, useLocation } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import Navbar from "./components/navbar";
import Footer from "./components/footer";
import PageLoader from "./components/pageloader";
import InstallPrompt from "./components/installprompt";
import { useTheme } from "./hooks/usetheme";
import { usePWACheck } from "./hooks/usePWACheck";

// pages (lazy)
const HomePage         = lazy(() => import("./pages/homepage"));
const AnimeDetailPage  = lazy(() => import("./pages/animedetailpage"));
const MovieDetailPage  = lazy(() => import("./pages/moviedetailpage"));
const EpisodePage      = lazy(() => import("./pages/episodepage"));
const SearchPage       = lazy(() => import("./pages/searchpage"));
const HistoryPage      = lazy(() => import("./pages/historypage"));
const SuggestionsPage  = lazy(() => import("./pages/suggestionspage"));
const AdminPage        = lazy(() => import("./pages/adminpage"));
const NotFoundPage     = lazy(() => import("./pages/notfoundpage"));
const DownloadPage     = lazy(() => import("./pages/downloadpage"));

// Dev-only lazy components (used by the /dev playground)
const DevAnimeCard = lazy(() => import("./components/animecard"));
const DevSearchBar = lazy(() => import("./components/searchbar"));
const DevWatchListB = lazy(() => import("./components/watchlistbutton"));

/**
 * DevPlayground
 * Rota simples para visualizar componentes isolados enquanto desenvolve.
 * Está intencionalmente simples: mostra alguns componentes e usa mocks mínimos.
 */
function DevPlayground({ theme, toggleTheme }: { theme: "dark" | "light"; toggleTheme: () => void; }) {
  const [selected, setSelected] = useState<string>("Navbar");

  // Mock data mínimo para passar ao AnimeCard / SearchBar
  const mockAnime = {
  id: "yofukashi-no-uta",
  title: "Yofukashi no Uta",
  titleRomaji: "Yofukashi no Uta",
  titleJapanese: "よふかしのうた",
  genre: [
    "Romance",
    "Supernatural"
  ],
  studio: "LIDENFILMS",
  recommended: true,
  malId: 50346,
  cover: "https://cdn.myanimelist.net/images/anime/1045/123711l.jpg",
  banner: "https://wallpaperaccess.com/full/8405363.png",
};

  const mockAnimes = [
    mockAnime,
    { ...mockAnime, id: "mock-2", title: "Outro Anime", rating: 7.2 },
    { ...mockAnime, id: "mock-3", title: "Terceiro", rating: 6.8 },
  ];

  return (
    <div className="min-h-screen bg-dark-950 text-white">
      <div className="max-w-6xl mx-auto p-6">
        <h1 className="text-2xl font-bold mb-4">Dev Playground — Componentes isolados</h1>

        <div className="flex gap-2 flex-wrap mb-6">
          {["Navbar","Footer","PageLoader","InstallPrompt","AnimeCard","SearchBar","WatchListButton"].map(c => (
            <button key={c}
              onClick={() => setSelected(c)}
              className={`px-3 py-1 rounded text-sm ${selected === c ? "bg-brand-500 text-black" : "bg-white/5 text-gray-300"}`}>
              {c}
            </button>
          ))}
          <button onClick={toggleTheme} className="px-3 py-1 rounded text-sm bg-white/5 text-gray-300 ml-auto">
            Toggle theme ({theme})
          </button>
        </div>

        <div className="p-6 bg-black/40 border border-white/5 rounded-lg min-h-[280px]">
          <Suspense fallback={<div className="p-8"><PageLoader /></div>}>
            {selected === "Navbar" && <Navbar theme={theme} toggleTheme={toggleTheme} />}
            {selected === "Footer" && <Footer />}
            {selected === "PageLoader" && <PageLoader />}
            {selected === "InstallPrompt" && <InstallPrompt />}
            {selected === "AnimeCard" && <DevAnimeCard anime={mockAnime} index={0} watchedCount={2} />}
            {selected === "SearchBar" && <DevSearchBar animes={mockAnimes} compact={false} autoFocus={false} />}
            {selected === "WatchListButton" && <DevWatchListB anime={mockAnime} />}
          </Suspense>
        </div>

        <p className="text-sm text-gray-400 mt-4">Observação: o Playground carrega componentes reais do projeto via lazy import. Use em <span className="font-mono">http://localhost:5173/dev</span>.</p>
      </div>
    </div>
  );
}

export default function App() {
  const location = useLocation();
  const { theme, toggleTheme } = useTheme();
  const { isPWA, isLoading } = usePWACheck();

  // Detecta se estamos em uma URL local (dev). Se sim, não forçar a tela de download.
  const isDownloadPage = location.pathname === "/download";
  const isEpisode = location.pathname.includes("/ep/");

  // Checa hostname de runtime — protege com typeof window para evitar erros em SSR (se houver)
  const isLocalhost = typeof window !== "undefined" && (
    window.location.hostname === "localhost"
    || window.location.hostname === "127.0.0.1"
    || window.location.hostname.endsWith(".local")
  );

  // Se não é PWA e não está na página de download, redireciona para download.
  // EXCEÇÃO: se estivermos em localhost (dev), mostramos o app normalmente.
  const showFullApp = isPWA || isDownloadPage || isLocalhost;

  // Loading
  if (isLoading) {
    return (
      <div className="min-h-screen bg-dark-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-brand-500"></div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen flex flex-col ${theme === "dark" ? "dark" : ""}`}>
      {showFullApp && <Navbar theme={theme} toggleTheme={toggleTheme} />}

      <main className={`flex-1 ${showFullApp ? 'pt-16' : 'pt-0'}`}>
        <AnimatePresence mode="wait" initial={false}>
          <Suspense fallback={<PageLoader />}>
            <Routes location={location} key={location.pathname}>
              <Route path="/"                         element={showFullApp ? <HomePage /> : <DownloadPage />} />
              <Route path="/anime/:id"                element={showFullApp ? <AnimeDetailPage /> : <DownloadPage />} />
              <Route path="/anime/:id/filme/:season?" element={showFullApp ? <MovieDetailPage /> : <DownloadPage />} />
              <Route path="/anime/:id/ep/:epId"       element={showFullApp ? <EpisodePage /> : <DownloadPage />} />
              <Route path="/search"                   element={showFullApp ? <SearchPage /> : <DownloadPage />} />
              <Route path="/historico"                element={showFullApp ? <HistoryPage /> : <DownloadPage />} />
              <Route path="/sugestao"                 element={showFullApp ? <SuggestionsPage /> : <DownloadPage />} />
              <Route path="/kz82lmq9xq19zpan8d2ksl4v1mf93qxtq84zmn2r7plxk21b9as0mf3w2zn8dk6"
                element={showFullApp ? <AdminPage /> : <DownloadPage />} />
              <Route path="/download"           element={<DownloadPage />} />

              {/* Dev playground (visualizar componentes isolados) */}
              <Route path="/dev" element={isLocalhost ? <DevPlayground theme={theme} toggleTheme={toggleTheme} /> : <NotFoundPage />} />

              <Route path="*"                   element={<NotFoundPage />} />
            </Routes>
          </Suspense>
        </AnimatePresence>
      </main>

      {showFullApp && !isEpisode && <Footer />}
      {showFullApp && <InstallPrompt />}
    </div>
  );
}