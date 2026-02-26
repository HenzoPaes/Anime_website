import { motion } from "framer-motion";
import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Grid2X2, Apple, Smartphone } from "lucide-react";

// ==========================================
// CONFIGURAÇÕES DE ANIMAÇÃO
// ==========================================
const STAGGER = {
  animate: { transition: { staggerChildren: 0.1 } }
};

const ITEM_UP = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
};

const FEATURES = [
  { icon: "⚡", title: "Ultra Velocidade", desc: "Carregamento 40% mais rápido que no navegador comum." },
  { icon: "🛡️", title: "Zero Ads", desc: "Bloqueio nativo de pop-ups e scripts maliciosos." },
  { icon: "🎨", title: "Interface Pro", desc: "Modo cinema exclusivo e temas personalizados." },
  { icon: "🔔", title: "Push Alerts", desc: "Notificações em tempo real direto no seu desktop ou celular." },
];

// Instruções para cada plataforma
const INSTRUCTIONS = {
  ios: [
    { step: "1", text: "Abra o site no Safari do seu iPhone/iPad" },
    { step: "2", text: "Toque no botão Compartilhar (quadrado com seta)" },
    { step: "3", text: "Selecione 'Adicionar à Tela de Início'" },
    { step: "4", text: "Toque em 'Adicionar' e pronto! 🎉" },
  ],
  android: [
    { step: "1", text: "Abra o site no Chrome do seu Android" },
    { step: "2", text: "Toque no menu (três pontinhos)" },
    { step: "3", text: "Selecione 'Instalar aplicativo' ou 'Adicionar à tela inicial'" },
    { step: "4", text: "Toque em 'Instalar' e aproveite! 🎉" },
  ],
  desktop: [
    { step: "1", text: "Abra o site no Chrome, Edge ou Firefox" },
    { step: "2", text: "Procure o ícone de instalar na barra de endereços" },
    { step: "3", text: "Clique em 'Instalar' para criar um atalho" },
    { step: "4", text: "O app abrirá como uma janela independente! 🎉" },
  ],
};

