import React from "react";

interface SkeletonProps {
  className?: string;
  count?: number;
}

export default function Skeleton({ className = "", count = 1 }: SkeletonProps) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className={`animate-pulse bg-blue-50 rounded ${className}`}
          aria-hidden="true"
        />
      ))}
    </>
  );
}

export function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-3 p-4">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4">
          {Array.from({ length: cols }).map((_, j) => (
            <div key={j} className="h-4 bg-blue-50 rounded animate-pulse flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function CardSkeleton() {
  return (
    <div className="bg-white rounded-card border border-line-soft shadow-panel p-4 space-y-3">
      <div className="h-4 bg-blue-50 rounded animate-pulse w-1/3" />
      <div className="h-8 bg-blue-50 rounded animate-pulse w-1/2" />
      <div className="h-3 bg-blue-50 rounded animate-pulse w-2/3" />
    </div>
  );
}
