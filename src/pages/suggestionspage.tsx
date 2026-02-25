import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "react-router-dom";
import { CustomDropdown, DropdownOption } from "../components/customdropdown";

// Configurações de Animação
const PAGE_VARIANTS = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.4, staggerChildren: 0.1 } },
  exit: { opacity: 0, transition: { duration: 0.2 } }
};

const ITEM_VARIANTS = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.4 } }
};

export default function SuggestionsPage() {
  const[formData, setFormData] = useState({
    name: "",
    category: "Sugestão de Anime",
    message: ""
  });
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setFormData({ ...formData,[e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("loading");

    try {
      // Usando a API gratuita FormSubmit para enviar o email direto do Frontend
      const response = await fetch("https://formsubmit.co/ajax/henzopaes09@gmail.com", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          Nome: formData.name || "Anônimo",
          Categoria: formData.category,
          Mensagem: formData.message,
          _subject: `Nova sugestão: ${formData.category} - AnimeVerse`, // Assunto do email
          _template: "table" // Deixa o email mais bonito
        }),
      });

      if (response.ok) {
        setStatus("success");
        setFormData({ name: "", category: "Sugestão de Anime", message: "" });
      } else {
        setStatus("error");
      }
    } catch (error) {
      setStatus("error");
    }
  };

  return (
    <motion.div 
      variants={PAGE_VARIANTS} 
      initial="initial" 
      animate="animate" 
      exit="exit"
      className="min-h-screen py-12 px-4 flex flex-col items-center justify-center relative overflow-hidden"
    >
      {/* Background Decorativo Fluid */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-3xl h-[500px] bg-brand-500/20 rounded-full blur-[120px] opacity-50 pointer-events-none" />

      <motion.div variants={ITEM_VARIANTS} className="w-full max-w-2xl relative z-10">
        
        {/* Botão Voltar */}
        <Link to="/" className="inline-flex items-center gap-2 text-gray-400 hover:text-white transition-colors mb-8 group font-medium">
          <svg className="w-5 h-5 transform group-hover:-translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Voltar ao Catálogo
        </Link>

        {/* Header da Página */}
        <div className="text-center mb-10">
          <motion.div 
            initial={{ scale: 0 }} 
            animate={{ scale: 1 }} 
            transition={{ type: "spring", stiffness: 200, damping: 15 }}
            className="w-20 h-20 bg-brand-500/20 rounded-3xl flex items-center justify-center mx-auto mb-6 border border-brand-500/30 rotate-3 shadow-lg shadow-brand-500/20"
          >
            <span className="text-4xl">💡</span>
          </motion.div>
          <h1 className="font-display text-4xl md:text-5xl text-white mb-4 tracking-wide">
            Ajude-nos a <span className="text-brand-400">Melhorar</span>
          </h1>
          <p className="text-gray-400 text-lg max-w-lg mx-auto">
            Sentiu falta de algum anime? Tem ideias para o site? Envie sua sugestão diretamente para a nossa equipe!
          </p>
        </div>

        {/* Formulário com Glassmorphism */}
        <div className="glass rounded-3xl p-6 md:p-10 shadow-2xl relative overflow-hidden border border-white/5 bg-dark-900/60 backdrop-blur-xl">
          
          <AnimatePresence mode="wait">
            {status === "success" ? (
              <motion.div 
                key="success"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="text-center py-12"
              >
                <div className="w-24 h-24 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-6 border border-green-500/30">
                  <svg className="w-12 h-12 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h2 className="text-2xl font-bold text-white mb-2">Sugestão Enviada!</h2>
                <p className="text-gray-400 mb-8">Muito obrigado pelo seu feedback. Nossa equipe vai ler com carinho.</p>
                <button onClick={() => setStatus("idle")} className="btn-primary">
                  Enviar nova sugestão
                </button>
              </motion.div>
            ) : (
              <motion.form 
                key="form"
                variants={PAGE_VARIANTS}
                initial="initial"
                animate="animate"
                exit="exit"
                onSubmit={handleSubmit} 
                className="space-y-6"
              >
                <motion.div variants={ITEM_VARIANTS} className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Nome */}
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-gray-400 uppercase tracking-wider ml-1">Seu Nome (Opcional)</label>
                    <input 
                      type="text" 
                      name="name"
                      value={formData.name}
                      onChange={handleChange}
                      placeholder="Como quer ser chamado?" 
                      className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3.5 text-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none transition-all placeholder-gray-600"
                    />
                  </div>

                  {/* Categoria */}
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-gray-400 uppercase tracking-wider ml-1">Sobre o que é?</label>
                    <CustomDropdown options={[
                        { label: "🎬 Adicionar novo Anime", value: "Sugestão de Anime" },
                        { label: "✨ Sugestão para o Site", value: "Melhoria no Site" },
                        { label: "🐛 Reportar um Erro/Bug", value: "Reportar Erro" },
                        { label: "💬 Outros assuntos", value: "Outros" },
                      ]} value={formData.category} onChange={(value) => setFormData(prev => ({ ...prev, category: value }))} size="lg" />
                  </div>
                </motion.div>

                {/* Mensagem */}
                <motion.div variants={ITEM_VARIANTS} className="space-y-2">
                  <label className="text-sm font-bold text-gray-400 uppercase tracking-wider ml-1">Sua Mensagem</label>
                  <textarea 
                    name="message"
                    required
                    value={formData.message}
                    onChange={handleChange}
                    rows={5}
                    placeholder="Escreva sua sugestão com detalhes aqui..." 
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3.5 text-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none transition-all resize-none placeholder-gray-600"
                  />
                </motion.div>

                {/* Mensagem de Erro (se houver) */}
                {status === "error" && (
                  <motion.div initial={{opacity:0}} animate={{opacity:1}} className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-xl text-sm font-medium">
                    Ocorreu um erro ao enviar. Tente novamente mais tarde.
                  </motion.div>
                )}

                {/* Botão de Enviar */}
                <motion.div variants={ITEM_VARIANTS} className="pt-2">
                  <button 
                    type="submit" 
                    disabled={status === "loading" || !formData.message.trim()}
                    className={`w-full flex items-center justify-center gap-3 py-4 rounded-xl font-bold text-lg transition-all duration-300 ${
                      status === "loading" || !formData.message.trim()
                        ? "bg-brand-500/50 text-white/50 cursor-not-allowed" 
                        : "bg-brand-500 text-white hover:bg-brand-400 hover:shadow-lg hover:shadow-brand-500/30 hover:-translate-y-1"
                    }`}
                  >
                    {status === "loading" ? (
                      <>
                        <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Enviando...
                      </>
                    ) : (
                      <>
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                        </svg>
                        Enviar Sugestão
                      </>
                    )}
                  </button>
                </motion.div>

              </motion.form>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </motion.div>
  );
}