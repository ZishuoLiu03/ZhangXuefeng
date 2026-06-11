import "server-only";

import type { ArtifactKind } from "@/components/chat/artifact";
import type { VisibilityType } from "@/components/chat/visibility-selector";
import { ChatbotError } from "../errors";
import { generateUUID } from "../utils";
import type {
  Chat,
  DBMessage,
  Document,
  Stream,
  Suggestion,
  User,
  Vote,
} from "./schema";
import { generateHashedPassword } from "./utils";

// In-memory storage stores. They persist in-memory as long as the server is running.
const usersStore: User[] = [];
const chatsStore: Chat[] = [];
const messagesStore: DBMessage[] = [];
const votesStore: Vote[] = [];
const documentsStore: Document[] = [];
const suggestionsStore: Suggestion[] = [];
const streamsStore: Stream[] = [];

export function getUser(email: string): User[] {
  try {
    return usersStore.filter((u) => u.email === email);
  } catch {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get user by email"
    );
  }
}

export function createUser(email: string, password: string) {
  const hashedPassword = generateHashedPassword(password);

  try {
    const newUser: User = {
      id: generateUUID(),
      email,
      password: hashedPassword,
      name: null,
      emailVerified: false,
      image: null,
      isAnonymous: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    usersStore.push(newUser);
    return [newUser];
  } catch {
    throw new ChatbotError("bad_request:database", "Failed to create user");
  }
}

export function createGuestUser() {
  const email = `guest-${Date.now()}`;
  const password = generateHashedPassword(generateUUID());

  try {
    const guest: User = {
      id: generateUUID(),
      email,
      password,
      name: null,
      emailVerified: false,
      image: null,
      isAnonymous: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    usersStore.push(guest);
    return [
      {
        id: guest.id,
        email: guest.email,
      },
    ];
  } catch {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to create guest user"
    );
  }
}

export function saveChat({
  id,
  userId,
  title,
  visibility,
}: {
  id: string;
  userId: string;
  title: string;
  visibility: VisibilityType;
}) {
  try {
    const newChat: Chat = {
      id,
      createdAt: new Date(),
      userId,
      title,
      visibility,
    };
    chatsStore.push(newChat);
    return [newChat];
  } catch {
    throw new ChatbotError("bad_request:database", "Failed to save chat");
  }
}

export function deleteChatById({ id }: { id: string }) {
  try {
    // Delete related votes
    const remainingVotes = votesStore.filter((v) => v.chatId !== id);
    votesStore.length = 0;
    votesStore.push(...remainingVotes);

    // Delete related messages
    const remainingMessages = messagesStore.filter((m) => m.chatId !== id);
    messagesStore.length = 0;
    messagesStore.push(...remainingMessages);

    // Delete related streams
    const remainingStreams = streamsStore.filter((s) => s.chatId !== id);
    streamsStore.length = 0;
    streamsStore.push(...remainingStreams);

    const chatIndex = chatsStore.findIndex((c) => c.id === id);
    if (chatIndex !== -1) {
      const [deletedChat] = chatsStore.splice(chatIndex, 1);
      return deletedChat;
    }
    return null;
  } catch {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to delete chat by id"
    );
  }
}

export function deleteAllChatsByUserId({ userId }: { userId: string }) {
  try {
    const userChats = chatsStore.filter((c) => c.userId === userId);

    if (userChats.length === 0) {
      return { deletedCount: 0 };
    }

    const chatIds = userChats.map((c) => c.id);

    // Delete related votes
    const remainingVotes = votesStore.filter(
      (v) => !chatIds.includes(v.chatId)
    );
    votesStore.length = 0;
    votesStore.push(...remainingVotes);

    // Delete related messages
    const remainingMessages = messagesStore.filter(
      (m) => !chatIds.includes(m.chatId)
    );
    messagesStore.length = 0;
    messagesStore.push(...remainingMessages);

    // Delete related streams
    const remainingStreams = streamsStore.filter(
      (s) => !chatIds.includes(s.chatId)
    );
    streamsStore.length = 0;
    streamsStore.push(...remainingStreams);

    // Delete chats
    const remainingChats = chatsStore.filter((c) => c.userId !== userId);
    chatsStore.length = 0;
    chatsStore.push(...remainingChats);

    return { deletedCount: userChats.length };
  } catch {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to delete all chats by user id"
    );
  }
}

