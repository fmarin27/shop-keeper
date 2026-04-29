import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { GeneralMessage, MessageAudienceMode } from './types';

type GeneralMessageWithAudio = GeneralMessage & {
  audioUrl?: string;
};

type GeneralMessagesSectionProps = {
  messages: GeneralMessageWithAudio[];
  appMode: MessageAudienceMode;
  compact?: boolean;
  mobile?: boolean;
  unreadCount?: number;
  focusedMessageId?: string | null;
  onFocusedMessageHandled?: () => void;
  onAddTextMessage: (text: string) => void;
  onAddAudioMessage?: (file: Blob) => Promise<void> | void;
  onMarkMessageRead: (id: string) => void;
  onArchiveMessage: (id: string, archived: boolean) => void;
  onSetMessageUnreadState: (id: string, unread: boolean) => void;
  onDeleteMessage: (id: string) => void;
};

function GeneralMessagesSection({
  messages,
  appMode,
  compact = false,
  mobile = false,
  unreadCount = 0,
  focusedMessageId = null,
  onFocusedMessageHandled,
  onAddTextMessage,
  onAddAudioMessage,
  onMarkMessageRead,
  onArchiveMessage,
  onSetMessageUnreadState,
  onDeleteMessage,
}: GeneralMessagesSectionProps) {
  const [sectionOpen, setSectionOpen] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isSavingAudio, setIsSavingAudio] = useState(false);
  const [audioError, setAudioError] = useState('');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const focusedMessageRef = useRef<HTMLDivElement | null>(null);
  const focusTimeoutRef = useRef<number | null>(null);
  const lastAutoFocusedMessageIdRef = useRef<string | null>(null);

  const activeMessages = useMemo(
    () =>
      messages.filter(
        (message) => !message.archived && (message.unread || message.createdBy === appMode),
      ),
    [appMode, messages],
  );

  const historyMessages = useMemo(
    () => messages.filter((message) => message.archived || !message.unread),
    [messages],
  );

  useEffect(() => {
    return () => {
      cleanupRecorder();
      if (focusTimeoutRef.current !== null) {
        window.clearTimeout(focusTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!focusedMessageId) return;
    if (lastAutoFocusedMessageIdRef.current === focusedMessageId) return;

    const target = messages.find((message) => message.id === focusedMessageId);
    if (!target) return;

    if (target.unread) {
      onMarkMessageRead(target.id);
    }

    setSectionOpen(true);
    if (target.archived) {
      setHistoryOpen(true);
    }

    window.requestAnimationFrame(() => {
      focusedMessageRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    });

    if (focusTimeoutRef.current !== null) {
      window.clearTimeout(focusTimeoutRef.current);
    }

    lastAutoFocusedMessageIdRef.current = focusedMessageId;
    focusTimeoutRef.current = window.setTimeout(() => {
      onFocusedMessageHandled?.();
    }, 1200);
  }, [focusedMessageId, messages, onFocusedMessageHandled, onMarkMessageRead]);

  useEffect(() => {
    if (!focusedMessageId) {
      lastAutoFocusedMessageIdRef.current = null;
    }
  }, [focusedMessageId]);

  const submit = () => {
    const trimmed = draft.trim();
    if (!trimmed) return;

    onAddTextMessage(trimmed);
    setDraft('');
    setShowForm(false);
  };

  const cleanupRecorder = () => {
    try {
      mediaRecorderRef.current = null;
      recordedChunksRef.current = [];

      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      }

      mediaStreamRef.current = null;
    } catch (error) {
      console.error('Failed to clean up general message recorder:', error);
    }
  };

  const startRecording = async () => {
    if (isRecording || isSavingAudio || !onAddAudioMessage) return;

    setAudioError('');

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('This device does not support microphone recording.');
      }

      if (typeof MediaRecorder === 'undefined') {
        throw new Error('MediaRecorder is not available on this device.');
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      recordedChunksRef.current = [];

      const mimeType = getSupportedAudioMimeType();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };

      recorder.onerror = () => {
        setAudioError('Recording failed. Please try again.');
        setIsRecording(false);
        cleanupRecorder();
      };

      recorder.onstop = async () => {
        const finalMimeType = recorder.mimeType || mimeType || 'audio/webm';
        const blob = new Blob(recordedChunksRef.current, {
          type: finalMimeType,
        });

        setIsRecording(false);

        if (!blob.size) {
          setAudioError('No audio was captured.');
          cleanupRecorder();
          return;
        }

        try {
          setIsSavingAudio(true);
          await onAddAudioMessage(blob);
        } catch (error) {
          console.error('Failed to save general audio message:', error);
          setAudioError('Could not save audio message.');
        } finally {
          setIsSavingAudio(false);
          cleanupRecorder();
        }
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
    } catch (error) {
      console.error('Failed to start general message recording:', error);
      cleanupRecorder();
      setAudioError(
        error instanceof Error ? normalizeAudioError(error.message) : 'Microphone access failed.',
      );
      setIsRecording(false);
    }
  };

  const stopRecording = () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === 'inactive') return;
    recorder.stop();
  };

  const showComposer = !compact || mobile;

  return (
    <section style={sectionStyle(compact, unreadCount > 0)}>
      <button
        type="button"
        onClick={() => setSectionOpen((current) => !current)}
        style={headerButtonStyle(compact)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={labelPillStyle(compact)}>Messages</span>
          <h2 style={titleStyle(compact)}>
            {compact ? 'General Messages' : 'General Messages'}
          </h2>
          {unreadCount > 0 ? (
            <span style={unreadPillStyle(compact)}>{unreadCount} unread</span>
          ) : null}
        </div>

        <span style={miniButtonStyle(compact)}>
          {sectionOpen ? 'Collapse' : 'Expand'}
        </span>
      </button>

      {sectionOpen ? (
        <div style={{ display: 'grid', gap: compact ? 10 : 16 }}>
          {showComposer ? (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setShowForm((current) => !current)}
                disabled={isRecording || isSavingAudio}
                style={actionButtonStyle(compact, false, isRecording || isSavingAudio)}
              >
                {showForm ? 'Close' : 'Add Text Message'}
              </button>
              {isRecording ? (
                <button
                  type="button"
                  onClick={stopRecording}
                  disabled={isSavingAudio}
                  style={actionButtonStyle(compact, true, isSavingAudio)}
                >
                  Stop Recording
                </button>
              ) : (
                <button
                  type="button"
                  onClick={startRecording}
                  disabled={isSavingAudio || !onAddAudioMessage}
                  style={actionButtonStyle(compact, true, isSavingAudio || !onAddAudioMessage)}
                >
                  Record Audio Message
                </button>
              )}
            </div>
          ) : null}

          {showComposer && showForm ? (
            <div style={composerCardStyle()}>
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="Type a general message..."
                style={textAreaStyle(compact)}
              />

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button type="button" onClick={submit} style={actionButtonStyle(compact, true)}>
                  Save Message
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    setDraft('');
                  }}
                  style={actionButtonStyle(compact, false)}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : null}

          {showComposer && (isRecording || isSavingAudio || audioError) ? (
            <div style={{ display: 'grid', gap: 8 }}>
              {isRecording ? <div style={statusTextStyle()}>Recording audio message...</div> : null}
              {isSavingAudio ? <div style={statusTextStyle()}>Saving audio message...</div> : null}
              {audioError ? <div style={errorBoxStyle()}>{audioError}</div> : null}
            </div>
          ) : null}

          <div style={{ display: 'grid', gap: compact ? 8 : 14 }}>
            {activeMessages.length ? (
              activeMessages.map((message, index) => (
                <MessageCard
                  key={message.id}
                  message={message}
                  compact={compact}
                  index={index}
                  isFocused={focusedMessageId === message.id}
                  cardRef={focusedMessageId === message.id ? focusedMessageRef : null}
                  onOpen={() => onMarkMessageRead(message.id)}
                  actions={
                    <>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onArchiveMessage(message.id, true);
                        }}
                        style={miniButtonStyle(compact)}
                      >
                        Archive
                      </button>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onDeleteMessage(message.id);
                        }}
                        style={dangerButtonStyle(compact)}
                      >
                        Delete
                      </button>
                    </>
                  }
                />
              ))
            ) : (
              <div style={emptyStateStyle(compact)}>No active messages.</div>
            )}
          </div>

          <div style={historyCardStyle(compact)}>
            <button
              type="button"
              onClick={() => setHistoryOpen((current) => !current)}
              style={historyToggleStyle()}
            >
              <div>
                <div style={{ fontSize: compact ? 14 : 18, fontWeight: 800, color: '#f8fafc' }}>
                  Message History
                </div>
                <div style={{ color: '#b8c7da', fontSize: compact ? 11 : 12, marginTop: 4 }}>
                  Read or archived messages
                </div>
              </div>
              <span style={miniButtonStyle(compact)}>
                {historyOpen ? 'Collapse' : 'Expand'}
              </span>
            </button>

            {historyOpen ? (
              historyMessages.length ? (
                <div style={{ display: 'grid', gap: compact ? 8 : 14 }}>
                  {historyMessages.map((message) => (
                    <MessageCard
                      key={message.id}
                      message={message}
                      compact={compact}
                      index={0}
                      muted
                      isFocused={focusedMessageId === message.id}
                      cardRef={focusedMessageId === message.id ? focusedMessageRef : null}
                      onOpen={() => onMarkMessageRead(message.id)}
                      actions={
                        <>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              if (message.archived) {
                                onArchiveMessage(message.id, false);
                                return;
                              }

                              onSetMessageUnreadState(message.id, true);
                            }}
                            style={miniButtonStyle(compact)}
                          >
                            {message.archived ? 'Restore' : 'Bring Back'}
                          </button>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              onDeleteMessage(message.id);
                            }}
                            style={dangerButtonStyle(compact)}
                          >
                            Delete
                          </button>
                        </>
                      }
                    />
                  ))}
                </div>
              ) : (
                <div style={{ color: '#b8c7da', fontSize: compact ? 11 : 13, fontWeight: 700 }}>
                  No message history yet.
                </div>
              )
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function MessageCard({
  message,
  compact,
  index,
  isFocused,
  cardRef,
  onOpen,
  actions,
  muted = false,
}: {
  message: GeneralMessageWithAudio;
  compact: boolean;
  index: number;
  isFocused: boolean;
  cardRef: React.RefObject<HTMLDivElement | null> | null;
  onOpen: () => void;
  actions: React.ReactNode;
  muted?: boolean;
}) {
  return (
    <div
      ref={cardRef}
      onClick={onOpen}
      style={{
        borderRadius: compact ? 14 : 18,
        padding: compact ? 12 : 18,
        background: muted
          ? 'rgba(57,68,86,0.92)'
          : message.unread
          ? index % 2 === 0
            ? 'rgba(70,46,95,0.98)'
            : 'rgba(88,58,117,0.98)'
          : index % 2 === 0
          ? 'rgba(63,47,89,0.96)'
          : 'rgba(82,59,108,0.96)',
        border: isFocused
          ? '2px solid rgba(96,165,250,0.68)'
          : message.unread
          ? '2px solid rgba(96,165,250,0.34)'
          : '2px solid rgba(148,163,184,0.3)',
        boxShadow: isFocused
          ? '0 0 28px rgba(96,165,250,0.18)'
          : '0 10px 24px rgba(0,0,0,0.14)',
        cursor: 'pointer',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 12,
          flexWrap: 'wrap',
          marginBottom: 8,
        }}
      >
        <span style={messageTypePillStyle(compact, message.type)}>
          {message.type === 'audio' ? 'Audio' : 'Text'}
        </span>
        {message.unread ? (
          <div style={{ fontSize: compact ? 11 : 13, fontWeight: 800, color: '#93c5fd' }}>
            Unread
          </div>
        ) : null}
      </div>

      <div
        style={{
          fontSize: compact ? 12 : 15,
          color: '#f8fafc',
          fontWeight: 600,
          marginBottom: 10,
        }}
      >
        {message.type === 'audio' ? 'Audio message' : message.text}
      </div>

      <div style={{ display: 'grid', gap: 10 }}>
        {message.type === 'audio' && message.audioUrl ? (
          <audio
            controls
            src={message.audioUrl}
            style={{ width: '100%', maxWidth: compact ? 280 : 360 }}
            onPlay={() => onOpen()}
          />
        ) : null}

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: 12,
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ fontSize: compact ? 10 : 12, color: '#b8c7da' }}>
            {formatDateTime(message.createdAt)}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{actions}</div>
        </div>
      </div>
    </div>
  );
}

