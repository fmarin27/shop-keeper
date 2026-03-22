export type MaterialStatus = 'requested' | 'ordered' | 'received';

export type MaterialRequest = {
  id: string;
  itemName: string;
  quantity: string;
  note?: string;
  createdAt: string;
  unread: boolean;
  status: MaterialStatus;
};

export type GeneralMessage = {
  id: string;
  type: 'text' | 'audio';
  text: string;
  createdAt: string;
  unread: boolean;
};

export const mockMaterials: MaterialRequest[] = [
  {
    id: 'mat-1',
    itemName: '2K Clear Coat',
    quantity: '1 gallon',
    note: 'Running low',
    createdAt: '2026-03-15T09:30:00',
    unread: true,
    status: 'requested',
  },
  {
    id: 'mat-2',
    itemName: '180 Grit Discs',
    quantity: '2 boxes',
    note: 'For Silverado job',
    createdAt: '2026-03-15T08:10:00',
    unread: false,
    status: 'ordered',
  },
  {
    id: 'mat-3',
    itemName: 'Masking Paper',
    quantity: '1 roll',
    createdAt: '2026-03-14T16:20:00',
    unread: false,
    status: 'received',
  },
];

export const mockGeneralMessages: GeneralMessage[] = [
  {
    id: 'msg-1',
    type: 'text',
    text: 'Booth filter is getting low.',
    createdAt: '2026-03-15T10:12:00',
    unread: true,
  },
  {
    id: 'msg-2',
    type: 'audio',
    text: 'Audio message placeholder',
    createdAt: '2026-03-15T09:02:00',
    unread: false,
  },
  {
    id: 'msg-3',
    type: 'text',
    text: 'Need more mixing cups by tomorrow.',
    createdAt: '2026-03-14T15:25:00',
    unread: false,
  },
];