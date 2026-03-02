import { lazy, Suspense } from "react"; 
import { Routes, Route, useLocation, Navigate } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import Navbar from "./components/navbar";
import Footer from "./components/footer";
import PageLoader from "./components/pageloader";
import InstallPrompt from "./components/installprompt";
import { useTheme } from "./hooks/usetheme";
import { usePWACheck } from "./hooks/usePWACheck";

// ── Pages (lazy) ──────────────────────────────────────────────────────────────
const HomePage        = lazy(() => import("./pages/homepage"));
const AnimeDetailPage = lazy(() => import("./pages/animedetailpage"));
const MovieDetailPage = lazy(() => import("./pages/moviedetailpage"));
const EpisodePage     = lazy(() => import("./pages/episodepage"));
const SearchPage      = lazy(() => import("./pages/searchpage"));
const HistoryPage     = lazy(() => import("./pages/historypage"));
const SuggestionsPage = lazy(() => import("./pages/suggestionspage"));
const AdminPage       = lazy(() => import("./pages/adminpage"));
const NotFoundPage    = lazy(() => import("./pages/notfoundpage"));
const DownloadPage    = lazy(() => import("./pages/downloadpage"));

// ── Rota de Admin (caminho "secreto") ─────────────────────────────────────────
const ADMIN_PATH = "/kz82lmq9xq19zpan8d2ksl4v1mf93qxtq84zmn2r7plxk21b9as0mf3w2zn8dk6";

// ── Tela de loading enquanto detecta modo PWA ─────────────────────────────────
function SplashLoader() {
  return (
    <div className="min-h-screen bg-dark-900 flex items-center justify-center">
      <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-brand-500" />
    </div>
  );
}

// ── PWAOnly — wrapper que redireciona para /download se não for PWA ───────────
function PWAOnly({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

export default function App() {
  const location                  = useLocation();
  const { theme, toggleTheme }    = useTheme();
  const { isPWA, isFullscreen, isBrowser, isLoading } = usePWACheck();

  const isEpisode      = location.pathname.includes("/ep/");
  const isDownloadPage = location.pathname === "/download";

  // Enquanto detecta modo, exibe splash para evitar flash
  if (isLoading) return <SplashLoader />;

  /**
   * Regra de exibição atualizada:
   *  - isPWA verdadeiro -> app completo
   *  - isFullscreen verdadeiro -> considerada experiência "app-like" (ex.: F11)
   *  - isBrowser (navegador normal) -> redireciona para /download
   *
   * Se preferir que apenas PWA instalada permita o app (e F11 NÃO conte),
   * troque `showApp = isPWA || isFullscreen` por `showApp = isPWA`.
   */
  const showApp = isPWA || isFullscreen;

  // Mostrar o prompt de instalação somente para navegador normal (sem fullscreen)
  const showInstallPrompt = isBrowser;

  return (
    <div className={`min-h-screen flex flex-col ${theme === "dark" ? "dark" : ""}`}>

      {/* Navbar só aparece no app */}
      {showApp && <Navbar theme={theme} toggleTheme={toggleTheme} />}

      <main className={`flex-1 ${showApp ? "pt-16" : "pt-0"}`}>
        <AnimatePresence mode="wait" initial={false}>
          <Suspense fallback={<PageLoader />}>
            <Routes location={location} key={location.pathname}>

              {/* ── Página de download (sempre acessível) ─────────────── */}
              <Route path="/download" element={<DownloadPage />} />

              {/* ── Se não for app-like, todas as rotas vão para /download ─── */}
              {!showApp && (
                <Route path="*" element={<Navigate to="/download" replace />} />
              )}

              {/* ── Rotas do app (só acessíveis em modo PWA ou fullscreen) ─── */}
              {showApp && (
                <>
                  <Route path="/"                          element={<HomePage />} />
                  <Route path="/anime/:id"                 element={<AnimeDetailPage />} />
                  <Route path="/anime/:id/filme/:season?"  element={<MovieDetailPage />} />
                  <Route path="/anime/:id/ep/:epId"        element={<EpisodePage />} />
                  <Route path="/search"                    element={<SearchPage />} />
                  <Route path="/historico"                 element={<HistoryPage />} />
                  <Route path="/sugestao"                  element={<SuggestionsPage />} />
                  <Route path={ADMIN_PATH}                 element={<AdminPage />} />
                  <Route path="*"                          element={<NotFoundPage />} />
                </>
              )}

            </Routes>
          </Suspense>
        </AnimatePresence>
      </main>

      {showApp && !isEpisode && <Footer />}
      {showInstallPrompt && <InstallPrompt />}
    </div>
  );
}