function sectionStyle(compact: boolean, activeUnread: boolean): React.CSSProperties {
  return {
    borderRadius: compact ? 16 : 24,
    padding: compact ? 14 : 28,
    background: activeUnread ? 'rgba(58,74,97,0.96)' : 'rgba(58,74,97,0.94)',
    border: activeUnread
      ? '2px solid rgba(96,165,250,0.42)'
      : '2px solid rgba(175,189,208,0.32)',
    boxShadow: activeUnread
      ? '0 0 26px rgba(96,165,250,0.1), 0 18px 40px rgba(0,0,0,0.14)'
      : '0 18px 40px rgba(0,0,0,0.14), inset 0 0 0 1px rgba(255,255,255,0.05)',
  };
}

function headerButtonStyle(compact: boolean): React.CSSProperties {
  return {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
    marginBottom: compact ? 10 : 20,
    width: '100%',
    background: 'transparent',
    border: 'none',
    padding: 0,
    cursor: 'pointer',
    textAlign: 'left',
  };
}

function labelPillStyle(compact: boolean): React.CSSProperties {
  return {
    borderRadius: 999,
    padding: compact ? '5px 9px' : '7px 12px',
    background: 'linear-gradient(180deg, rgba(192,132,252,0.26), rgba(109,40,217,0.34))',
    border: '1px solid rgba(216,180,254,0.44)',
    color: '#faf5ff',
    fontSize: compact ? 10 : 12,
    fontWeight: 900,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  };
}

