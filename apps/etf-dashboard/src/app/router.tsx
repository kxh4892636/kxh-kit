import { createRootRoute, createRoute } from "@tanstack/react-router";
import { RootLayout } from "./root-layout";

const rootRoute = createRootRoute({
  component: RootLayout,
});

const indexRoute = createRoute({
  getParentRoute: (): typeof rootRoute => rootRoute,
  path: "/",
}).lazy(
  (): Promise<(typeof import("@/pages/home"))["Route"]> =>
    import("@/pages/home").then(
      (module: typeof import("@/pages/home")): typeof module.Route => module.Route,
    ),
);

export const routeTree = rootRoute.addChildren([indexRoute]);
