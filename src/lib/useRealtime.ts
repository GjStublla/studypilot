// Supabase Realtime subscriptions are invalidation hints. Consumers refetch
// canonical rows instead of treating payloads as durable local state.

import { useEffect, useRef } from 'react';
import { injectStoredToken, supabase } from './supabaseClient';
import type { KnowledgeDocument, Session } from './studypilot-types';

export interface StudyPilotRealtimeCallbacks {
  onNewSession?: (session: Session) => void;
  onSessionChanged?: (payload: any) => void;
  onSessionMessageChanged?: (payload: any) => void;
  onDocumentUpdated?: (document: KnowledgeDocument) => void;
  onActionItemChanged?: (payload: any) => void;
  onRubricChanged?: (payload: any) => void;
  onDashboardChatChanged?: (payload: any) => void;
  onDashboardChatMessageChanged?: (payload: any) => void;
  onSubscribed?: () => void;
}

export function useStudyPilotRealtime(
  userId: string | null,
  callbacks: StudyPilotRealtimeCallbacks,
) {
  const callbacksRef = useRef(callbacks);
  useEffect(() => {
    callbacksRef.current = callbacks;
  });

  useEffect(() => {
    if (!userId) return;

    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    void (async () => {
      await injectStoredToken();
      const { data: { session } } = await supabase.auth.getSession();
      if (cancelled) return;
      if (!session?.access_token) {
        console.error('[Realtime] Cannot subscribe without an authenticated session');
        return;
      }

      await supabase.realtime.setAuth(session.access_token);
      if (cancelled) return;

      channel = supabase
        .channel(`studypilot_realtime_${userId}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'sessions', filter: `user_id=eq.${userId}` },
          async (payload) => {
            if (!callbacksRef.current.onNewSession) return;
            const { data, error } = await supabase
              .from('sessions')
              .select('*')
              .eq('id', payload.new.id)
              .single();
            if (!error && data) callbacksRef.current.onNewSession(data as Session);
          },
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'sessions', filter: `user_id=eq.${userId}` },
          (payload) => callbacksRef.current.onSessionChanged?.(payload),
        )
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'session_messages' },
          (payload) => callbacksRef.current.onSessionMessageChanged?.(payload),
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'knowledge_documents', filter: `user_id=eq.${userId}` },
          (payload) => callbacksRef.current.onDocumentUpdated?.(payload.new as KnowledgeDocument),
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'action_items', filter: `user_id=eq.${userId}` },
          (payload) => callbacksRef.current.onActionItemChanged?.(payload),
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'rubrics', filter: `user_id=eq.${userId}` },
          (payload) => callbacksRef.current.onRubricChanged?.(payload),
        )
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'dashboard_chats', filter: `user_id=eq.${userId}` },
          (payload) => callbacksRef.current.onDashboardChatChanged?.(payload),
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'dashboard_chats', filter: `user_id=eq.${userId}` },
          (payload) => callbacksRef.current.onDashboardChatChanged?.(payload),
        )
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'dashboard_chat_messages', filter: `user_id=eq.${userId}` },
          (payload) => callbacksRef.current.onDashboardChatMessageChanged?.(payload),
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') callbacksRef.current.onSubscribed?.();
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            console.error(`[Realtime] Combined subscription ${status.toLowerCase()}`);
          }
        });
    })().catch((error) => {
      if (!cancelled) console.error('[Realtime] Subscription setup failed', error);
    });

    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [userId]);
}