export function getChatsByUserId({
  id,
  limit,
  startingAfter,
  endingBefore,
}: {
  id: string;
  limit: number;
  startingAfter: string | null;
  endingBefore: string | null;
}) {
  try {
    const extendedLimit = limit + 1;
    const userChats = chatsStore.filter((c) => c.userId === id);

    // Order by createdAt desc
    userChats.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    let filteredChats: Chat[] = [];

    if (startingAfter) {
      const selectedChat = chatsStore.find((c) => c.id === startingAfter);
      if (!selectedChat) {
        throw new ChatbotError(
          "not_found:database",
          `Chat with id ${startingAfter} not found`
        );
      }
      filteredChats = userChats.filter(
        (c) => c.createdAt.getTime() > selectedChat.createdAt.getTime()
      );
    } else if (endingBefore) {
      const selectedChat = chatsStore.find((c) => c.id === endingBefore);
      if (!selectedChat) {
        throw new ChatbotError(
          "not_found:database",
          `Chat with id ${endingBefore} not found`
        );
      }
      filteredChats = userChats.filter(
        (c) => c.createdAt.getTime() < selectedChat.createdAt.getTime()
      );
    } else {
      filteredChats = userChats;
    }

    const slicedChats = filteredChats.slice(0, extendedLimit);
    const hasMore = slicedChats.length > limit;

    return {
      chats: hasMore ? slicedChats.slice(0, limit) : slicedChats,
      hasMore,
    };
  } catch (error) {
    if (error instanceof ChatbotError) {
      throw error;
    }
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get chats by user id"
    );
  }
}

export function getChatById({ id }: { id: string }) {
  try {
    const selectedChat = chatsStore.find((c) => c.id === id);
    if (!selectedChat) {
      return null;
    }
    return selectedChat;
  } catch {
    throw new ChatbotError("bad_request:database", "Failed to get chat by id");
  }
}

export function saveMessages({ messages }: { messages: DBMessage[] }) {
  try {
    messagesStore.push(...messages);
    return messages;
  } catch {
    throw new ChatbotError("bad_request:database", "Failed to save messages");
  }
}

export function updateMessage({
  id,
  parts,
}: {
  id: string;
  parts: DBMessage["parts"];
}) {
  try {
    const existingMsgIdx = messagesStore.findIndex((m) => m.id === id);
    if (existingMsgIdx === -1) {
      throw new ChatbotError("not_found:database", "Message not found");
    }
    messagesStore[existingMsgIdx] = {
      ...messagesStore[existingMsgIdx],
      parts,
    };
    return [messagesStore[existingMsgIdx]];
  } catch (error) {
    if (error instanceof ChatbotError) {
      throw error;
    }
    throw new ChatbotError("bad_request:database", "Failed to update message");
  }
}

export function getMessagesByChatId({ id }: { id: string }) {
  try {
    const msgs = messagesStore.filter((m) => m.chatId === id);
    // Sort by createdAt asc
    msgs.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    return msgs;
  } catch {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get messages by chat id"
    );
  }
}

export function voteMessage({
  chatId,
  messageId,
  type,
}: {
  chatId: string;
  messageId: string;
  type: "up" | "down";
}) {
  try {
    const existingVote = votesStore.find(
      (v) => v.chatId === chatId && v.messageId === messageId
    );

    if (existingVote) {
      existingVote.isUpvoted = type === "up";
      return [existingVote];
    }

    const newVote: Vote = {
      chatId,
      messageId,
      isUpvoted: type === "up",
    };
    votesStore.push(newVote);
    return [newVote];
  } catch {
    throw new ChatbotError("bad_request:database", "Failed to vote message");
  }
}

export function getVotesByChatId({ id }: { id: string }) {
  try {
    return votesStore.filter((v) => v.chatId === id);
  } catch {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get votes by chat id"
    );
  }
}

export function saveDocument({
  id,
  title,
  kind,
  content,
  userId,
}: {
  id: string;
  title: string;
  kind: ArtifactKind;
  content: string;
  userId: string;
}) {
  try {
    const newDoc: Document = {
      id,
      createdAt: new Date(),
      title,
      content,
      kind,
      userId,
    };
    documentsStore.push(newDoc);
    return [newDoc];
  } catch {
    throw new ChatbotError("bad_request:database", "Failed to save document");
  }
}

export function updateDocumentContent({
  id,
  content,
}: {
  id: string;
  content: string;
}) {
  try {
    const docs = documentsStore.filter((d) => d.id === id);
    // Sort desc to find the latest
    docs.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    const latest = docs[0];
    if (!latest) {
      throw new ChatbotError("not_found:database", "Document not found");
    }

    latest.content = content;
    return [latest];
  } catch (error) {
    if (error instanceof ChatbotError) {
      throw error;
    }
    throw new ChatbotError(
      "bad_request:database",
      "Failed to update document content"
    );
  }
}

export function getDocumentsById({ id }: { id: string }) {
  try {
    const docs = documentsStore.filter((d) => d.id === id);
    // Sort asc by createdAt
    docs.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    return docs;
  } catch {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get documents by id"
    );
  }
}

export function getDocumentById({ id }: { id: string }) {
  try {
    const docs = documentsStore.filter((d) => d.id === id);
    // Sort desc by createdAt
    docs.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return docs[0] || null;
  } catch {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get document by id"
    );
  }
}

