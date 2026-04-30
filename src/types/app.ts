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
export type JobPartKind = 'part' | 'sublet';

export type JobPartRequest = {
  id: string;
  name: string;
  quantity: string;
  kind?: JobPartKind;
  requestedBy: AppMode;
  status: JobPartStatus;
  note?: string;
  invoiceNumber?: string;
  createdAt: string;
  receivedAt?: string;
  paidAt?: string;
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
  lineKind?: string;
  operationLabel?: string;
  isOrderablePart?: boolean;
  isSublet?: boolean;
  partsStatus?: JobPartStatus | 'needed' | 'backordered' | 'notNeeded';
  rawFields?: Record<string, unknown>;
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
  roNumber?: string;
  customerName?: string;
  vehicle?: string;
  phoneNumber?: string;
  customerEmail?: string;
  status?: JobStatus;
  paintCode?: string;
  amount?: number;
  amountStatus?: AmountStatus;
  promiseDate?: string;
  insuranceCompany?: string;
  claimNumber?: string;
  policyNumber?: string;
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

export type EmsNormalizedLineItem = {
  line_number?: string;
  source_file?: string;
  operation_code?: string;
  operation_category?: string;
  part_type?: string;
  part_number?: string;
  description?: string;
  quantity?: number | string;
  labor_type?: string;
  labor_hours?: number | string;
  labor_rate?: number | string;
  labor_amount?: number | string;
  paint_hours?: number | string;
  paint_amount?: number | string;
  part_price?: number | string;
  total_amount?: number | string;
  line_kind?: string;
  operation_label?: string;
  is_orderable_part?: boolean;
  is_sublet?: boolean;
  raw_fields?: Record<string, unknown>;
};

export type EmsNormalizedRepairOrder = {
  source_system?: string;
  external_estimate_id?: string;
  ro_number?: string;
  customer?: {
    first_name?: string;
    last_name?: string;
    full_name?: string;
    phone?: string;
    email?: string;
  };
  vehicle?: {
    year?: string;
    make?: string;
    model?: string;
    vin?: string;
    color?: string;
    paint_code?: string;
  };
  claim?: {
    claim_number?: string;
    insurance_company?: string;
    policy_number?: string;
  };
  totals?: {
    body_labor_hours?: number | string;
    refinish_labor_hours?: number | string;
    mechanical_labor_hours?: number | string;
    paint_materials?: number | string;
    parts_total?: number | string;
    grand_total?: number | string;
  };
  line_items?: EmsNormalizedLineItem[];
  raw_fields?: Record<string, unknown>;
};

export type EmsImportSelectionResult =
  | {
      canceled: true;
    }
  | {
      canceled: false;
      source: string;
      familyId: string;
      selectedPath: string;
      repairOrder: EmsNormalizedRepairOrder;
    };

export type EmsImportCandidate = {
  id: string;
  location: 'local' | 'office';
  source: 'ccc' | 'mitchell';
  familyId: string;
  label: string;
  rootPath: string;
  primaryFile: string;
  fileCount: number;
  lastModifiedAt: string;
  roNumber?: string;
  customerName?: string;
  amount?: number;
  vehicle?: string;
  insuranceCompany?: string;
  claimNumber?: string;
  previewError?: string;
};

export type EmsWatchedSourceStatus = {
  id: string;
  label: string;
  path: string;
  available: boolean;
  candidateCount: number;
  message?: string;
};

export type EmsImportCandidatesSnapshot = {
  generatedAt: string;
  candidates: EmsImportCandidate[];
  sources: EmsWatchedSourceStatus[];
};

export type EmsImportCandidateConversionResult = {
  source: string;
  familyId: string;
  selectedPath: string;
  repairOrder: EmsNormalizedRepairOrder;
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
