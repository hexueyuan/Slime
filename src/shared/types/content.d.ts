export type FunctionContentType = "quiz" | "preview" | "markdown" | "progress";

export interface QuizOption {
  value: string;
  label: string;
  recommended?: boolean;
}

export interface QuizQuestion {
  id: string;
  text: string;
  options: QuizOption[];
  allowCustom: boolean;
  multiple?: boolean;
}

export interface QuizContent {
  type: "quiz";
  questions: QuizQuestion[];
}

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

export type FunctionContent = QuizContent | PreviewContent | MarkdownContent | ProgressContent;
