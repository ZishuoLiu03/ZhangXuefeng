import "server-only";

import type { ArtifactKind } from "@/components/chat/artifact";
import type { VisibilityType } from "@/components/chat/visibility-selector";
import { ChatbotError } from "../errors";
import { generateUUID } from "../utils";
import {
  type Chat,
  type DBMessage,
  type Document,
  type Suggestion,
  type Stream,
  type User,
  type Vote,
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

export async function getUser(email: string): Promise<User[]> {
  try {
    return usersStore.filter((u) => u.email === email);
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get user by email"
    );
  }
}

export async function createUser(email: string, password: string) {
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
  } catch (_error) {
    throw new ChatbotError("bad_request:database", "Failed to create user");
  }
}

export async function createGuestUser() {
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
    return [{
      id: guest.id,
      email: guest.email,
    }];
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to create guest user"
    );
  }
}

export async function saveChat({
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
  } catch (_error) {
    throw new ChatbotError("bad_request:database", "Failed to save chat");
  }
}

export async function deleteChatById({ id }: { id: string }) {
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
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to delete chat by id"
    );
  }
}

export async function deleteAllChatsByUserId({ userId }: { userId: string }) {
  try {
    const userChats = chatsStore.filter((c) => c.userId === userId);

    if (userChats.length === 0) {
      return { deletedCount: 0 };
    }

    const chatIds = userChats.map((c) => c.id);

    // Delete related votes
    const remainingVotes = votesStore.filter((v) => !chatIds.includes(v.chatId));
    votesStore.length = 0;
    votesStore.push(...remainingVotes);

    // Delete related messages
    const remainingMessages = messagesStore.filter((m) => !chatIds.includes(m.chatId));
    messagesStore.length = 0;
    messagesStore.push(...remainingMessages);

    // Delete related streams
    const remainingStreams = streamsStore.filter((s) => !chatIds.includes(s.chatId));
    streamsStore.length = 0;
    streamsStore.push(...remainingStreams);

    // Delete chats
    const remainingChats = chatsStore.filter((c) => c.userId !== userId);
    chatsStore.length = 0;
    chatsStore.push(...remainingChats);

    return { deletedCount: userChats.length };
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to delete all chats by user id"
    );
  }
}

export async function getChatsByUserId({
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
    let userChats = chatsStore.filter((c) => c.userId === id);
    
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
      filteredChats = userChats.filter((c) => c.createdAt.getTime() > selectedChat.createdAt.getTime());
    } else if (endingBefore) {
      const selectedChat = chatsStore.find((c) => c.id === endingBefore);
      if (!selectedChat) {
        throw new ChatbotError(
          "not_found:database",
          `Chat with id ${endingBefore} not found`
        );
      }
      filteredChats = userChats.filter((c) => c.createdAt.getTime() < selectedChat.createdAt.getTime());
    } else {
      filteredChats = userChats;
    }

    const slicedChats = filteredChats.slice(0, extendedLimit);
    const hasMore = slicedChats.length > limit;

    return {
      chats: hasMore ? slicedChats.slice(0, limit) : slicedChats,
      hasMore,
    };
  } catch (_error) {
    if (_error instanceof ChatbotError) {
      throw _error;
    }
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get chats by user id"
    );
  }
}

export async function getChatById({ id }: { id: string }) {
  try {
    const selectedChat = chatsStore.find((c) => c.id === id);
    if (!selectedChat) {
      return null;
    }
    return selectedChat;
  } catch (_error) {
    throw new ChatbotError("bad_request:database", "Failed to get chat by id");
  }
}

export async function saveMessages({ messages }: { messages: DBMessage[] }) {
  try {
    messagesStore.push(...messages);
    return messages;
  } catch (_error) {
    throw new ChatbotError("bad_request:database", "Failed to save messages");
  }
}

export async function updateMessage({
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
  } catch (_error) {
    if (_error instanceof ChatbotError) {
      throw _error;
    }
    throw new ChatbotError("bad_request:database", "Failed to update message");
  }
}

export async function getMessagesByChatId({ id }: { id: string }) {
  try {
    const msgs = messagesStore.filter((m) => m.chatId === id);
    // Sort by createdAt asc
    msgs.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    return msgs;
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get messages by chat id"
    );
  }
}

export async function voteMessage({
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
  } catch (_error) {
    throw new ChatbotError("bad_request:database", "Failed to vote message");
  }
}

export async function getVotesByChatId({ id }: { id: string }) {
  try {
    return votesStore.filter((v) => v.chatId === id);
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get votes by chat id"
    );
  }
}

export async function saveDocument({
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
  } catch (_error) {
    throw new ChatbotError("bad_request:database", "Failed to save document");
  }
}

export async function updateDocumentContent({
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
  } catch (_error) {
    if (_error instanceof ChatbotError) {
      throw _error;
    }
    throw new ChatbotError(
      "bad_request:database",
      "Failed to update document content"
    );
  }
}

export async function getDocumentsById({ id }: { id: string }) {
  try {
    const docs = documentsStore.filter((d) => d.id === id);
    // Sort asc by createdAt
    docs.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    return docs;
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get documents by id"
    );
  }
}

export async function getDocumentById({ id }: { id: string }) {
  try {
    const docs = documentsStore.filter((d) => d.id === id);
    // Sort desc by createdAt
    docs.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return docs[0] || null;
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get document by id"
    );
  }
}

export async function deleteDocumentsByIdAfterTimestamp({
  id,
  timestamp,
}: {
  id: string;
  timestamp: Date;
}) {
  try {
    // Delete suggestions
    const remainingSuggestions = suggestionsStore.filter(
      (s) => !(s.documentId === id && s.documentCreatedAt.getTime() > timestamp.getTime())
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
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to delete documents by id after timestamp"
    );
  }
}

export async function saveSuggestions({
  suggestions,
}: {
  suggestions: Suggestion[];
}) {
  try {
    suggestionsStore.push(...suggestions);
    return suggestions;
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to save suggestions"
    );
  }
}

export async function getSuggestionsByDocumentId({
  documentId,
}: {
  documentId: string;
}) {
  try {
    return suggestionsStore.filter((s) => s.documentId === documentId);
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get suggestions by document id"
    );
  }
}

export async function getMessageById({ id }: { id: string }) {
  try {
    return messagesStore.filter((m) => m.id === id);
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get message by id"
    );
  }
}

export async function deleteMessagesByChatIdAfterTimestamp({
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
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to delete messages by chat id after timestamp"
    );
  }
}

export async function updateChatVisibilityById({
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
  } catch (_error) {
    if (_error instanceof ChatbotError) {
      throw _error;
    }
    throw new ChatbotError(
      "bad_request:database",
      "Failed to update chat visibility by id"
    );
  }
}

export async function updateChatTitleById({
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
  } catch (_error) {
    return;
  }
}

export async function getMessageCountByUserId({
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

    const userChatIds = chatsStore.filter((c) => c.userId === id).map((c) => c.id);

    const count = messagesStore.filter(
      (m) =>
        userChatIds.includes(m.chatId) &&
        m.createdAt.getTime() >= cutoffTime.getTime() &&
        m.role === "user"
    ).length;

    return count;
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get message count by user id"
    );
  }
}

export async function createStreamId({
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
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to create stream id"
    );
  }
}

export async function getStreamIdsByChatId({ chatId }: { chatId: string }) {
  try {
    const streams = streamsStore.filter((s) => s.chatId === chatId);
    streams.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    return streams.map(({ id }) => id);
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get stream ids by chat id"
    );
  }
}
