// Talks to Feetech STS3215 servos (the SO-101 motors) from the browser, over the Web Serial API (Chrome / Edge).
// Protocol and register addresses match Feetech's SCServo SDK and LeRobot's STS3215 control table:
//   packet  = 0xFF 0xFF ID LENGTH INSTRUCTION PARAMS… CHECKSUM,  LENGTH = len(PARAMS) + 2,
//   CHECKSUM = ~(ID + LENGTH + INSTRUCTION + ΣPARAMS) & 0xFF,  multi-byte values are little-endian.
//   reply   = 0xFF 0xFF ID LENGTH ERROR PARAMS… CHECKSUM
export const INST = { PING: 0x01, READ: 0x02, WRITE: 0x03 };
export const REG = { TORQUE_ENABLE: 40, GOAL_POSITION: 42, PRESENT_POSITION: 56 };
export const BAUD = 1_000_000;
export const RESOLUTION = 4096;
// LeRobot's SO-101 leader: motor IDs and normalization modes
export const SO101_MOTORS = [
  ['shoulder_pan', 1], ['shoulder_lift', 2], ['elbow_flex', 3], ['wrist_flex', 4], ['wrist_roll', 5], ['gripper', 6],
];

export function packet(id, instruction, params = []) {
  const len = params.length + 2;
  let sum = id + len + instruction; for (const p of params) sum += p;
  return Uint8Array.from([0xff, 0xff, id, len, instruction, ...params, ~sum & 0xff]);
}
export const readPacket = (id, addr, n) => packet(id, INST.READ, [addr, n]);
export const writePacket = (id, addr, bytes) => packet(id, INST.WRITE, [addr, ...bytes]);

// Finds the first complete, valid reply in `buf`. Returns { id, error, params, used } or null if more bytes are needed.
export function parseReply(buf) {
  for (let i = 0; i + 5 < buf.length; i++) {
    if (buf[i] !== 0xff || buf[i + 1] !== 0xff) continue;
    const id = buf[i + 2], len = buf[i + 3];
    if (id > 0xfd || len < 2) continue;
    const end = i + 4 + len; if (end > buf.length) return null;
    let sum = 0; for (let k = i + 2; k < end - 1; k++) sum += buf[k];
    if ((~sum & 0xff) !== buf[end - 1]) continue;  // corrupt: resync
    return { id, error: buf[i + 4], params: Array.from(buf.slice(i + 5, end - 1)), used: end };
  }
  return null;
}
export const word = ([lo, hi]) => lo | (hi << 8);

// LeRobot calibration: { motor: { id, drive_mode, homing_offset, range_min, range_max } } (the JSON lerobot-calibrate saves).
// The homing offset is already applied inside the servo, so Present_Position only needs the range.
export function toDegrees(raw, cal) {
  const mid = (cal.range_min + cal.range_max) / 2;
  return (raw - mid) * 360 / (RESOLUTION - 1);
}
export function toGripper01(raw, cal) {  // LeRobot RANGE_0_100, as 0…1
  const v = Math.min(cal.range_max, Math.max(cal.range_min, raw));
  return (v - cal.range_min) / (cal.range_max - cal.range_min);
}
// Without a calibration file, assume LeRobot's half-turn homing (mid ≈ 2047) and the full encoder range.
export const DEFAULT_CAL = Object.fromEntries(SO101_MOTORS.map(([n, id]) => [n, { id, drive_mode: 0, homing_offset: 0, range_min: n === 'gripper' ? 2047 : 0, range_max: n === 'gripper' ? 3200 : 4095 }]));

// A leader arm on a serial port. `port` is a Web Serial SerialPort (or anything with the same open/readable/writable shape).
export class FeetechBus {
  constructor(port) { this.port = port; this.buf = new Uint8Array(0); }
  async open() {
    await this.port.open({ baudRate: BAUD });
    this.writer = this.port.writable.getWriter();
    this.reader = this.port.readable.getReader();
  }
  async close() {
    try { await this.reader?.cancel(); } catch { /* already closed */ }
    try { this.reader?.releaseLock(); this.writer?.releaseLock(); await this.port.close(); } catch { /* already closed */ }
  }
  async #request(bytes, timeoutMs = 30) {
    this.buf = new Uint8Array(0);
    await this.writer.write(bytes);
    const deadline = performance.now() + timeoutMs;
    for (;;) {
      const r = parseReply(this.buf);
      if (r) { this.buf = this.buf.slice(r.used); return r; }
      const left = deadline - performance.now(); if (left <= 0) return null;
      const chunk = await Promise.race([this.reader.read(), new Promise((res) => setTimeout(() => res(null), left))]);
      if (!chunk) return null;
      if (chunk.done) throw new Error('Serial port closed');
      const nb = new Uint8Array(this.buf.length + chunk.value.length); nb.set(this.buf); nb.set(chunk.value, this.buf.length); this.buf = nb;
    }
  }
  // Leader arms are moved by hand, so torque must be off (LeRobot's SOLeader.configure does the same).
  async torqueOff(ids) { for (const id of ids) await this.#request(writePacket(id, REG.TORQUE_ENABLE, [0])); }
  async readPosition(id) {
    const r = await this.#request(readPacket(id, REG.PRESENT_POSITION, 2));
    return r && r.id === id && r.params.length === 2 ? word(r.params) : null;
  }
}
