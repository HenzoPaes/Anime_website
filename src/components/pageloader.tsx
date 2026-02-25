import { motion } from "framer-motion";
export default function PageLoader() {
  return (
    <motion.div initial={{opacity:0}} animate={{opacity:1}} className="flex items-center justify-center min-h-[60vh]" role="status">
      <div className="flex flex-col items-center gap-4">
        <div className="relative w-14 h-14">
          <div className="absolute inset-0 rounded-full border-4 border-dark-600"/>
          <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-brand-500 animate-spin"/>
        </div>
        <p className="text-gray-500 text-sm font-semibold tracking-widest uppercase animate-pulse">Carregando...</p>
      </div>
    </motion.div>
  );
}
