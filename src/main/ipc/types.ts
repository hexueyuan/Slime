import type { IpcMainInvokeEvent } from "electron";
import type { IpcChannels, IpcChannel } from "@shared/types";

export type IpcHandler<C extends IpcChannel> = (
  event: IpcMainInvokeEvent,
  args: IpcChannels[C]["request"],
) => Promise<IpcChannels[C]["response"]> | IpcChannels[C]["response"];
