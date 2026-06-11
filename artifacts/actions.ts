"use server";

import { getSuggestionsByDocumentId } from "@/lib/db/queries";

export async function getSuggestions({ documentId }: { documentId: string }) {
  const suggestions = getSuggestionsByDocumentId({ documentId });
  return suggestions ?? [];
}
