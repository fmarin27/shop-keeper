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
