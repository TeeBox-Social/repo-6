// Shared chat UI for both 1-to-1 Direct Messages and Group Chat threads.
// Transport is REST + light polling (no websocket infra) — good enough for
// an MVP chat experience and works everywhere including Expo Go/web.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { colors, makeThemedSheet, radius, shadow, spacing } from '@/src/theme';
import { ChatMessage } from '@/src/api';

const POLL_MS = 4000;
const PAGE_SIZE_HINT = 50; // matches the backend's default `limit`

type Props = {
  currentUserId: string;
  threadType: 'dm' | 'group';
  fetchMessages: (before?: string) => Promise<ChatMessage[]>;
  sendMessage: (text: string) => Promise<ChatMessage>;
  markRead?: () => void;
  showSenderNames?: boolean;
  emptyTitle: string;
  emptySub: string;
  placeholder?: string;
};

export function ChatThread({
  currentUserId,
  threadType,
  fetchMessages,
  sendMessage,
  markRead,
  showSenderNames = false,
  emptyTitle,
  emptySub,
  placeholder = 'Message…',
}: Props) {
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<ChatMessage[] | null>(null); // newest-first
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const seenIds = useRef<Set<string>>(new Set());
  const mountedRef = useRef(true);

  const initialLoad = useCallback(async () => {
    try {
      const asc = await fetchMessages();
      const newestFirst = [...asc].reverse();
      seenIds.current = new Set(newestFirst.map((m) => m.id));
      setMessages(newestFirst);
      setHasMore(asc.length >= PAGE_SIZE_HINT);
      markRead?.();
    } catch {
      setMessages((prev) => prev ?? []);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchMessages]);

  useEffect(() => {
    mountedRef.current = true;
    initialLoad();
    return () => {
      mountedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Poll for new messages while this thread is mounted.
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const asc = await fetchMessages();
        if (!mountedRef.current) return;
        const fresh = asc.filter((m) => !seenIds.current.has(m.id));
        if (fresh.length) {
          fresh.forEach((m) => seenIds.current.add(m.id));
          setMessages((prev) => [...fresh].reverse().concat(prev || []));
          markRead?.();
        }
      } catch {}
    }, POLL_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchMessages]);

  const loadMore = async () => {
    if (loadingMore || !hasMore || !messages || messages.length === 0) return;
    setLoadingMore(true);
    try {
      const oldest = messages[messages.length - 1];
      const asc = await fetchMessages(oldest.created_at);
      if (asc.length === 0) {
        setHasMore(false);
      } else {
        const newOnes = asc.filter((m) => !seenIds.current.has(m.id));
        newOnes.forEach((m) => seenIds.current.add(m.id));
        setMessages((prev) => (prev || []).concat([...newOnes].reverse()));
        if (asc.length < PAGE_SIZE_HINT) setHasMore(false);
      }
    } catch {
    } finally {
      setLoadingMore(false);
    }
  };

  const onSend = async () => {
    const t = text.trim();
    if (!t || sending) return;
    setSending(true);
    setText('');
    Haptics.selectionAsync().catch(() => {});
    const tempId = `temp-${Date.now()}`;
    const optimistic: ChatMessage = {
      id: tempId,
      thread_type: threadType,
      thread_id: '',
      sender_id: currentUserId,
      text: t,
      created_at: new Date().toISOString(),
    };
    seenIds.current.add(tempId);
    setMessages((prev) => [optimistic, ...(prev || [])]);
    try {
      const saved = await sendMessage(t);
      seenIds.current.delete(tempId);
      seenIds.current.add(saved.id);
      setMessages((prev) => (prev || []).map((m) => (m.id === tempId ? saved : m)));
    } catch {
      seenIds.current.delete(tempId);
      setMessages((prev) => (prev || []).filter((m) => m.id !== tempId));
      setText(t);
    } finally {
      setSending(false);
    }
  };

  if (messages === null) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.brandPrimary} size="large" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
      {messages.length === 0 ? (
        <View style={styles.emptyWrap}>
          <View style={styles.emptyIcon}>
            <Ionicons name="chatbubble-ellipses-outline" size={32} color={colors.muted} />
          </View>
          <Text style={styles.emptyTitle}>{emptyTitle}</Text>
          <Text style={styles.emptySub}>{emptySub}</Text>
        </View>
      ) : (
        <FlatList
          testID="chat-message-list"
          data={messages}
          inverted
          keyExtractor={(m) => m.id}
          contentContainerStyle={styles.listContent}
          onEndReached={loadMore}
          onEndReachedThreshold={0.4}
          keyboardShouldPersistTaps="handled"
          ListFooterComponent={
            loadingMore ? (
              <ActivityIndicator color={colors.brandPrimary} style={{ marginVertical: spacing.md }} />
            ) : null
          }
          renderItem={({ item }) => {
            const mine = item.sender_id === currentUserId;
            return (
              <View style={[styles.row, mine ? styles.rowMine : styles.rowTheirs]} testID={`chat-msg-${item.id}`}>
                {!mine && showSenderNames ? (
                  item.sender?.avatar ? (
                    <Image source={{ uri: item.sender.avatar }} style={styles.avatar} />
                  ) : (
                    <View style={styles.avatarFallback}>
                      <Text style={styles.avatarInitials}>
                        {(item.sender?.display_name || '?').slice(0, 1).toUpperCase()}
                      </Text>
                    </View>
                  )
                ) : null}
                <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
                  {!mine && showSenderNames ? (
                    <Text style={styles.senderName}>{item.sender?.display_name || 'Golfer'}</Text>
                  ) : null}
                  <Text style={[styles.bubbleText, mine && styles.bubbleTextMine]}>{item.text}</Text>
                  <Text style={[styles.bubbleTime, mine && styles.bubbleTimeMine]}>
                    {new Date(item.created_at).toLocaleTimeString(undefined, {
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </Text>
                </View>
              </View>
            );
          }}
        />
      )}
      <View style={[styles.inputBar, { paddingBottom: spacing.sm + insets.bottom }]}>
        <TextInput
          testID="chat-input"
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder={placeholder}
          placeholderTextColor={colors.muted}
          multiline
          maxLength={2000}
        />
        <Pressable
          testID="chat-send"
          onPress={onSend}
          disabled={!text.trim() || sending}
          style={[styles.sendBtn, (!text.trim() || sending) && styles.sendBtnDisabled]}
          hitSlop={6}
        >
          {sending ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="arrow-up" size={18} color="#fff" />}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = makeThemedSheet((c: any) =>
  StyleSheet.create({
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.surface },
    emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.sm },
    emptyIcon: {
      width: 64,
      height: 64,
      borderRadius: radius.pill,
      backgroundColor: c.surfaceTertiary,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 4,
    },
    emptyTitle: { fontSize: 16, fontWeight: '800', color: c.onSurface },
    emptySub: { fontSize: 13, color: c.muted, textAlign: 'center', lineHeight: 18, maxWidth: 280 },
    listContent: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, flexGrow: 1 },
    row: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginVertical: 3 },
    rowMine: { justifyContent: 'flex-end' },
    rowTheirs: { justifyContent: 'flex-start' },
    avatar: { width: 26, height: 26, borderRadius: radius.pill },
    avatarFallback: {
      width: 26,
      height: 26,
      borderRadius: radius.pill,
      backgroundColor: c.brandTertiary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarInitials: { fontSize: 11, fontWeight: '800', color: c.brandDeep },
    bubble: { maxWidth: '78%', paddingHorizontal: 14, paddingVertical: 9, borderRadius: radius.lg },
    bubbleMine: { backgroundColor: c.brandPrimary, borderBottomRightRadius: 4 },
    bubbleTheirs: { backgroundColor: c.surfaceSecondary, borderBottomLeftRadius: 4, ...shadow.soft },
    senderName: { fontSize: 11, fontWeight: '800', color: c.brandPrimary, marginBottom: 2 },
    bubbleText: { fontSize: 14.5, color: c.onSurface, lineHeight: 20 },
    bubbleTextMine: { color: '#fff' },
    bubbleTime: { fontSize: 10, color: c.muted, marginTop: 3, alignSelf: 'flex-end' },
    bubbleTimeMine: { color: 'rgba(255,255,255,0.75)' },
    inputBar: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: spacing.sm,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.sm,
      borderTopWidth: 1,
      borderTopColor: c.border,
      backgroundColor: c.surface,
    },
    input: {
      flex: 1,
      maxHeight: 100,
      minHeight: 40,
      paddingHorizontal: spacing.md,
      paddingVertical: 10,
      borderRadius: radius.lg,
      backgroundColor: c.surfaceTertiary,
      color: c.onSurface,
      fontSize: 14.5,
    },
    sendBtn: {
      width: 40,
      height: 40,
      borderRadius: radius.pill,
      backgroundColor: c.brandPrimary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sendBtnDisabled: { opacity: 0.5 },
  }),
);
