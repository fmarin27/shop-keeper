export type MaterialStatus = 'requested' | 'ordered' | 'received';
export type MessageAudienceMode = 'manager' | 'tech';
export type MaterialEmailStatus = 'sent' | 'confirmed' | 'failed';

export type MaterialRequest = {
  id: string;
  itemName: string;
  quantity: string;
  note?: string;
  createdAt: string;
  unread: boolean;
  createdBy?: MessageAudienceMode;
  unreadByManager?: boolean;
  unreadByTech?: boolean;
  emailStatus?: MaterialEmailStatus;
  emailSentAt?: string;
  emailConfirmedAt?: string;
  emailReplyText?: string;
  status: MaterialStatus;
  archived?: boolean;
};

export type GeneralMessage = {
  id: string;
  type: 'text' | 'audio';
  text: string;
  createdAt: string;
  unread: boolean;
  createdBy?: MessageAudienceMode;
  unreadByManager?: boolean;
  unreadByTech?: boolean;
  archived?: boolean;
};
