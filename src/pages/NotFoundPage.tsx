import { Link } from "react-router-dom";
import { motion } from "framer-motion";
export default function NotFoundPage() {
  return (
    <motion.div initial={{opacity:0,y:24}} animate={{opacity:1,y:0}} exit={{opacity:0}}
      className="flex flex-col items-center justify-center min-h-[70vh] text-center px-4">
      <motion.div animate={{rotate:[0,-10,10,-10,0]}} transition={{duration:1.5,repeat:Infinity,repeatDelay:3}} className="text-8xl mb-6">👺</motion.div>
      <h1 className="font-display text-7xl text-brand-500 mb-2">404</h1>
      <p className="font-bold text-2xl text-white mb-2">Página não encontrada</p>
      <p className="text-gray-500 mb-8">Você se perdeu no multiverso dos animes.</p>
      <Link to="/" className="btn-primary text-base px-6 py-3">← Voltar ao início</Link>
    </motion.div>
  );
}
