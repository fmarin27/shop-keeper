export type AppMode = 'manager' | 'tech';

export type DisplayMode = 'normal' | 'compact' | 'overlay';

export type MainTab = 'jobs' | 'parts' | 'materialsMessages' | 'leads';

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

export type JobPhoto = {
  id: string;
  url: string;
  createdAt: string;
  fileSize: number;
  width: number;
  height: number;
  timestampIncluded: boolean;
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

export type EmsEstimateLine = {
  id: string;
  lineNumber: string;
  sourceFile?: string;
  operationCode: string;
  operationCategory: string;
  partType: string;
  partNumber: string;
  description: string;
  quantity: number;
  laborType: string;
  laborHours: number;
  laborRate?: number;
  laborAmount: number;
  paintHours?: number;
  paintAmount?: number;
  partPrice: number;
  totalAmount: number;
  partsStatus?: JobPartStatus | 'needed' | 'backordered' | 'notNeeded';
};

export type EmsEstimateTotals = {
  bodyLaborHours: number;
  refinishLaborHours: number;
  mechanicalLaborHours: number;
  paintMaterials: number;
  partsTotal: number;
  grandTotal: number;
};

export type Job = {
  id: string;
  vehicle: string;
  roNumber: string;
  customerName: string;
  customerPhone?: string;
  customerEmail?: string;
  paintCode: string;
  amount: number;
  amountStatus: AmountStatus;
  status: JobStatus;
  done: boolean;
  promiseDate: string;
  partsWaiting: boolean;
  partsRequests: JobPartRequest[];
  textNotes: JobNote[];
  photos: JobPhoto[];
  sortOrder?: number;
  sourceSystem?: string;
  externalEstimateId?: string;
  insuranceCompany?: string;
  claimNumber?: string;
  policyNumber?: string;
  vehicleYear?: string;
  vehicleMake?: string;
  vehicleModel?: string;
  vehicleVin?: string;
  vehicleColor?: string;
  estimateTotals?: EmsEstimateTotals;
  estimateLines?: EmsEstimateLine[];
  emsLineItemCount?: number;
  lastEmsSyncAt?: string;
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

export type LeadStatus =
  | 'new'
  | 'contacted'
  | 'estimateScheduled'
  | 'won'
  | 'lost';

export type LeadUpdate = {
  id: string;
  text: string;
  createdAt: string;
};

export type LeadPhoto = {
  id: string;
  url: string;
  createdAt: string;
  fileSize: number;
  width: number;
  height: number;
  timestampIncluded: boolean;
};

export type Lead = {
  id: string;
  customerName: string;
  phoneNumber: string;
  vehicle: string;
  insuranceCompany: string;
  source: string;
  estimatedValue: number;
  followUpDate: string;
  status: LeadStatus;
  notes: string;
  updates: LeadUpdate[];
  photos: LeadPhoto[];
  createdAt: string;
  updatedAt?: string;
};

export type CreateLeadInput = {
  customerName: string;
  phoneNumber: string;
  vehicle: string;
  insuranceCompany: string;
  source: string;
  estimatedValue: number;
  followUpDate: string;
  status: LeadStatus;
  notes: string;
};
