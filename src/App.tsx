// src/App.tsx
import { lazy, Suspense } from "react";
import { Routes, Route, useLocation } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import Navbar from "./components/navbar";
import Footer from "./components/footer";
import PageLoader from "./components/pageloader";
import { useTheme } from "./hooks/usetheme";

const HomePage        = lazy(() => import("./pages/homepage"));
const AnimeDetailPage = lazy(() => import("./pages/animedetailpage"));
const EpisodePage     = lazy(() => import("./pages/episodepage"));
const SearchPage      = lazy(() => import("./pages/searchpage"));
const HistoryPage     = lazy(() => import("./pages/historypage"));
const SuggestionsPage = lazy(() => import("./pages/suggestionspage"));
const AdminPage       = lazy(() => import("./pages/adminpage"));
const NotFoundPage    = lazy(() => import("./pages/notfoundpage"));

export default function App() {
  const location = useLocation();
  const { theme, toggleTheme } = useTheme();
  const isEpisode = location.pathname.includes("/ep/");

  return (
    <div className={`min-h-screen flex flex-col ${theme === "dark" ? "dark" : ""}`}>
      <Navbar theme={theme} toggleTheme={toggleTheme} />
      <main className="flex-1 pt-16">
        <AnimatePresence mode="wait" initial={false}>
          <Suspense fallback={<PageLoader />}>
            <Routes location={location} key={location.pathname}>
              <Route path="/"                   element={<HomePage />} />
              <Route path="/anime/:id"          element={<AnimeDetailPage />} />
              <Route path="/anime/:id/ep/:epId" element={<EpisodePage />} />
              <Route path="/search"             element={<SearchPage />} />
              <Route path="/historico"          element={<HistoryPage />} />
              <Route path="/sugestao"          element={<SuggestionsPage />} />
              <Route path="/kz82lmq9xq19zpan8d2ksl4v1mf93qxtq84zmn2r7plxk21b9as0mf3w2zn8dk6"
                element={<AdminPage />} />
              <Route path="*"                   element={<NotFoundPage />} />
            </Routes>
          </Suspense>
        </AnimatePresence>
      </main>
      {!isEpisode && <Footer />}
    </div>
  );
}
