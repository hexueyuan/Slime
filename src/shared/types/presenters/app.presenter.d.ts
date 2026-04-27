export interface IAppPresenter {
  getVersion(): string;
  resetAllData(): Promise<{ success: boolean; error?: string }>;
}