export function deleteDocumentsByIdAfterTimestamp({
  id,
  timestamp,
}: {
  id: string;
  timestamp: Date;
}) {
  try {
    // Delete suggestions
    const remainingSuggestions = suggestionsStore.filter(
      (s) =>
        !(
          s.documentId === id &&
          s.documentCreatedAt.getTime() > timestamp.getTime()
        )
    );
    suggestionsStore.length = 0;
    suggestionsStore.push(...remainingSuggestions);

    // Filter documents to delete
    const docsToDelete = documentsStore.filter(
      (d) => d.id === id && d.createdAt.getTime() > timestamp.getTime()
    );

    // Keep documents that should not be deleted
    const remainingDocs = documentsStore.filter(
      (d) => !(d.id === id && d.createdAt.getTime() > timestamp.getTime())
    );
    documentsStore.length = 0;
    documentsStore.push(...remainingDocs);

    return docsToDelete;
  } catch {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to delete documents by id after timestamp"
    );
  }
}

export function saveSuggestions({
  suggestions,
}: {
  suggestions: Suggestion[];
}) {
  try {
    suggestionsStore.push(...suggestions);
    return suggestions;
  } catch {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to save suggestions"
    );
  }
}

export function getSuggestionsByDocumentId({
  documentId,
}: {
  documentId: string;
}) {
  try {
    return suggestionsStore.filter((s) => s.documentId === documentId);
  } catch {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get suggestions by document id"
    );
  }
}

export function getMessageById({ id }: { id: string }) {
  try {
    return messagesStore.filter((m) => m.id === id);
  } catch {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get message by id"
    );
  }
}

export function deleteMessagesByChatIdAfterTimestamp({
  chatId,
  timestamp,
}: {
  chatId: string;
  timestamp: Date;
}) {
  try {
    const messagesToDelete = messagesStore.filter(
      (m) => m.chatId === chatId && m.createdAt.getTime() >= timestamp.getTime()
    );

    const messageIds = messagesToDelete.map((m) => m.id);

    if (messageIds.length > 0) {
      // Remove related votes
      const remainingVotes = votesStore.filter(
        (v) => !(v.chatId === chatId && messageIds.includes(v.messageId))
      );
      votesStore.length = 0;
      votesStore.push(...remainingVotes);

      // Remove messages
      const remainingMessages = messagesStore.filter(
        (m) => !(m.chatId === chatId && messageIds.includes(m.id))
      );
      messagesStore.length = 0;
      messagesStore.push(...remainingMessages);

      return messagesToDelete;
    }
  } catch {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to delete messages by chat id after timestamp"
    );
  }
}

export function updateChatVisibilityById({
  chatId,
  visibility,
}: {
  chatId: string;
  visibility: "private" | "public";
}) {
  try {
    const selectedChat = chatsStore.find((c) => c.id === chatId);
    if (!selectedChat) {
      throw new ChatbotError("not_found:database", "Chat not found");
    }
    selectedChat.visibility = visibility;
    return [selectedChat];
  } catch (error) {
    if (error instanceof ChatbotError) {
      throw error;
    }
    throw new ChatbotError(
      "bad_request:database",
      "Failed to update chat visibility by id"
    );
  }
}

export function updateChatTitleById({
  chatId,
  title,
}: {
  chatId: string;
  title: string;
}) {
  try {
    const selectedChat = chatsStore.find((c) => c.id === chatId);
    if (selectedChat) {
      selectedChat.title = title;
      return [selectedChat];
    }
  } catch {
    return;
  }
}

export function getMessageCountByUserId({
  id,
  differenceInHours,
}: {
  id: string;
  differenceInHours: number;
}) {
  try {
    const cutoffTime = new Date(
      Date.now() - differenceInHours * 60 * 60 * 1000
    );

    const userChatIds = chatsStore
      .filter((c) => c.userId === id)
      .map((c) => c.id);

    const count = messagesStore.filter(
      (m) =>
        userChatIds.includes(m.chatId) &&
        m.createdAt.getTime() >= cutoffTime.getTime() &&
        m.role === "user"
    ).length;

    return count;
  } catch {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get message count by user id"
    );
  }
}

export function createStreamId({
  streamId,
  chatId,
}: {
  streamId: string;
  chatId: string;
}) {
  try {
    const newStream: Stream = {
      id: streamId,
      chatId,
      createdAt: new Date(),
    };
    streamsStore.push(newStream);
  } catch {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to create stream id"
    );
  }
}

export function getStreamIdsByChatId({ chatId }: { chatId: string }) {
  try {
    const streams = streamsStore.filter((s) => s.chatId === chatId);
    streams.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    return streams.map(({ id }) => id);
  } catch {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get stream ids by chat id"
    );
  }
}
