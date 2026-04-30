export type AppMode = 'manager' | 'tech';

export type DisplayMode = 'normal' | 'compact' | 'overlay';

export type MainTab =
  | 'commandCenter'
  | 'jobs'
  | 'parts'
  | 'materialsMessages'
  | 'leads'
  | 'materialsManager';

export type OverlayFocusTarget =
  | {
      tab: 'jobs';
      itemId: string;
      done?: boolean;
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
  materialsManagerUnlocked: boolean;
};

export type JobStatus =
  | 'notStarted'
  | 'inProgress'
  | 'waiting'
  | 'waitingOnAppraiser'
  | 'supplementNeeded'
  | 'done';

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
  phoneNumber: string;
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
  sourceJobUid?: string;
  sourceEstimateId?: string;
  sourceOpportunityNumber?: string;
  mitchellEstimatorName?: string;
  mitchellInsuranceCompany?: string;
  mitchellClaimNumber?: string;
  mitchellDepartmentName?: string;
  mitchellLeadTechName?: string;
  mitchellProductionStatus?: string;
  mitchellLastSourceModifiedAt?: string;
};

export type CreateJobInput = {
  vehicle: string;
  roNumber: string;
  customerName: string;
  phoneNumber: string;
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
  phoneNumber: string;
  status: JobStatus;
  paintCode: string;
  amount: number;
  amountStatus: AmountStatus;
  promiseDate: string;
};

export type MitchellJobImport = {
  jobUid: string;
  roNumber: string;
  customerName: string;
  phoneNumber: string;
  vehicle: string;
  amount: number;
  promiseDate: string;
  partsWaiting: boolean;
  status: Exclude<JobStatus, 'done'>;
  estimatorName: string;
  insuranceCompany: string;
  claimNumber: string;
  departmentName: string;
  leadTechName: string;
  productionStatus: string;
  estimateId: string;
  opportunityNumber: string;
  lastModifiedAt: string;
};

export type MitchellJobsSnapshot = {
  sourcePath: string;
  lastModifiedAt: string;
  jobs: MitchellJobImport[];
};

export type MaterialsManagerSummary = {
  materialCount: number;
  invoiceCount: number;
  invoiceItemCount: number;
  refundCount: number;
  catalogValue: number;
  totalInvoiceSpend: number;
  latestInvoiceDate: string;
  latestUpdatedAt: string;
};

export type MaterialsManagerInvoice = {
  id: number;
  number: string;
  date: string;
  isRefund: boolean;
  sourceDevice: string;
  updatedAt: string;
  lineItemCount: number;
  subtotal: number;
  tax: number;
  total: number;
  materialNames: string[];
};

export type MaterialsManagerMaterial = {
  id: number;
  name: string;
  partNumber: string;
  netPrice: number;
  usageCount: number;
  totalPurchasedQty: number;
  averageUnitCost: number;
  lastInvoiceDate: string;
};

export type MaterialsManagerSnapshot = {
  sourcePath: string;
  generatedAt: string;
  summary: MaterialsManagerSummary;
  recentInvoices: MaterialsManagerInvoice[];
  materials: MaterialsManagerMaterial[];
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
