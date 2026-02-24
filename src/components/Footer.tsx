import { Link } from "react-router-dom";
export default function Footer() {
  return (
    <footer className="border-t border-white/5 bg-dark-800/50 mt-16">
      <div className="max-w-7xl mx-auto px-4 py-10">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 bg-brand-500 rounded-lg flex items-center justify-center 
                group-hover:scale-110 transition-transform 
                shadow-lg shadow-brand-500/30 overflow-hidden">
          <img
            src="/public/Logo.png"
            alt="Anime Verse Logo"
            className="w-5 h-5 object-contain drop-shadow-lg"
          />
          </div>
              <span className="font-display text-xl text-white">Anime<span className="text-brand-500">Verse</span></span>
            </div>
            <p className="text-sm text-gray-500">Seu portal de animes legendados e dublados. 🎌</p>
          </div>
          <div>
            <h3 className="font-bold text-white mb-3 text-xs uppercase tracking-wider">Navegar</h3>
            <ul className="space-y-2">
              {[{to:"/",l:"Início"},{to:"/search",l:"Explorar"},{to:"/minha-lista",l:"❤️ Minha Lista"},{to:"/admin",l:"Painel Admin"}].map(({to,l})=>(
                <li key={to}><Link to={to} className="text-sm text-gray-500 hover:text-brand-400 transition-colors">{l}</Link></li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="font-bold text-white mb-3 text-xs uppercase tracking-wider">🚀 Em Breve</h3>
            <ul className="space-y-2">
              {["Login & Cadastro","Lista sincronizada","Avaliações","Comentários","Notificações de novos eps"].map(item=>(
                <li key={item} className="flex items-center gap-2 text-sm text-gray-600">
                  <span className="w-1.5 h-1.5 bg-yellow-500 rounded-full animate-pulse flex-shrink-0"/>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="border-t border-white/5 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs text-gray-700">© {new Date().getFullYear()} AnimeVerse</p>
          <p className="text-xs text-gray-700">Os vídeos são hospedados por terceiros. AnimeVerse não hospeda conteúdo.</p>
        </div>
      </div>
    </footer>
  );
}
