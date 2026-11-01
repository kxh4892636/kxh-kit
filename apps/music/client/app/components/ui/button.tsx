import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "../../lib/cn.ts";

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
  {
    variants: {
      variant: {
        outline: "pill",
        ghost: "rounded-full hover:bg-[var(--color-paper-2)]",
        link: "text-[var(--color-accent)] underline underline-offset-4",
      },
      size: {
        default: "min-h-11 px-4",
        compact: "min-h-9 px-3 text-sm",
      },
    },
    defaultVariants: { variant: "outline", size: "default" },
  },
);

export interface ButtonProps extends ComponentProps<"button">, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button: React.FC<ButtonProps> = (props) => {
  const { className, variant, size, asChild = false, ...rest } = props;
  const Component = asChild ? Slot : "button";
  return <Component className={cn(buttonVariants({ variant, size }), className)} {...rest} />;
};
