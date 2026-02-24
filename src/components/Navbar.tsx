import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useAnimes } from "../hooks/useanimes";
import SearchBar from "./searchbar";

interface Props { theme:"dark"|"light"; toggleTheme:()=>void; }

export default function Navbar({ theme, toggleTheme }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  const { animes } = useAnimes();
  <main className="pt-16"> </main>

  const links = [{to:"/",label:"Início"},{to:"/search",label:"Explorar"}];
//,{to:"/minha-lista",label:"❤️ Minha Lista"} {to:"/admin",label:"Admin"}
  return (
    <motion.header initial={{y:-70}} animate={{y:0}} transition={{type:"spring",stiffness:280,damping:28}}
      className="fixed top-0 left-0 w-full z-50 backdrop-blur-xl bg-dark-900/70 border-b border-white/5">
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2 group flex-shrink-0">
          <div className="w-8 h-8 bg-brand-500 rounded-lg flex items-center justify-center 
                group-hover:scale-110 transition-transform 
                shadow-lg shadow-brand-500/30 overflow-hidden">
          <img
            src="/public/Logo.png"
            alt="Anime Verse Logo"
            className="w-6 h-6 object-contain drop-shadow-lg"
          />
          </div>
          <span className="font-display text-2xl tracking-wider text-white hidden sm:block">
            Anime<span className="text-brand-500">Verse</span>
          </span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-5">
          {links.map(l=>(
            <Link key={l.to} to={l.to}
              className={`text-sm font-semibold transition-all hover:text-brand-400 ${location.pathname===l.to?"text-brand-400":"text-gray-400"}`}>
              {l.label}
            </Link>
          ))}
        </nav>

        {/* Search + actions */}
        <div className="flex items-center gap-2 flex-1 md:flex-none justify-end">
          <div className="hidden lg:block w-64">
            <SearchBar animes={animes} compact/>
          </div>
          {/* Login coming soon */}
          <div className="relative group hidden sm:block">
            <button disabled className="btn-ghost text-sm py-1.5 px-3 opacity-50 cursor-not-allowed flex items-center gap-1.5">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
              </svg>Entrar
            </button>
            <div className="absolute right-0 top-full mt-2 w-52 rounded-xl p-3 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 shadow-xl">
              <div className="flex items-center gap-2 mb-1">
                <span className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse"/>
                <span className="text-yellow-400 text-xs font-bold uppercase">Em breve!</span>
              </div>
              <p className="text-gray-400 text-xs ">Login e cadastro chegando em breve. 🚀</p>
            </div>
          </div>
          {/* Theme toggle */}
          <button onClick={toggleTheme} className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors" aria-label="Tema">
            {theme==="dark"
              ? <svg className="w-4 h-4 text-yellow-400" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" clipRule="evenodd"/></svg>
              : <svg className="w-4 h-4 text-gray-400" fill="currentColor" viewBox="0 0 20 20"><path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z"/></svg>
            }
          </button>
          {/* Hamburger */}
          <button className="md:hidden p-2 rounded-lg bg-white/5" onClick={()=>setMenuOpen(!menuOpen)}>
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={menuOpen?"M6 18L18 6M6 6l12 12":"M4 6h16M4 12h16M4 18h16"}/>
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      <AnimatePresence>
        {menuOpen && (
          <motion.div initial={{height:0,opacity:0}} animate={{height:"auto",opacity:1}} exit={{height:0,opacity:0}}
            className="md:hidden border-t border-white/5 overflow-hidden">
            <div className="px-4 py-3 space-y-2">
              <SearchBar animes={animes}/>
              {links.map(l=>(
                <Link key={l.to} to={l.to} onClick={()=>setMenuOpen(false)}
                  className="block py-2 text-gray-300 hover:text-brand-400 font-semibold transition-colors">{l.label}</Link>
              ))}
              <p className="text-sm text-gray-600 py-1">Login — <span className="text-yellow-400 font-semibold">em breve!</span></p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.header>
  );
}
