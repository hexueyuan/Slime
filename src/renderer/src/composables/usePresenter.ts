import type { IPresenter } from "@shared/types/presenters";
import { safeSerialize } from "../utils/serialize";

export function usePresenter<T extends keyof IPresenter>(name: T): IPresenter[T] {
  return new Proxy({} as IPresenter[T], {
    get(_target, method: string) {
      return async (...args: unknown[]) => {
        const rawArgs = args.map(safeSerialize);
        return window.electron.ipcRenderer.invoke("presenter:call", name, method, ...rawArgs);
      };
    },
  });
}
