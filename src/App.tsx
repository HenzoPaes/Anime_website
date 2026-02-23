import { lazy, Suspense } from "react";
import { Routes, Route, useLocation } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import Navbar from "./components/Navbar";
import Footer from "./components/Footer";
import PageLoader from "./components/PageLoader";
import { useTheme } from "./hooks/useTheme";

const HomePage        = lazy(()=>import("./pages/HomePage"));
const AnimeDetailPage = lazy(()=>import("./pages/AnimeDetailPage"));
const EpisodePage     = lazy(()=>import("./pages/EpisodePage"));
const SearchPage      = lazy(()=>import("./pages/SearchPage"));
const AdminPage       = lazy(()=>import("./pages/AdminPage"));
//const MyListPage      = lazy(()=>import("./pages/MyListPage"));
const NotFoundPage    = lazy(()=>import("./pages/NotFoundPage"));

export default function App() {
  const location = useLocation();
  const { theme, toggleTheme } = useTheme();
  const isEpisode = location.pathname.includes("/ep/");

  return (
    <div className={`min-h-screen flex flex-col ${theme==="dark"?"dark":""}`}>
      <Navbar theme={theme} toggleTheme={toggleTheme}/>
      <main className="flex-1">
        <AnimatePresence mode="wait" initial={false}>
          <Suspense fallback={<PageLoader/>}>
            <Routes location={location} key={location.pathname}>
              <Route path="/"                   element={<HomePage/>}/>
              <Route path="/anime/:id"          element={<AnimeDetailPage/>}/>
              <Route path="/anime/:id/ep/:epId" element={<EpisodePage/>}/>
              <Route path="/search"             element={<SearchPage/>}/>
              <Route path="/admin"              element={<AdminPage/>}/>
              <Route path="*"                   element={<NotFoundPage/>}/>
            </Routes>
          </Suspense>
        </AnimatePresence>
      </main>
      {!isEpisode && <Footer/>}
    </div>
  );
}

 //             <Route path="/minha-lista"        element={<MyListPage/>}/>