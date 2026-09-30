import { useQuery } from "@tanstack/react-query";
import { fetchAllSettings } from "../api/settings";
import { useAuth } from "../context/AuthContext";

export const FALLBACK_PHARMACY_NAME = "Town Centre Pharmacy";

export function usePharmacyName() {
  const { hasPermission } = useAuth();
  const { data } = useQuery({
    queryKey: ["settings"],
    queryFn: fetchAllSettings,
    enabled: hasPermission("manage_settings"),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  return data?.pharmacy?.name?.trim() || FALLBACK_PHARMACY_NAME;
}
