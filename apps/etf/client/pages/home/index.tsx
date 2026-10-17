import { createLazyRoute } from "@tanstack/react-router";
import { MarketDashboard } from "@/features/market-dashboard";

export const Route = createLazyRoute("/")({
  component: MarketDashboard,
});
