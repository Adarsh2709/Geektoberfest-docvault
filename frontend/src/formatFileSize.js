export function formatFileSize(bytes) {
  if (!Number.isSafeInteger(bytes) || bytes < 0) return "Unknown";
  if (bytes < 1024) return `${bytes} B`;

  const isKilobytes = bytes < 1024 * 1024;
  const size = bytes / (isKilobytes ? 1024 : 1024 * 1024);
  return `${Number(size.toFixed(2))} ${isKilobytes ? "KB" : "MB"}`;
}
