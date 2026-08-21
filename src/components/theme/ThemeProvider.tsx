import { useEffect } from "react";
import { FluentProvider } from "@fluentui/react-components";
import { useFTAStore } from "@/store/ftaStore";
import { appLightTheme, appDarkTheme } from "@/lib/fluentTheme";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useFTAStore((s) => s.theme);

  useEffect(() => {
    // Kept for any Tailwind `dark:` utility that hasn't moved to a Fluent
    // token yet (the fault-tree-domain CSS variables in index.css still key
    // off this class).
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
  }, [theme]);

  return (
    <FluentProvider theme={theme === "dark" ? appDarkTheme : appLightTheme} style={{ height: "100%" }}>
      {children}
    </FluentProvider>
  );
}
