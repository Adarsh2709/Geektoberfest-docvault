import { test, expect } from "vitest";
import { formatFileSize } from "./formatFileSize.js";

test("formats byte counts with appropriate units and no trailing zeros", () => {
  for (const [bytes, expected] of [
    [0, "0 B"],
    [1, "1 B"],
    [512, "512 B"],
    [1023, "1023 B"],
    [1024, "1 KB"],
    [1536, "1.5 KB"],
    [2000, "1.95 KB"],
    [1048575, "1024 KB"],
    [1048576, "1 MB"],
    [1572864, "1.5 MB"],
    [2359296, "2.25 MB"],
    [10485760, "10 MB"],
    [1073741824, "1024 MB"],
  ]) {
    expect(formatFileSize(bytes), `bytes: ${bytes}`).toBe(expected);
  }
});

test("uses a consistent fallback for missing and invalid byte counts", () => {
  for (const bytes of [
    undefined, null, NaN, Infinity, -Infinity, -1, 0.5,
    Number.MAX_SAFE_INTEGER + 1, "", "1024", true, false, {}, [],
  ]) {
    expect(formatFileSize(bytes)).toBe("Unknown");
  }
});

test("leaves the original document byte count unchanged", () => {
  const document = Object.freeze({ file_size: 1536 });
  expect(formatFileSize(document.file_size)).toBe("1.5 KB");
  expect(document).toEqual({ file_size: 1536 });
});
