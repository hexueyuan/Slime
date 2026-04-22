import { useQuery, type EntryKey } from "@pinia/colada";
import { usePresenter } from "./usePresenter";
import type { IPresenter } from "@shared/types/presenters";

export interface UseIpcQueryOptions<T extends keyof IPresenter> {
  key: () => EntryKey;
  presenter: T;
  method: string & keyof IPresenter[T];
  args?: () => unknown[];
  staleTime?: number;
  enabled?: () => boolean;
}

export function useIpcQuery<T extends keyof IPresenter>(options: UseIpcQueryOptions<T>) {
  const p = usePresenter(options.presenter);
  return useQuery({
    key: options.key,
    query: () => {
      const fn = p[options.method] as unknown as (...a: unknown[]) => Promise<unknown>;
      return fn(...(options.args?.() ?? []));
    },
    staleTime: options.staleTime ?? 30_000,
    enabled: options.enabled,
  });
}
