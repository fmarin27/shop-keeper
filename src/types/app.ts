export type AppMode = 'manager' | 'tech';

export type DisplayMode = 'normal' | 'compact' | 'overlay';

export type MainTab = 'jobs' | 'materialsMessages';

export type OverlayFocusTarget =
  | {
      tab: 'jobs';
      itemId: string;
    }
  | {
      tab: 'materialsMessages';
      itemType: 'material' | 'message';
      itemId: string;
    };

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

export type JobPartStatus = 'requested' | 'ordered' | 'reorderNeeded' | 'received';

export type JobPartRequest = {
  id: string;
  name: string;
  quantity: string;
  requestedBy: AppMode;
  status: JobPartStatus;
  note?: string;
  createdAt: string;
  receivedAt?: string;
};

export type Job = {
  id: string;
  vehicle: string;
  roNumber: string;
  customerName: string;
  paintCode: string;
  amount: number;
  amountStatus: AmountStatus;
  status: JobStatus;
  done: boolean;
  promiseDate: string;
  partsWaiting: boolean;
  partsRequests: JobPartRequest[];
  textNotes: JobNote[];
  sortOrder?: number;
};

export type CreateJobInput = {
  vehicle: string;
  roNumber: string;
  customerName: string;
  paintCode: string;
  amount: number;
  amountStatus: AmountStatus;
  status: JobStatus;
  promiseDate: string;
  partsWaiting: boolean;
  initialPartName?: string;
  initialPartQuantity?: string;
  initialPartNote?: string;
  initialPartStatus?: Exclude<JobPartStatus, 'received'>;
  initialNote?: string;
};

export type UpdateJobDetailsInput = {
  paintCode: string;
  amount: number;
  amountStatus: AmountStatus;
  promiseDate: string;
};
