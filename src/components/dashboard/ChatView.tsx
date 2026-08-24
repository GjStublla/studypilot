import { memo, useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowUp, BookOpen, Chrome, Clock, MessageCircle, Mic, MicOff, MoreHorizontal,
  Paperclip, Plus, ScrollText, ShieldCheck, Sparkles,
} from 'lucide-react';
import type { DashboardChat, GroundingCitation } from '../../lib/studypilot-types';
import type { ChatViewMessage } from '../../lib/dashboard-chat-state';
import type { Rubric, Session } from '../../lib/dashboardApi';
import type { AiUsage } from '../../lib/studypilot-api';
import { EmptyState, StudyPilotMark } from './DashboardPrimitives';
import { FileSearchStatusBadge, getRubricIndexStatus } from './RubricStatus';
import type { DashboardStudent } from './dashboard-types';

type Message = ChatViewMessage;

const QUICK_PROMPTS = [
  'What should I revise first?',
  'Explain this rubric',
  'Turn my feedback into a checklist',
  'Ask me Socratic questions',
] as const;

const NEW_CHAT_DRAFT_KEY = '__new-chat__';

export const ChatView = memo(function ChatView({
  student,
  activeRubric,
  rubricRemoved = false,
  session,
  chats,
  rubricsById,
  activeChatId,
  messages,
  historyLoading,
  activeChatBusy,
  draftCreating,
  aiUsage,
  onOpenSession,
  onSelectChat,
  onStartNewChat,
  onRenameChat,
  onDeleteChat,
  onSendMessage,
  onRetryIndex,
}: {
  student: DashboardStudent;
  activeRubric: Rubric | undefined;
  /** Locked chat whose rubric was deleted — do not show the global active rubric. */
  rubricRemoved?: boolean;
  session: Session | undefined;
  chats: DashboardChat[];
  rubricsById: ReadonlyMap<string, Rubric>;
  activeChatId: string | null;
  messages: Message[];
  historyLoading: boolean;
  activeChatBusy: boolean;
  draftCreating: boolean;
  aiUsage: AiUsage | null;
  onOpenSession: () => void;
  onSelectChat: (chatId: string) => void;
  onStartNewChat: () => void;
  onRenameChat: (chatId: string, title: string) => void;
  onDeleteChat: (chatId: string) => void;
  onSendMessage: (text: string, sessionId?: string | null) => boolean;
  onRetryIndex?: (rubricId: string) => void;
}) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [micOn, setMicOn] = useState(false);
  const draftKey = activeChatId ?? NEW_CHAT_DRAFT_KEY;
  const input = drafts[draftKey] ?? '';
  const setInput = useCallback((value: string) => {
    setDrafts((current) => {
      if ((current[draftKey] ?? '') === value) return current;
      if (value) return { ...current, [draftKey]: value };

      const next = { ...current };
      delete next[draftKey];
      return next;
    });
  }, [draftKey]);
  const limitReached = aiUsage !== null && aiUsage.used >= aiUsage.limit;
  const remainingRequests = aiUsage === null ? null : Math.max(aiUsage.limit - aiUsage.used, 0);
  const composerDisabled = limitReached || activeChatBusy;
  const messagesRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollFrameRef = useRef<number | null>(null);
  const resizeFrameRef = useRef<number | null>(null);

  useEffect(() => {
    if (scrollFrameRef.current !== null) {
      cancelAnimationFrame(scrollFrameRef.current);
    }

    scrollFrameRef.current = requestAnimationFrame(() => {
      if (messagesRef.current) {
        messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
      }
      scrollFrameRef.current = null;
    });

    return () => {
      if (scrollFrameRef.current !== null) {
        cancelAnimationFrame(scrollFrameRef.current);
        scrollFrameRef.current = null;
      }
    };
  }, [messages.length]);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;

    if (resizeFrameRef.current !== null) {
      cancelAnimationFrame(resizeFrameRef.current);
    }

    resizeFrameRef.current = requestAnimationFrame(() => {
      ta.style.height = 'auto';
      ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
      resizeFrameRef.current = null;
    });

    return () => {
      if (resizeFrameRef.current !== null) {
        cancelAnimationFrame(resizeFrameRef.current);
        resizeFrameRef.current = null;
      }
    };
  }, [input]);

  const send = useCallback((text?: string) => {
    if (limitReached) return;
    const value = (text ?? input).trim();
    if (!value) return;
    if (onSendMessage(value, session?.id ?? null)) setInput('');
  }, [input, limitReached, onSendMessage, session?.id, setInput]);

  const toggleMic = useCallback(() => setMicOn((v) => !v), []);
  const activeChat = chats.find((chat) => chat.id === activeChatId);
  const chatOrigin = activeChat?.origin_surface ?? 'dashboard';
  const originLabel = chatOrigin === 'extension'
    ? 'Started in Chrome extension'
    : chatOrigin === 'legacy'
      ? 'Imported legacy chat'
      : 'Started in dashboard';
  const composerBusy = activeChatBusy || draftCreating;
  // Parent resolves chat rubric; locked-null must never surface the global active rubric.
  const lockedNull = rubricRemoved
    || Boolean(activeChat?.rubric_context_locked && activeChat.rubric_id == null);
  const effectiveRubric = lockedNull ? undefined : activeRubric;
  const indexStatus = getRubricIndexStatus(effectiveRubric);

  return (
    <div className="ds-view ds-view-chat">
      <div className="ds-chat-layout">
        <aside className="ds-chat-rail" aria-label="Chats">
          <button type="button" className="ds-chat-new" onClick={onStartNewChat}>
            <Plus size={14} strokeWidth={1.8} />
            <span>New chat</span>
          </button>
          <div className="ds-chat-list">
            {activeChatId === null && (
              <div className="ds-chat-row is-active is-draft">
                <Plus size={13} strokeWidth={1.8} />
                <span>New chat</span>
              </div>
            )}
            {chats.map((chat) => (
              <ChatListRow
                key={chat.id}
                chat={chat}
                active={chat.id === activeChatId}
                rubricTitle={chat.rubric_id ? rubricsById.get(chat.rubric_id)?.title : undefined}
                onSelect={onSelectChat}
                onRename={onRenameChat}
                onDelete={onDeleteChat}
              />
            ))}
          </div>
        </aside>

        <section className="ds-chat-main">
          <div className="ds-context-strip">
            {session && (
              <span className="ds-context-chip ds-chip-accent" onClick={onOpenSession} role="button" tabIndex={0}>
                <ScrollText size={11} strokeWidth={1.8} />
                <span>{session.title}</span>
              </span>
            )}
            {lockedNull ? (
              <span className="ds-context-chip ds-chip-muted" data-testid="chat-rubric-chip">
                <BookOpen size={11} strokeWidth={1.8} />
                <span>Rubric removed</span>
                <span className="ds-chip-lock" title="Rubric context locked">locked</span>
              </span>
            ) : effectiveRubric ? (
              <span className="ds-context-chip" data-testid="chat-rubric-chip">
                <BookOpen size={11} strokeWidth={1.8} />
                <span>{effectiveRubric.title.replace(' Rubric', '')}</span>
                {activeChat?.rubric_context_locked ? (
                  <span className="ds-chip-lock" title="Rubric context locked">locked</span>
                ) : null}
              </span>
            ) : null}
            {effectiveRubric && indexStatus !== 'not_indexed' && (
              <FileSearchStatusBadge
                status={indexStatus}
                error={effectiveRubric.fileSearchError ?? effectiveRubric.file_search_error}
                onRetry={
                  indexStatus === 'failed' && effectiveRubric.id && onRetryIndex
                    ? () => onRetryIndex(effectiveRubric.id)
                    : undefined
                }
              />
            )}
            <span className="ds-context-chip">
              {chatOrigin === 'extension'
                ? <Chrome size={11} strokeWidth={1.8} />
                : <MessageCircle size={11} strokeWidth={1.8} />}
              <span>{originLabel}</span>
            </span>
            {session && (
              <span className="ds-context-chip ds-chip-muted">
                <Clock size={11} strokeWidth={1.8} />
                <span>{session.duration} · {session.mode}</span>
              </span>
            )}
          </div>

          <div className="ds-messages" ref={messagesRef}>
            {historyLoading && messages.length === 0 ? (
              <div className="ds-state ds-state-loading ds-state-inline">
                <span className="ds-state-spinner" aria-hidden="true" />
                <p>Loading conversation…</p>
              </div>
            ) : messages.length === 0 ? (
              <EmptyState
                title="Start the conversation."
                body="Ask about your rubric, feedback, or what to revise next."
              />
            ) : (
              messages.map((m) => (
                <MessageBubble
                  key={m.id}
                  message={m}
                  student={student}
                  thinking={m.role === 'ai' && m.status === 'thinking'}
                />
              ))
            )}
          </div>

          <div className="ds-composer-wrap">
            <div className="ds-quick-prompts" role="group" aria-label="Quick prompts">
              {QUICK_PROMPTS.map((p) => (
                <button
                  key={p}
                  type="button"
                  className="ds-quick-prompt"
                  onClick={() => send(p)}
                  disabled={composerDisabled}
                >
                  <Sparkles size={11} strokeWidth={1.7} />
                  <span>{p}</span>
                </button>
              ))}
            </div>

            <form
              className="ds-composer"
              role="form"
              aria-busy={composerBusy}
              onSubmit={(e) => {
                e.preventDefault();
                send();
              }}
            >
              <button type="button" className="ds-icon-btn" aria-label="Attach">
                <Paperclip size={14} strokeWidth={1.6} />
              </button>
              <textarea
                ref={textareaRef}
                placeholder="Ask about your rubric, feedback, or next revision…"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                rows={1}
              />
              <button
                type="button"
                className={`ds-icon-btn ${micOn ? 'is-on' : ''}`}
                aria-label={micOn ? 'Stop listening' : 'Start voice input'}
                onClick={toggleMic}
              >
                {micOn ? <Mic size={14} strokeWidth={1.7} /> : <MicOff size={14} strokeWidth={1.7} />}
              </button>
              <button
                type="submit"
                className="ds-send"
                disabled={composerDisabled || !input.trim()}
                aria-label="Send"
              >
                <ArrowUp size={14} strokeWidth={2} />
              </button>
            </form>

            <p className={`ds-composer-hint ${limitReached ? 'is-limit' : ''}`}>
              {limitReached ? (
                <>Daily AI limit reached ({aiUsage.used} of {aiUsage.limit}). Resets at midnight UTC.</>
              ) : remainingRequests !== null && remainingRequests <= 5 ? (
                <>{remainingRequests} AI requests left today.</>
              ) : (
                <>
                  <ShieldCheck size={11} strokeWidth={1.7} /> StudyPilot will not write your work — it
                  helps you revise it.
                </>
              )}
            </p>
          </div>
        </section>
      </div>
    </div>
  );
});
const ChatListRow = memo(function ChatListRow({
  chat,
  active,
  rubricTitle,
  onSelect,
  onRename,
  onDelete,
}: {
  chat: DashboardChat;
  active: boolean;
  rubricTitle?: string;
  onSelect: (chatId: string) => void;
  onRename: (chatId: string, title: string) => void;
  onDelete: (chatId: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(chat.title);

  useEffect(() => {
    if (!editing) setTitle(chat.title);
  }, [chat.title, editing]);

  const commitRename = useCallback(() => {
    const nextTitle = title.trim() || chat.title;
    setEditing(false);
    if (nextTitle !== chat.title) onRename(chat.id, nextTitle);
  }, [chat.id, chat.title, onRename, title]);

  const cancelRename = useCallback(() => {
    setTitle(chat.title);
    setEditing(false);
  }, [chat.title]);

  return (
    <div
      className={`ds-chat-row ${active ? 'is-active' : ''}`}
      role="button"
      tabIndex={0}
      onClick={() => onSelect(chat.id)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect(chat.id);
        }
      }}
    >
      {chat.origin_surface === 'extension' ? (
        <Chrome
          className="ds-chat-session-glyph"
          size={13}
          strokeWidth={1.8}
          aria-label="Started in Chrome extension"
        />
      ) : chat.session_id ? (
        <ScrollText className="ds-chat-session-glyph" size={13} strokeWidth={1.8} />
      ) : chat.rubric_id ? (
        <BookOpen className="ds-chat-session-glyph" size={13} strokeWidth={1.8} aria-label="Rubric chat" />
      ) : null}
      {editing ? (
        <input
          className="ds-chat-rename-input"
          value={title}
          autoFocus
          aria-label="Chat title"
          onChange={(event) => setTitle(event.target.value)}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === 'Enter') {
              event.preventDefault();
              commitRename();
            } else if (event.key === 'Escape') {
              event.preventDefault();
              cancelRename();
            }
          }}
          onBlur={commitRename}
        />
      ) : (
        <span className="ds-chat-title">
          {chat.title}
          {chat.rubric_id ? (
            <span className="ds-chat-rubric-badge" title={rubricTitle ?? 'Rubric chat'}>
              Rubric
            </span>
          ) : null}
        </span>
      )}
      {!editing && (
        <span className="ds-chat-actions">
          <button
            type="button"
            className="ds-chat-action"
            aria-label={`Rename ${chat.title}`}
            onClick={(event) => {
              event.stopPropagation();
              setEditing(true);
            }}
            onKeyDown={(event) => event.stopPropagation()}
          >
            <MoreHorizontal size={14} strokeWidth={1.8} />
          </button>
          <button
            type="button"
            className="ds-chat-action"
            aria-label={`Delete ${chat.title}`}
            onClick={(event) => {
              event.stopPropagation();
              if (window.confirm(`Delete “${chat.title}”? This cannot be undone.`)) onDelete(chat.id);
            }}
            onKeyDown={(event) => event.stopPropagation()}
          >
            <span aria-hidden="true">×</span>
          </button>
        </span>
      )}
    </div>
  );
});

