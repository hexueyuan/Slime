import type { FunctionContent } from "../content";

export interface IContentPresenter {
  setContent(sessionId: string, content: FunctionContent): void;
  getContent(sessionId: string): FunctionContent | null;
  clearContent(sessionId: string): void;
  submitQuizAnswer(sessionId: string, answers: Record<string, string | string[]>): void;
  confirmPreview(sessionId: string): void;
  adjustPreview(sessionId: string): void;
  cancelProgress(sessionId: string): void;
  openFile(sessionId: string, filePath: string): Promise<void>;
}
