// src/App.tsx
import { lazy, Suspense } from "react";
import { Routes, Route, useLocation } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import Navbar from "./components/navbar";
import Footer from "./components/footer";
import PageLoader from "./components/pageloader";
import InstallPrompt from "./components/installprompt";
import { useTheme } from "./hooks/usetheme";
import { usePWACheck } from "./hooks/usePWACheck";

const HomePage         = lazy(() => import("./pages/homepage"));
const AnimeDetailPage  = lazy(() => import("./pages/animedetailpage"));
const EpisodePage      = lazy(() => import("./pages/episodepage"));
const SearchPage       = lazy(() => import("./pages/searchpage"));
const HistoryPage      = lazy(() => import("./pages/historypage"));
const SuggestionsPage  = lazy(() => import("./pages/suggestionspage"));
const AdminPage        = lazy(() => import("./pages/adminpage"));
const NotFoundPage     = lazy(() => import("./pages/notfoundpage"));
const DownloadPage     = lazy(() => import("./pages/downloadpage"));

export default function App() {
  const location = useLocation();
  const { theme, toggleTheme } = useTheme();
  const { isPWA, isLoading } = usePWACheck();
  const isEpisode = location.pathname.includes("/ep/");
  const isDownloadPage = location.pathname === "/download";

  // Se não é PWA e não está na página de download, redireciona para download
  const showFullApp = isPWA || isDownloadPage;

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
              <Route path="/"                   element={showFullApp ? <HomePage /> : <DownloadPage />} />
              <Route path="/anime/:id"          element={showFullApp ? <AnimeDetailPage /> : <DownloadPage />} />
              <Route path="/anime/:id/ep/:epId" element={showFullApp ? <EpisodePage /> : <DownloadPage />} />
              <Route path="/search"             element={showFullApp ? <SearchPage /> : <DownloadPage />} />
              <Route path="/historico"          element={showFullApp ? <HistoryPage /> : <DownloadPage />} />
              <Route path="/sugestao"           element={showFullApp ? <SuggestionsPage /> : <DownloadPage />} />
              <Route path="/kz82lmq9xq19zpan8d2ksl4v1mf93qxtq84zmn2r7plxk21b9as0mf3w2zn8dk6"
                element={showFullApp ? <AdminPage /> : <DownloadPage />} />
              <Route path="/download"           element={<DownloadPage />} />
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
