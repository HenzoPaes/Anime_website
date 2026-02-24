import { useEffect } from "react";
import { useLocalStorage } from "./uselocalstorage";

export function useTheme() {
  const [theme, setTheme] = useLocalStorage<"dark" | "light">("theme", "dark");
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);
  return { theme, toggleTheme: () => setTheme((t) => (t === "dark" ? "light" : "dark")) };
}
