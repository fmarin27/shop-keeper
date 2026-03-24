import React, { useEffect, useRef, useState } from 'react';
import type { GeneralMessage } from './types';

type GeneralMessageWithAudio = GeneralMessage & {
  audioUrl?: string;
};

type GeneralMessagesSectionProps = {
  messages: GeneralMessageWithAudio[];
  compact?: boolean;
  unreadCount?: number;
  focusedMessageId?: string | null;
  onFocusedMessageHandled?: () => void;
  onAddTextMessage: (text: string) => void;
  onAddAudioMessage?: (file: Blob) => Promise<void> | void;
  onMarkMessageRead: (id: string) => void;
};

function GeneralMessagesSection({
  messages,
  compact = false,
  unreadCount = 0,
  focusedMessageId = null,
  onFocusedMessageHandled,
  onAddTextMessage,
  onAddAudioMessage,
  onMarkMessageRead,
}: GeneralMessagesSectionProps) {
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

    const target = messages.find((message) => message.id === focusedMessageId);
    if (!target) return;

    window.requestAnimationFrame(() => {
      focusedMessageRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    });

    if (focusTimeoutRef.current !== null) {
      window.clearTimeout(focusTimeoutRef.current);
    }

    focusTimeoutRef.current = window.setTimeout(() => {
      onFocusedMessageHandled?.();
    }, 1200);
  }, [focusedMessageId, messages, onFocusedMessageHandled]);

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

      recorder.onerror = (event) => {
        console.error('General message MediaRecorder error:', event);
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

      const message =
        error instanceof Error
          ? normalizeAudioError(error.message)
          : 'Microphone access failed.';

      setAudioError(message);
      setIsRecording(false);
    }
  };

  const stopRecording = () => {
    const recorder = mediaRecorderRef.current;

    if (!recorder) return;
    if (recorder.state === 'inactive') return;

    recorder.stop();
  };

  const showComposer = !compact;

  return (
    <section
      style={{
        borderRadius: compact ? 16 : 24,
        padding: compact ? 14 : 28,
        background: unreadCount > 0 ? 'rgba(58,74,97,0.96)' : 'rgba(58,74,97,0.94)',
        border:
          unreadCount > 0
            ? '2px solid rgba(96,165,250,0.42)'
            : '2px solid rgba(175,189,208,0.32)',
        boxShadow:
          unreadCount > 0
            ? '0 0 26px rgba(96,165,250,0.1), 0 18px 40px rgba(0,0,0,0.14)'
            : '0 18px 40px rgba(0,0,0,0.14), inset 0 0 0 1px rgba(255,255,255,0.05)',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
          marginBottom: compact ? 10 : 20,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span
            style={{
              borderRadius: 999,
              padding: compact ? '5px 9px' : '7px 12px',
              background:
                'linear-gradient(180deg, rgba(192,132,252,0.26), rgba(109,40,217,0.34))',
              border: '1px solid rgba(216,180,254,0.44)',
              color: '#faf5ff',
              fontSize: compact ? 10 : 12,
              fontWeight: 900,
              letterSpacing: 0.8,
              textTransform: 'uppercase',
            }}
          >
            Messages
          </span>
          <h2
            style={{
              margin: 0,
              fontSize: compact ? 16 : 28,
              fontWeight: 800,
              color: '#f8fafc',
            }}
          >
            {compact ? 'Unread Messages' : 'General Messages'}
          </h2>

          {unreadCount > 0 ? (
            <span
              style={{
                fontSize: compact ? 11 : 13,
                fontWeight: 900,
                color: '#dbeafe',
                background: 'rgba(37,99,235,0.22)',
                border: '1px solid rgba(96,165,250,0.34)',
                borderRadius: 999,
                padding: compact ? '5px 8px' : '7px 11px',
                boxShadow: '0 0 16px rgba(96,165,250,0.16)',
                whiteSpace: 'nowrap',
              }}
            >
              {unreadCount} unread
            </span>
          ) : null}
        </div>

        {showComposer ? (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button
              onClick={() => setShowForm((v) => !v)}
              disabled={isRecording || isSavingAudio}
              style={buttonStyle(false, false, isRecording || isSavingAudio)}
            >
              {showForm ? 'Close' : 'Add Text Message'}
            </button>

            {isRecording ? (
              <button
                onClick={stopRecording}
                disabled={isSavingAudio}
                style={buttonStyle(false, true, isSavingAudio)}
              >
                Stop Recording
              </button>
            ) : (
              <button
                onClick={startRecording}
                disabled={isSavingAudio || !onAddAudioMessage}
                style={buttonStyle(false, true, isSavingAudio || !onAddAudioMessage)}
              >
                Record Audio Message
              </button>
            )}
          </div>
        ) : null}
      </div>

      {showComposer && showForm ? (
        <div
          style={{
            display: 'grid',
            gap: 10,
            marginBottom: 18,
            padding: 14,
            borderRadius: 16,
            background: 'rgba(39,53,73,0.96)',
            border: '2px solid rgba(175,189,208,0.3)',
          }}
        >
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Type a general message..."
            style={{
              width: '100%',
              minHeight: 84,
              resize: 'vertical',
              boxSizing: 'border-box',
              borderRadius: 14,
              border: '2px solid rgba(148,163,184,0.24)',
              background: 'rgba(9,15,28,0.96)',
              color: '#f8fafc',
              padding: 12,
              fontSize: 13,
              fontFamily: 'inherit',
              outline: 'none',
            }}
          />

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button onClick={submit} style={buttonStyle(false, true, false)}>
              Save Message
            </button>
            <button
              onClick={() => {
                setShowForm(false);
                setDraft('');
              }}
              style={buttonStyle(false, false, false)}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {showComposer && (isRecording || isSavingAudio || audioError) ? (
        <div
          style={{
            display: 'grid',
            gap: 8,
            marginBottom: 18,
          }}
        >
          {isRecording ? (
            <div
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: '#93c5fd',
              }}
            >
              Recording audio message...
            </div>
          ) : null}

          {isSavingAudio ? (
            <div
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: '#93c5fd',
              }}
            >
              Saving audio message...
            </div>
          ) : null}

          {audioError ? (
            <div
              style={{
                borderRadius: 14,
                padding: '11px 13px',
                background: 'rgba(127,29,29,0.28)',
                border: '1px solid rgba(248,113,113,0.28)',
                color: '#fecaca',
                fontSize: 13,
                fontWeight: 700,
              }}
            >
              {audioError}
            </div>
          ) : null}
        </div>
      ) : null}

      <div style={{ display: 'grid', gap: compact ? 8 : 14 }}>
        {messages.length ? (
          messages.map((message, index) => (
            <div
              key={message.id}
              ref={focusedMessageId === message.id ? focusedMessageRef : null}
              onClick={() => onMarkMessageRead(message.id)}
              style={{
                borderRadius: compact ? 14 : 18,
                padding: compact ? 12 : 18,
                background: message.unread
                  ? index % 2 === 0
                    ? 'rgba(70,46,95,0.98)'
                    : 'rgba(88,58,117,0.98)'
                  : index % 2 === 0
                  ? 'rgba(63,47,89,0.96)'
                  : 'rgba(82,59,108,0.96)',
                border: focusedMessageId === message.id
                  ? '2px solid rgba(96,165,250,0.68)'
                  : message.unread
                  ? '2px solid rgba(96,165,250,0.34)'
                  : '2px solid rgba(148,163,184,0.3)',
                boxShadow:
                  focusedMessageId === message.id
                    ? '0 0 28px rgba(96,165,250,0.18)'
                    : message.unread
                    ? '0 10px 24px rgba(0,0,0,0.18)'
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
                <span
                  style={{
                    fontSize: compact ? 11 : 13,
                    fontWeight: 800,
                    borderRadius: 999,
                    padding: compact ? '5px 9px' : '7px 12px',
                    background:
                      message.type === 'audio'
                        ? 'rgba(37,99,235,0.22)'
                        : 'rgba(71,85,105,0.28)',
                    border:
                      message.type === 'audio'
                        ? '1px solid rgba(96,165,250,0.34)'
                        : '1px solid rgba(148,163,184,0.26)',
                    color: message.type === 'audio' ? '#dbeafe' : '#e2e8f0',
                  }}
                >
                  {message.type === 'audio' ? 'Audio' : 'Text'}
                </span>

                {message.unread ? (
                  <div
                    style={{
                      fontSize: compact ? 11 : 13,
                      fontWeight: 800,
                      color: '#93c5fd',
                      textShadow: '0 0 10px rgba(96,165,250,0.5)',
                    }}
                  >
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

              <div
                style={{
                  display: 'grid',
                  gap: 10,
                }}
              >
                {message.type === 'audio' && message.audioUrl ? (
                  <audio
                    controls
                    src={message.audioUrl}
                    style={{ width: '100%', maxWidth: compact ? 280 : 360 }}
                    onPlay={() => onMarkMessageRead(message.id)}
                  />
                ) : null}

                <div
                  style={{
                    fontSize: compact ? 10 : 12,
                    color: '#b8c7da',
                  }}
                >
                  {formatDateTime(message.createdAt)}
                </div>
              </div>
            </div>
          ))
        ) : (
          <div
            style={{
              borderRadius: compact ? 14 : 18,
              padding: compact ? 12 : 16,
              background: 'rgba(39,53,73,0.96)',
              border: '2px solid rgba(175,189,208,0.3)',
              color: '#b8c7da',
              fontSize: compact ? 11 : 13,
              fontWeight: 700,
            }}
          >
            {compact ? 'No unread messages.' : 'No messages yet.'}
          </div>
        )}
      </div>
    </section>
  );
}

function buttonStyle(
  compact: boolean,
  primary: boolean,
  disabled: boolean,
): React.CSSProperties {
  return {
    border: primary
      ? '1px solid rgba(96,165,250,0.4)'
      : '1px solid rgba(148,163,184,0.34)',
    background: primary
      ? 'rgba(37,99,235,0.38)'
      : 'rgba(51,65,85,0.92)',
    color: '#f8fafc',
    borderRadius: compact ? 12 : 14,
    padding: compact ? '10px 12px' : '12px 14px',
    fontSize: compact ? 12 : 13,
    fontWeight: 800,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
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
