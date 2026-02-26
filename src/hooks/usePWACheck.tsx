import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export function usePWACheck() {
  const [isPWA, setIsPWA] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    // Verifica se está rodando como PWA instalado
    const checkPWA = () => {
      const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
      const isInWebAppiOS = (window.navigator as any).standalone === true;
      
      setIsPWA(isStandalone || isInWebAppiOS);
      setIsLoading(false);
    };

    checkPWA();

    // Também ouve mudanças no display-mode
    const mediaQuery = window.matchMedia('(display-mode: standalone)');
    const handleChange = (e: MediaQueryListEvent) => {
      setIsPWA(e.matches);
    };
    
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  return { isPWA, isLoading };
}

// Componente que redireciona se não for PWA
export function PWAProtect({ children }: { children: React.ReactNode }) {
  const { isPWA, isLoading } = usePWACheck();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading && !isPWA) {
      // Se não é PWA e não é a página de download, redireciona
      if (window.location.pathname !== '/download') {
        navigate('/download', { replace: true });
      }
    }
  }, [isPWA, isLoading, navigate]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-dark-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-brand-500"></div>
      </div>
    );
  }

  return <>{children}</>;
}
