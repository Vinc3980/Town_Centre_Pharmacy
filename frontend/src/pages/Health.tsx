import { useQuery } from "@tanstack/react-query";
import { getHealth } from "../api/health";

export default function HealthPage() {
  const { data, isLoading, error } = useQuery({ queryKey: ["health"], queryFn: getHealth });

  if (isLoading) return <div className="text-sm text-ink-900/50">Checking API health…</div>;
  if (error) return <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-700">API unreachable: {(error as Error).message}</div>;

  return (
    <div className="max-w-lg rounded-xl border border-pine-200 bg-white p-6 shadow-sm">
      <div className="h-2 w-2 rounded-full bg-emerald-500 inline-block mr-2" />
      <span className="text-sm font-medium text-emerald-700">{data?.message}</span>
      <pre className="mt-4 text-xs bg-sand-50 p-3 rounded-lg overflow-auto">{JSON.stringify(data, null, 2)}</pre>
      <p className="mt-3 text-xs text-ink-900/40">GET /api/v1/health — verifies database connectivity</p>
    </div>
  );
}
