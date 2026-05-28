import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors",
  {
    variants: {
      variant: {
        default:     "border-transparent bg-primary text-primary-foreground",
        secondary:   "border-white/[0.06] bg-white/[0.05] text-zinc-400",
        destructive: "border-red-500/20 bg-red-500/10 text-red-400",
        outline:     "border-white/[0.08] text-zinc-400",
        success:     "border-blue-500/20 bg-blue-500/10 text-blue-400",
        subtle:      "border-transparent bg-white/[0.06] text-zinc-500",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
