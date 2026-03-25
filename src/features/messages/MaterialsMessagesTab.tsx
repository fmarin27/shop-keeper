import { useEffect, useMemo, useState } from 'react';
import MaterialsNeededSection from './MaterialsNeededSection';
import GeneralMessagesSection from './GeneralMessagesSection';
import type {
  GeneralMessage,
  MessageAudienceMode,
  MaterialRequest,
  MaterialStatus,
} from './types';
import {
  addMaterialRequest,
  markMaterialRead,
  setMaterialEmailStatus,
  subscribeToMaterials,
  updateMaterialStatus,
} from '../../services/firebase/materials';
import {
  addAudioGeneralMessage,
  archiveGeneralMessage,
  reopenGeneralMessage,
  setGeneralMessageImportant,
  markGeneralMessageRead,
  subscribeToGeneralMessages,
} from '../../services/firebase/messages';

type MaterialsMessagesTabProps = {
  appMode: MessageAudienceMode;
  compact?: boolean;
  focusedMaterialId?: string | null;
  focusedMessageId?: string | null;
  onFocusHandled?: () => void;
};

function MaterialsMessagesTab({
  appMode,
  compact = false,
  focusedMaterialId = null,
  focusedMessageId = null,
  onFocusHandled,
}: MaterialsMessagesTabProps) {
  const [materials, setMaterials] = useState<MaterialRequest[]>([]);
  const [messages, setMessages] = useState<GeneralMessage[]>([]);
  const [loadingMaterials, setLoadingMaterials] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(true);

  useEffect(() => {
    const unsubMaterials = subscribeToMaterials(appMode, (items) => {
      setMaterials(items);
      setLoadingMaterials(false);
    });

    const unsubMessages = subscribeToGeneralMessages(appMode, (items) => {
      setMessages(items);
      setLoadingMessages(false);
    });

    return () => {
      unsubMaterials();
      unsubMessages();
    };
  }, [appMode]);

  const unreadMaterialsCount = useMemo(
    () => materials.filter((item) => item.unread).length,
    [materials],
  );

  const unreadMessagesCount = useMemo(
    () => messages.filter((item) => item.unread).length,
    [messages],
  );

  const totalUnreadCount = unreadMaterialsCount + unreadMessagesCount;

  const visibleMaterials = useMemo(
    () => (compact ? materials.filter((item) => item.unread) : materials),
    [compact, materials],
  );

  const visibleMessages = useMemo(
    () => (compact ? messages.filter((item) => item.unread) : messages),
    [compact, messages],
  );

  const handleAddMaterial = async (
    itemName: string,
    quantity: string,
    note: string,
  ) => {
    try {
      const materialId = await addMaterialRequest(itemName, quantity, note, appMode);

      if (!materialId) {
        return {
          ok: false,
          message: 'Could not save material request.',
        };
      }

      let emailMessage = 'Material request saved.';

      if (appMode === 'tech') {
        const emailResult = await window.appBridge.sendMaterialRequestEmail({
          materialId,
          itemName: itemName.trim(),
          quantity: quantity.trim(),
          note: note.trim(),
          requestedBy: appMode,
        });

        if (!emailResult.ok) {
          await setMaterialEmailStatus(
            materialId,
            'failed',
            emailResult.message ?? 'Unknown error.',
          );
          return {
            ok: false,
            message: `Request saved, but email failed: ${emailResult.message ?? 'Unknown error.'}`,
          };
        }

        await setMaterialEmailStatus(materialId, 'sent');
        emailMessage = emailResult.message ?? 'Material request saved and emailed.';
      }

      return {
        ok: true,
        message: emailMessage,
      };
    } catch (error) {
      return {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : 'Could not save material request.',
      };
    }
  };

  const handleSetMaterialStatus = async (
    id: string,
    status: MaterialStatus,
  ) => {
    await updateMaterialStatus(id, status);
  };

  const handleMarkMaterialRead = async (id: string) => {
    await markMaterialRead(id, appMode);
  };

  const handleAddTextMessage = async (text: string) => {
    await addTextGeneralMessage(text, appMode);
  };

  const handleMarkMessageRead = async (id: string) => {
    await markGeneralMessageRead(id, appMode);
  };

  const handleArchiveMessage = async (id: string) => {
    await archiveGeneralMessage(id);
  };

  const handleReopenMessage = async (id: string) => {
    await reopenGeneralMessage(id);
  };

  const handleSetMessageImportant = async (id: string, important: boolean) => {
    await setGeneralMessageImportant(id, important);
  };

  if (loadingMaterials || loadingMessages) {
    return (
      <div
        style={{
          borderRadius: compact ? 16 : 24,
          padding: compact ? 14 : 28,
          background: 'rgba(15,23,42,0.78)',
          border: '1px solid rgba(148,163,184,0.18)',
          color: '#cbd5e1',
          fontSize: compact ? 13 : 16,
          fontWeight: 700,
        }}
      >
        Loading materials and messages...
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: compact ? 10 : 24 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
          padding: compact ? '10px 12px' : '14px 16px',
          borderRadius: compact ? 14 : 18,
          background:
            totalUnreadCount > 0
              ? 'rgba(37,99,235,0.18)'
              : 'rgba(15,23,42,0.42)',
          border:
            totalUnreadCount > 0
              ? '1px solid rgba(96,165,250,0.32)'
              : '1px solid rgba(148,163,184,0.12)',
          boxShadow:
            totalUnreadCount > 0
              ? '0 0 22px rgba(96,165,250,0.16)'
              : 'none',
        }}
      >
        <div>
          <div
            style={{
              color: '#f8fafc',
              fontWeight: 900,
              fontSize: compact ? 14 : 18,
              lineHeight: 1.1,
            }}
          >
            {compact ? 'Unread Activity' : 'Materials & Messages'}
          </div>
          <div
            style={{
              color: '#94a3b8',
              fontSize: compact ? 11 : 13,
              marginTop: 4,
            }}
          >
            {compact
              ? 'Compact view only shows unread shop activity.'
              : 'Live shop communication, because yelling across the building is apparently not a proper workflow.'}
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            gap: 8,
            flexWrap: 'wrap',
            alignItems: 'center',
          }}
        >
          <UnreadPill
            compact={compact}
            active={unreadMaterialsCount > 0}
            label="Materials"
            count={unreadMaterialsCount}
          />
          <UnreadPill
            compact={compact}
            active={unreadMessagesCount > 0}
            label="Messages"
            count={unreadMessagesCount}
          />
          <UnreadPill
            compact={compact}
            active={totalUnreadCount > 0}
            label="Total"
            count={totalUnreadCount}
          />
        </div>
      </div>

      <MaterialsNeededSection
        materials={visibleMaterials}
        appMode={appMode}
        compact={compact}
        unreadCount={unreadMaterialsCount}
        focusedMaterialId={focusedMaterialId}
        onFocusedMaterialHandled={onFocusHandled}
        onAddMaterial={handleAddMaterial}
        onSetMaterialStatus={handleSetMaterialStatus}
        onMarkMaterialRead={handleMarkMaterialRead}
      />

      <GeneralMessagesSection
        messages={visibleMessages}
        compact={compact}
        unreadCount={unreadMessagesCount}
        focusedMessageId={focusedMessageId}
        onFocusedMessageHandled={onFocusHandled}
        onAddTextMessage={handleAddTextMessage}
        onAddAudioMessage={(file) => addAudioGeneralMessage(file, appMode)}
        onMarkMessageRead={handleMarkMessageRead}
        onArchiveMessage={handleArchiveMessage}
        onReopenMessage={handleReopenMessage}
        onSetMessageImportant={handleSetMessageImportant}
      />
    </div>
  );
}

function UnreadPill({
  compact,
  active,
  label,
  count,
}: {
  compact: boolean;
  active: boolean;
  label: string;
  count: number;
}) {
  return (
    <div
      style={{
        fontSize: compact ? 11 : 13,
        fontWeight: 800,
        color: active ? '#dbeafe' : '#cbd5e1',
        background: active ? 'rgba(37,99,235,0.22)' : 'rgba(30,41,59,0.72)',
        border: active
          ? '1px solid rgba(96,165,250,0.38)'
          : '1px solid rgba(148,163,184,0.16)',
        borderRadius: 999,
        padding: compact ? '5px 9px' : '7px 12px',
        boxShadow: active ? '0 0 16px rgba(96,165,250,0.18)' : 'none',
        whiteSpace: 'nowrap',
      }}
    >
      {label}: {count}
    </div>
  );
}

export default MaterialsMessagesTab;
