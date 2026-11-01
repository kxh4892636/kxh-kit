import { createRootRoute, createRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { RootLayout } from "./root-layout.tsx";
import { HomeRoute } from "./routes/home.tsx";

const rootRoute = createRootRoute({ component: RootLayout });

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: HomeRoute,
});

const routeTree = rootRoute.addChildren([indexRoute]);

const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

export const AppRouter: React.FC = () => <RouterProvider router={router} />;
