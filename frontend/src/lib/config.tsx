import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "./api";
import type { AppConfig } from "./types";

const FALLBACK: AppConfig = {
  engine: "rules",
  model: null,
  paypal_mode: "mock",
  paypal_client_id: null,
  currency: "USD",
  confidence_threshold: 0.6,
  platform_fee_rate: 0.05,
};

interface ConfigState {
  config: AppConfig;
  online: boolean;
}

const Ctx = createContext<ConfigState>({ config: FALLBACK, online: false });

export function ConfigProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ConfigState>({ config: FALLBACK, online: false });
  useEffect(() => {
    let alive = true;
    const load = () =>
      api
        .config()
        .then((c) => alive && setState({ config: c, online: true }))
        .catch(() => alive && setState((s) => ({ ...s, online: false })));
    load();
    const id = window.setInterval(load, 15000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, []);
  return <Ctx.Provider value={state}>{children}</Ctx.Provider>;
}

export const useConfig = () => useContext(Ctx);