function titleStyle(compact: boolean): React.CSSProperties {
  return {
    margin: 0,
    fontSize: compact ? 16 : 28,
    fontWeight: 800,
    color: '#f8fafc',
  };
}

function unreadPillStyle(compact: boolean): React.CSSProperties {
  return {
    fontSize: compact ? 11 : 13,
    fontWeight: 900,
    color: '#dbeafe',
    background: 'rgba(37,99,235,0.22)',
    border: '1px solid rgba(96,165,250,0.34)',
    borderRadius: 999,
    padding: compact ? '5px 8px' : '7px 11px',
    boxShadow: '0 0 16px rgba(96,165,250,0.16)',
    whiteSpace: 'nowrap',
  };
}

function composerCardStyle(): React.CSSProperties {
  return {
    display: 'grid',
    gap: 10,
    padding: 14,
    borderRadius: 16,
    background: 'rgba(39,53,73,0.96)',
    border: '2px solid rgba(175,189,208,0.3)',
  };
}

function textAreaStyle(compact: boolean): React.CSSProperties {
  return {
    width: '100%',
    minHeight: 84,
    resize: 'vertical',
    boxSizing: 'border-box',
    borderRadius: compact ? 12 : 14,
    border: '2px solid rgba(148,163,184,0.24)',
    background: 'rgba(9,15,28,0.96)',
    color: '#f8fafc',
    padding: 12,
    fontSize: compact ? 12 : 13,
    fontFamily: 'inherit',
    outline: 'none',
  };
}

