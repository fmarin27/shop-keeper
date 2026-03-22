export type AppMode = 'manager' | 'tech';

export type DisplayMode = 'normal' | 'compact' | 'overlay';

export type MainTab = 'jobs' | 'materialsMessages';

export type LocalAppSettings = {
  appMode: AppMode | null;
  displayMode: DisplayMode;
  overlayWidth: number;
  overlayHeight: number;
  overlayX: number | null;
  overlayY: number | null;
};

export type JobStatus = 'notStarted' | 'inProgress' | 'waiting' | 'done';

export type AmountStatus = 'final' | 'notFinal';

export type JobNote = {
  id: string;
  type: 'text' | 'audio';
  text?: string;
  audioUrl?: string;
  createdAt: string;
  read: boolean;
};

export type Job = {
  id: string;
  vehicle: string;
  roNumber: string;
  customerName: string;
  amount: number;
  amountStatus: AmountStatus;
  status: JobStatus;
  done: boolean;
  promiseDate: string;
  partsWaiting: boolean;
  textNotes: JobNote[];
  sortOrder?: number;
};

export type CreateJobInput = {
  vehicle: string;
  roNumber: string;
  customerName: string;
  amount: number;
  amountStatus: AmountStatus;
  status: JobStatus;
  promiseDate: string;
  partsWaiting: boolean;
  initialNote?: string;
};