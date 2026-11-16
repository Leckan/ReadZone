export function splitSentences(text: string) {
  const Segmenter = Intl.Segmenter;
  if (Segmenter) {
    return [...new Segmenter(undefined, { granularity: "sentence" }).segment(text)]
      .map((entry) => entry.segment.trim())
      .filter(Boolean);
  }
  return text.match(/[^.!?]+[.!?]+["'”’)]*|[^.!?]+$/g)?.map((part) => part.trim()).filter(Boolean) ?? [text];
}

export function estimatedDuration(wordCount: number) {
  return Math.max(1, Math.round(wordCount / 165));
}

export function formatDuration(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return remaining ? `${hours} hr ${remaining} min` : `${hours} hr`;
}

export function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