function actionButtonStyle(
  compact: boolean,
  primary: boolean,
  disabled = false,
): React.CSSProperties {
  return {
    border: primary
      ? '1px solid rgba(96,165,250,0.4)'
      : '1px solid rgba(148,163,184,0.34)',
    background: primary ? 'rgba(37,99,235,0.38)' : 'rgba(51,65,85,0.92)',
    color: '#f8fafc',
    borderRadius: compact ? 12 : 14,
    padding: compact ? '10px 12px' : '12px 14px',
    fontSize: compact ? 12 : 13,
    fontWeight: 800,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
  };
}

function miniButtonStyle(compact: boolean): React.CSSProperties {
  return {
    border: '1px solid rgba(148,163,184,0.34)',
    background: 'rgba(51,65,85,0.92)',
    color: '#f8fafc',
    borderRadius: compact ? 10 : 12,
    padding: compact ? '7px 10px' : '8px 12px',
    fontSize: compact ? 11 : 12,
    fontWeight: 800,
    cursor: 'pointer',
  };
}

function dangerButtonStyle(compact: boolean): React.CSSProperties {
  return {
    border: '1px solid rgba(248,113,113,0.34)',
    background: 'rgba(127,29,29,0.36)',
    color: '#fee2e2',
    borderRadius: compact ? 10 : 12,
    padding: compact ? '7px 10px' : '8px 12px',
    fontSize: compact ? 11 : 12,
    fontWeight: 800,
    cursor: 'pointer',
  };
}