export default function DownloadPage() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [showInstructions, setShowInstructions] = useState<string | null>(null);

  useEffect(() => {
    const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    setIsIOS(iOS);

    if (window.matchMedia("(display-mode: standalone)").matches) {
      setIsInstalled(true);
    }

    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener("beforeinstallprompt", handleBeforeInstall);
    return () => window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) {
      // Se não tem prompt, mostra instruções
      if (isIOS) {
        setShowInstructions("ios");
      } else {
        setShowInstructions("desktop");
      }
      return;
    }
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setIsInstalled(true);
      setDeferredPrompt(null);
    }
  };

  const handleDownloadClick = (platform: string) => {
    if (platform === "ios" || platform === "macOS") {
      setShowInstructions("ios");
    } else if (deferredPrompt) {
      handleInstall();
    } else {
      setShowInstructions(platform === "Android" ? "android" : "desktop");
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }} 
      animate={{ opacity: 1 }} 
      exit={{ opacity: 0 }}
      className="min-h-screen bg-[#050505] text-white selection:bg-red-500/30"
    >
      {/* BACKGROUND DECORATION */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-red-600/10 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-red-900/10 blur-[120px] rounded-full" />
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-20" />
      </div>

      <div className="relative z-10 max-w-6xl mx-auto px-6 py-12">
        
        {/* NAV SIMPLES */}
        <div className="flex justify-between items-center mb-16">
          <Link to="/" className="flex items-center gap-2 group">
             <div className="w-10 h-10 bg-red-600 rounded-lg flex items-center justify-center shadow-[0_0_15px_rgba(220,38,38,0.5)] group-hover:scale-110 transition-transform">
                <span className="font-black text-xl">A</span>
             </div>
             <span className="font-display font-bold text-xl tracking-tighter">ANIME<span className="text-red-600">VERSE</span></span>
          </Link>
          <div className="hidden md:block text-xs font-mono text-gray-500 tracking-widest uppercase">
            Sistema de Distribuição v2.0.4
          </div>
        </div>

        {/* HERO SECTION */}
        <div className="grid lg:grid-cols-2 gap-12 items-center mb-24">
          <motion.div variants={STAGGER} initial="initial" animate="animate">
            <motion.div variants={ITEM_UP} className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-500/10 border border-red-500/20 text-red-500 text-xs font-bold mb-6">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
              </span>
              DISPONÍVEL PARA DOWNLOAD
            </motion.div>
            
            <motion.h1 variants={ITEM_UP} className="text-5xl md:text-7xl font-display font-black mb-6 leading-[0.9] tracking-tighter">
              SEUS ANIMES <br /> <span className="text-red-600 drop-shadow-[0_0_30px_rgba(220,38,38,0.3)]">MUITO MAIS</span> <br /> LEGAIS!
            </motion.h1>
            
            <motion.p variants={ITEM_UP} className="text-gray-400 text-lg mb-8 max-w-md leading-relaxed">
              Esqueça as limitações do navegador. O App oficial oferece a melhor performance para você não perder nenhum frame da sua luta favorita.
            </motion.p>

            <motion.div variants={ITEM_UP} className="flex flex-wrap gap-4">
              {isInstalled ? (
                <div className="bg-green-500/10 border border-green-500/20 text-green-500 px-8 py-4 rounded-2xl font-bold flex items-center gap-3">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                  APP INSTALADO
                </div>
              ) : (
                <button 
                  onClick={handleInstall}
                  className="bg-red-600 hover:bg-red-700 text-white px-10 py-5 rounded-2xl font-black text-lg transition-all hover:shadow-[0_0_40px_rgba(220,38,38,0.4)] hover:-translate-y-1 active:scale-95 flex items-center gap-3"
                >
                  INSTALAR AGORA
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 14l-7 7m0 0l-7-7m7 7V3" /></svg>
                </button>
              )}
            </motion.div>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            className="relative"
          >
            <div className="absolute inset-0 bg-red-600/20 blur-[100px] rounded-full animate-pulse" />
            <img 
              src="https://images.unsplash.com/photo-1614850523296-d8c1af93d400?q=80&w=1000&auto=format&fit=crop" 
              alt="App Preview" 
              className="relative rounded-[2rem] border border-white/10 shadow-2xl rotate-3 hover:rotate-0 transition-transform duration-700"
            />
          </motion.div>
        </div>

        {/* INSTRUÇÕES MODAL */}
        {showInstructions && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
            onClick={() => setShowInstructions(null)}
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-dark-800 rounded-3xl p-8 max-w-md w-full border border-white/10"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-white">
                  {showInstructions === "ios" && "📱 Como instalar no iOS"}
                  {showInstructions === "android" && "🤖 Como instalar no Android"}
                  {showInstructions === "desktop" && "💻 Como instalar no Computador"}
                </h3>
                <button 
                  onClick={() => setShowInstructions(null)}
                  className="text-gray-500 hover:text-white"
                >
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              
              <div className="space-y-4">
                {INSTRUCTIONS[showInstructions as keyof typeof INSTRUCTIONS].map((inst, i) => (
                  <div key={i} className="flex items-start gap-4">
                    <div className="w-8 h-8 rounded-full bg-red-600/20 text-red-500 flex items-center justify-center font-bold text-sm flex-shrink-0">
                      {inst.step}
                    </div>
                    <p className="text-gray-300 text-sm leading-relaxed">{inst.text}</p>
                  </div>
                ))}
              </div>

              <button
                onClick={() => setShowInstructions(null)}
                className="w-full mt-8 bg-red-600 hover:bg-red-700 text-white py-3 rounded-xl font-bold transition-colors"
              >
                Entendi!
              </button>
            </motion.div>
          </motion.div>
        )}

        {/* DOWNLOAD GRID */}
        <div className="mb-32">
          <div className="flex flex-col items-center mb-12">
            <h2 className="text-3xl font-black mb-2 uppercase tracking-tighter text-center">Distribuição Multi-Plataforma</h2>
            <div className="h-1 w-20 bg-red-600 rounded-full" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* ANDROID */}
            <DownloadCard 
              label="Android"
              version="v1.0.2 (pwa)"
              available={true}
              color="text-green-500"
              onClick={() => handleDownloadClick("Android")}
            />
            {/* WINDOWS */}
            <DownloadCard 
              label="Windows"
              version="v1.0.2 (pwa)"
              available={true}
              color="text-blue-500"
              onClick={() => handleDownloadClick("Windows")}
            />
            {/* APPLE IOS */}
            <DownloadCard 
              label="iOS (iPhone)"
              version="PWA"
              available={true}
              color="text-gray-400"
              onClick={() => handleDownloadClick("ios")}
            />
            {/* APPLE MAC */}
            <DownloadCard 
              label="macOS"
              version="PWA"
              available={true}
              color="text-gray-400"
              onClick={() => handleDownloadClick("macOS")}
            />
          </div>
        </div>

        {/* FEATURES GRID */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-24">
          {FEATURES.map((f, i) => (
            <div key={i} className="p-8 rounded-3xl bg-white/[0.02] border border-white/5 hover:border-red-500/20 transition-all hover:bg-white/[0.04]">
              <div className="text-4xl mb-4">{f.icon}</div>
              <h3 className="text-xl font-bold mb-2">{f.title}</h3>
              <p className="text-gray-500 text-sm leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>

        {/* FOOTER PÁGINA */}
        <div className="text-center">
          <Link to="/" className="text-gray-500 hover:text-red-500 transition-colors flex items-center justify-center gap-2 font-bold uppercase text-xs tracking-[0.2em]">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
            Voltar para o portal
          </Link>
        </div>

      </div>
    </motion.div>
  );
}

// COMPONENTE DE CARD DE DOWNLOAD
function DownloadCard({ label, version, available, color, onClick }: { 
  label: string, 
  version: string, 
  available: boolean, 
  color: string,
  onClick: () => void
}) {
  return (
    <button 
      onClick={onClick}
      className={`p-6 rounded-[2rem] bg-white/[0.03] border ${available ? 'border-white/10 hover:border-red-500/40' : 'border-red-900/10 opacity-60'} flex flex-col items-center text-center transition-all hover:scale-[1.02] hover:bg-white/[0.05] text-left w-full`}
    >
      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-4 bg-white/5 ${color}`}>
        {label === "Windows" && <Grid2X2 className="w-6 h-6" />}
        {label === "Android" && <Smartphone className="w-6 h-6" />}
        {(label.includes("iOS") || label === "macOS") && <Apple className="w-6 h-6" />}
      </div>
      <h4 className="font-bold text-lg mb-1">{label}</h4>
      <p className={`text-xs font-mono mb-4 ${available ? 'text-gray-500' : 'text-red-500/50'}`}>{version}</p>
      
      <span className="w-full py-3 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-black transition-all">
        BAIXAR / INSTALAR
      </span>
    </button>
  );
}
