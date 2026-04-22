import { useMutation } from "@pinia/colada";
import { usePresenter } from "./usePresenter";
import type { IPresenter } from "@shared/types/presenters";

export interface UseIpcMutationOptions<T extends keyof IPresenter> {
  presenter: T;
  method: string & keyof IPresenter[T];
  onSuccess?: () => void;
  onError?: (error: unknown) => void;
}

export function useIpcMutation<T extends keyof IPresenter>(options: UseIpcMutationOptions<T>) {
  const p = usePresenter(options.presenter);
  return useMutation({
    mutation: async (...args: unknown[]) => {
      const fn = p[options.method] as unknown as (...a: unknown[]) => Promise<unknown>;
      return fn(...args);
    },
    onSuccess: options.onSuccess,
    onError: options.onError,
  });
}
