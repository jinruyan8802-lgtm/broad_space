"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";

type DisplayLanguage = "zh" | "en";

interface LanguageContextType {
  displayLanguage: DisplayLanguage;
  setDisplayLanguage: (lang: DisplayLanguage) => void;
  toggleLanguage: () => void;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

const STORAGE_KEY = "broadspace-lang";

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [displayLanguage, setDisplayLanguage] = useState<DisplayLanguage>("zh");

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as DisplayLanguage | null;
    if (stored === "zh" || stored === "en") {
      setDisplayLanguage(stored);
    }
  }, []);

  const handleSetLanguage = (lang: DisplayLanguage) => {
    setDisplayLanguage(lang);
    localStorage.setItem(STORAGE_KEY, lang);
  };

  const toggleLanguage = () => {
    handleSetLanguage(displayLanguage === "zh" ? "en" : "zh");
  };

  return (
    <LanguageContext.Provider
      value={{ displayLanguage, setDisplayLanguage: handleSetLanguage, toggleLanguage }}
    >
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
}
