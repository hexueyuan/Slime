export type FunctionContentType = "preview" | "markdown" | "progress" | "interaction";

export interface PreviewContent {
  type: "preview";
  html: string;
  title?: string;
  confirmLabel?: string;
  adjustLabel?: string;
}

export interface MarkdownContent {
  type: "markdown";
  content: string;
  title?: string;
}

export interface ProgressContent {
  type: "progress";
  percentage: number;
  label: string;
  stage: string;
  cancellable?: boolean;
}

export interface InteractionOption {
  value: string;
  label: string;
  recommended?: boolean;
}

export interface InteractionContent {
  type: "interaction";
  sessionId: string;
  toolCallId: string;
  question: string;
  options: InteractionOption[];
  multiple?: boolean;
  htmlFile?: string;
  htmlContent?: string;
}

export type FunctionContent =
  | PreviewContent
  | MarkdownContent
  | ProgressContent
  | InteractionContent;
