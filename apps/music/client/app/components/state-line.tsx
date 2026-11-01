import type { ReactNode } from "react";

interface StateLineProps {
  tone?: "muted";
  children: ReactNode;
}

export const StateLine: React.FC<StateLineProps> = (props) => {
  const { children } = props;
  return (
    <p className="state" role="status">
      {children}
    </p>
  );
};
