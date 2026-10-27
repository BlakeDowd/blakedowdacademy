/**
 * Phone photo libraries often sort by the creation date inside the MP4
 * (when it was filmed / encoded), not by when it was saved. That buries
 * coaching downloads in the past. Rewrite those timestamps to "now" so the
 * clip shows up as the newest item after download.
 */

/** MP4/QuickTime epoch is 1904-01-01 UTC; Unix epoch is 1970-01-01. */
const MP4_EPOCH_OFFSET_SEC = 2_082_844_800;

function writeU32(view: DataView, offset: number, value: number): void {
  view.setUint32(offset, value >>> 0);
}

function writeU64(view: DataView, offset: number, value: number): void {
  // Times we care about fit in 32 bits of seconds; store as big-endian u64.
  view.setUint32(offset, 0);
  view.setUint32(offset + 4, value >>> 0);
}

/** Patch creation/modification times in mvhd, tkhd, and mdhd boxes (in place). */
function patchTimedBoxes(view: DataView, start: number, end: number, nowMp4: number): void {
  let offset = start;
  while (offset + 8 <= end) {
    const sizeField = view.getUint32(offset);
    const type =
      String.fromCharCode(view.getUint8(offset + 4)) +
      String.fromCharCode(view.getUint8(offset + 5)) +
      String.fromCharCode(view.getUint8(offset + 6)) +
      String.fromCharCode(view.getUint8(offset + 7));

    let header = 8;
    let boxSize = sizeField;
    if (sizeField === 1) {
      if (offset + 16 > end) break;
      // largesize — treat as remaining (rare for these boxes)
      const hi = view.getUint32(offset + 8);
      const lo = view.getUint32(offset + 12);
      boxSize = hi > 0 ? end - offset : lo;
      header = 16;
    } else if (sizeField === 0) {
      boxSize = end - offset;
    }
    if (boxSize < header || offset + boxSize > end) break;

    const content = offset + header;
    if (type === "moov" || type === "trak" || type === "mdia" || type === "minf" || type === "stbl") {
      patchTimedBoxes(view, content, offset + boxSize, nowMp4);
    } else if (type === "mvhd" || type === "tkhd" || type === "mdhd") {
      if (content + 4 <= offset + boxSize) {
        const version = view.getUint8(content);
        if (version === 0 && content + 12 <= offset + boxSize) {
          writeU32(view, content + 4, nowMp4);
          writeU32(view, content + 8, nowMp4);
        } else if (version === 1 && content + 20 <= offset + boxSize) {
          writeU64(view, content + 4, nowMp4);
          writeU64(view, content + 12, nowMp4);
        }
      }
    }

    if (boxSize <= 0) break;
    offset += boxSize;
  }
}

/** Returns a new buffer with MP4 dates set to now. Non-MP4 input is returned unchanged. */
export function stampMp4AsDownloadedNow(input: ArrayBuffer): ArrayBuffer {
  if (input.byteLength < 16) return input;
  const copy = input.slice(0);
  const view = new DataView(copy);
  const nowMp4 = Math.floor(Date.now() / 1000) + MP4_EPOCH_OFFSET_SEC;
  try {
    patchTimedBoxes(view, 0, copy.byteLength, nowMp4);
  } catch {
    return input;
  }
  return copy;
}

/** Filename that sorts as the newest download: `2026-10-27_120534-Game_plan.mp4`. */
export function downloadFilenameNow(label: string, index?: number, total?: number): string {
  const d = new Date();
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  const safe = (label || "golf-video").replace(/[^\w-]+/g, "_").replace(/^_+|_+$/g, "") || "golf-video";
  const suffix = total && total > 1 && index ? `-${index}` : "";
  return `${stamp}-${safe}${suffix}.mp4`;
}

/** Stamp MP4 dates to now and trigger a browser download with a "just now" filename. */
export function saveStampedVideoDownload(input: ArrayBuffer | Blob, label: string): void {
  void (async () => {
    const buffer = input instanceof ArrayBuffer ? input : await input.arrayBuffer();
    const stamped = stampMp4AsDownloadedNow(buffer);
    const url = URL.createObjectURL(new Blob([stamped], { type: "video/mp4" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = downloadFilenameNow(label);
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  })();
}

/** Sync helper when the buffer is already in memory. */
export function saveStampedVideoDownloadSync(buffer: ArrayBuffer, label: string): void {
  const stamped = stampMp4AsDownloadedNow(buffer);
  const url = URL.createObjectURL(new Blob([stamped], { type: "video/mp4" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = downloadFilenameNow(label);
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
