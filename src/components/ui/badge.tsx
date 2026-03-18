import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-[10px] border-transparent px-1.5 py-0.5 text-2xs font-semibold transition-colors",
  {
    variants: {
      variant: {
        default: "bg-purple-dim text-primary",
        secondary: "bg-s3 text-t3",
        destructive: "bg-red-dim text-destructive",
        outline: "border border-border text-t2",
        success: "bg-green-dim text-success",
        warning: "bg-amber-dim text-warning",
        info: "bg-blue-dim text-info",
        google: "bg-google-dim text-google",
        tiktok: "bg-tiktok-dim text-tiktok",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
