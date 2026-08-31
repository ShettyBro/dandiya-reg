import { EventEmitter } from "node:events";
import { Writable } from "node:stream";

const MAX_LINES = 500;
const buffer: string[] = [];

export const logEvents = new EventEmitter();
logEvents.setMaxListeners(50);

class RingBufferStream extends Writable {
  override _write(chunk: Buffer | string, _encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
    const line = chunk.toString().trimEnd();
    if (line.length > 0) {
      buffer.push(line);
      if (buffer.length > MAX_LINES) {
        buffer.shift();
      }
      logEvents.emit("line", line);
    }
    callback();
  }
}

export const logRingBufferStream = new RingBufferStream();

export function getRecentLogLines(): string[] {
  return [...buffer];
}
