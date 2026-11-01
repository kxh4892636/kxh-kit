import { Outlet } from "@tanstack/react-router";

export const RootLayout: React.FC = () => (
  <div className="shell">
    <header className="bar">
      <p className="bar__mark">Musopen</p>
      <p className="bar__sub">本地曲库</p>
    </header>
    <Outlet />
  </div>
);
