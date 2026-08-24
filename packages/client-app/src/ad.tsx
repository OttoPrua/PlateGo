import { createContext, useContext, type PropsWithChildren, type ReactNode } from "react";

export interface AdRequest {
  slot: "dashboard-footer" | "pool-footer";
  surface: "web" | "extension";
}

export interface AdProviderValue {
  enabled: boolean;
  render(request: AdRequest): ReactNode;
}

const AdContext = createContext<AdProviderValue>({ enabled: false, render: () => null });

export function NullAdProvider({ children }: PropsWithChildren) {
  return <AdContext.Provider value={{ enabled: false, render: () => null }}>{children}</AdContext.Provider>;
}

export function AdProvider({ value, children }: PropsWithChildren<{ value: AdProviderValue }>) {
  return <AdContext.Provider value={value}>{children}</AdContext.Provider>;
}

export function AdSlot({ slot, surface }: AdRequest) {
  const provider = useContext(AdContext);
  if (!provider.enabled) return null;
  return <aside className="ad-slot" data-ad-slot={slot} data-ad-surface={surface} aria-label="推广内容">{provider.render({ slot, surface })}</aside>;
}
