import { useEffect, useState } from "react";
import { api, type MeResponse } from "./api";

export function useMe() {
  const [data, setData] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = () => {
    setLoading(true);
    api
      .me()
      .then(setData)
      .catch(() => setData({ user: null }))
      .finally(() => setLoading(false));
  };

  useEffect(refresh, []);

  return { me: data?.user ?? null, impersonating: data?.impersonating ?? null, loading, refresh };
}
