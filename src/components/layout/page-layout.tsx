import React, { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PageLayoutProps {
  title: string;
  icon?: React.ElementType;
  actions?: ReactNode;
  children: ReactNode;
  className?: string; // Para inyecciones menores
}

export function PageLayout({ title, icon: Icon, actions, children, className }: PageLayoutProps) {
  return (
    <div className={cn("flex flex-col space-y-6 w-full", className)}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="text-3xl sm:text-4xl font-black tracking-tight flex items-center gap-3">
          {Icon && <Icon className="w-6 h-6 sm:w-8 sm:h-8 text-primary" />}
          {title}
        </h1>
        {actions && (
          <div className="flex items-center gap-2">
            {actions}
          </div>
        )}
      </div>

      {/* Body */}
      <div className="w-full">
        {children}
      </div>
    </div>
  );
}