function messageTypePillStyle(
  compact: boolean,
  type: 'text' | 'audio',
): React.CSSProperties {
  return {
    fontSize: compact ? 11 : 13,
    fontWeight: 800,
    borderRadius: 999,
    padding: compact ? '5px 9px' : '7px 12px',
    background: type === 'audio' ? 'rgba(37,99,235,0.22)' : 'rgba(71,85,105,0.28)',
    border:
      type === 'audio'
        ? '1px solid rgba(96,165,250,0.34)'
        : '1px solid rgba(148,163,184,0.26)',
    color: type === 'audio' ? '#dbeafe' : '#e2e8f0',
  };
}

function historyCardStyle(compact: boolean): React.CSSProperties {
  return {
    borderRadius: compact ? 14 : 18,
    padding: compact ? 12 : 14,
    background: 'rgba(39,53,73,0.82)',
    border: '2px solid rgba(175,189,208,0.22)',
    display: 'grid',
    gap: 12,
  };
}

function historyToggleStyle(): React.CSSProperties {
  return {
    width: '100%',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    background: 'transparent',
    border: 'none',
    padding: 0,
    cursor: 'pointer',
    color: 'inherit',
    textAlign: 'left',
  };
}

function emptyStateStyle(compact: boolean): React.CSSProperties {
  return {
    borderRadius: compact ? 14 : 18,
    padding: compact ? 12 : 16,
    background: 'rgba(39,53,73,0.96)',
    border: '2px solid rgba(175,189,208,0.3)',
    color: '#b8c7da',
    fontSize: compact ? 11 : 13,
    fontWeight: 700,
  };
}

function statusTextStyle(): React.CSSProperties {
  return {
    fontSize: 13,
    fontWeight: 700,
    color: '#93c5fd',
  };
}

function errorBoxStyle(): React.CSSProperties {
  return {
    borderRadius: 14,
    padding: '11px 13px',
    background: 'rgba(127,29,29,0.28)',
    border: '1px solid rgba(248,113,113,0.28)',
    color: '#fecaca',
    fontSize: 13,
    fontWeight: 700,
  };
}

function getSupportedAudioMimeType() {
  if (typeof MediaRecorder === 'undefined') return '';

  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/mp4',
  ];

  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? '';
}

function normalizeAudioError(message: string) {
  const lower = message.toLowerCase();

  if (lower.includes('requested device not found')) {
    return 'No microphone device was found on this PC.';
  }

  if (lower.includes('permission denied') || lower.includes('notallowederror')) {
    return 'Microphone permission was denied.';
  }

  if (lower.includes('notfounderror')) {
    return 'No microphone device was found on this PC.';
  }

  if (lower.includes('notreadableerror')) {
    return 'The microphone is busy or unavailable right now.';
  }

  if (lower.includes('mediarecorder')) {
    return 'Audio recording is not supported on this device.';
  }

  return 'Microphone access failed.';
}

function formatDateTime(value: string) {
  const date = new Date(value);
  return new Intl.DateTimeFormat('en-US', {
    month: 'numeric',
    day: 'numeric',
    year: '2-digit',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

export default GeneralMessagesSection;
