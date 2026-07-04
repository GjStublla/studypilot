// Supabase Realtime hooks for dashboard synchronization.
//
// The dashboard updates automatically when:
// - The Chrome extension imports a new session
// - A document's indexing status changes
// - Action items are created, updated, or deleted
// - Rubric active state changes

import { useEffect, useRef } from 'react';
import { supabase } from './supabaseClient';
import type { Session, KnowledgeDocument } from './studypilot-types';

/**
 * Combined hook for all StudyPilot realtime subscriptions.
 *
 * Callbacks are kept in a ref so the Supabase channel is only
 * created/destroyed when userId changes — not on every render.
 * This prevents an infinite re-subscription loop that would occur
 * if an inline object literal were included in the dependency array.
 */
export function useStudyPilotRealtime(
  userId: string | null,
  callbacks: {
    onNewSession?: (session: Session) => void;
    onDocumentUpdated?: (document: KnowledgeDocument) => void;
    onActionItemChanged?: (payload: any) => void;
    onRubricChanged?: (payload: any) => void;
  },
) {
  // Always call the latest version of the callbacks without re-subscribing.
  const callbacksRef = useRef(callbacks);
  useEffect(() => {
    callbacksRef.current = callbacks;
  });

  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`studypilot_realtime_${userId}`)
      // New session imported from the Chrome extension
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'sessions',
          filter: `user_id=eq.${userId}`,
        },
        async (payload) => {
          if (!callbacksRef.current.onNewSession) return;
          // Fetch the full row so we have all fields
          const { data, error } = await supabase
            .from('sessions')
            .select('*')
            .eq('id', payload.new.id)
            .single();
          if (!error && data) {
            callbacksRef.current.onNewSession(data as Session);
          }
        },
      )
      // Knowledge document indexing status changed
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'knowledge_documents',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          callbacksRef.current.onDocumentUpdated?.(payload.new as KnowledgeDocument);
        },
      )
      // Action item created / updated / deleted
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'action_items',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          callbacksRef.current.onActionItemChanged?.(payload);
        },
      )
      // Rubric created / updated / deleted
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'rubrics',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          callbacksRef.current.onRubricChanged?.(payload);
        },
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR') {
          console.error('[Realtime] Combined subscription error');
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]); // only re-subscribe when the user changes
}