const MessageBubble = memo(function MessageBubble({
  message,
  student,
  thinking = false,
}: {
  message: Message;
  student: DashboardStudent;
  thinking?: boolean;
}) {
  const citations = message.citations ?? [];

  return (
    <article className={`ds-msg ds-msg-${message.role}`}>
      <div className="ds-msg-avatar" aria-hidden="true">
        {message.role === 'ai' ? <StudyPilotMark size={14} /> : <span>{student.initials}</span>}
      </div>
      <div className="ds-msg-body">
        <div className="ds-msg-meta">
          <b>{message.role === 'ai' ? 'StudyPilot' : student.name}</b>
          <time>{message.time}</time>
          {message.usedFileSearch ? (
            <span className="ds-msg-rag-tag">Grounded</span>
          ) : null}
        </div>
        {thinking ? (
          <div className="ds-typing" role="status" aria-label="StudyPilot is thinking">
            <span className="ds-typing-dot" />
            <span className="ds-typing-dot" />
            <span className="ds-typing-dot" />
          </div>
        ) : (
          message.lines.map((line, i) => (
            <p key={i}>{line || ' '}</p>
          ))
        )}
        {!thinking && citations.length > 0 ? (
          <ul className="ds-citations" aria-label="Sources">
            {citations.map((citation, index) => (
              <CitationItem key={`${citation.title}-${index}`} citation={citation} index={index} />
            ))}
          </ul>
        ) : null}
      </div>
    </article>
  );
});

function CitationItem({ citation, index }: { citation: GroundingCitation; index: number }) {
  const label = citation.title || `Source ${index + 1}`;
  return (
    <li className="ds-citation">
      <span className="ds-citation-index">{index + 1}</span>
      {citation.uri ? (
        <a href={citation.uri} target="_blank" rel="noreferrer" className="ds-citation-link">
          {label}
        </a>
      ) : (
        <span className="ds-citation-title">{label}</span>
      )}
      {citation.snippet ? <span className="ds-citation-snippet">{citation.snippet}</span> : null}
    </li>
  );
}
