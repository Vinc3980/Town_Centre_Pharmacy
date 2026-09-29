import { useHealth } from "../../hooks/useHealth";

export default function HealthCard() {
  const { data } = useHealth();
  return <div className="p-4 border rounded-lg bg-white">{data?.message ?? "Loading"}</div>;
}
