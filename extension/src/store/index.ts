import * as fs from "fs";
import * as path from "path";
import type { Finding, ScanRecord } from "../types";

interface StoreData {
  findings: Record<string, Finding>;
  scans: ScanRecord[];
}

// Persistent JSON store for findings. Keyed by stable finding ID.
// Intentionally simple: JSON on disk, read-modify-write on each scan.
// Upgrade path to SQLite is straightforward if write contention becomes a problem.
export class FindingsStore {
  private readonly dbPath: string;
  private readonly bakPath: string;
  private data: StoreData = { findings: {}, scans: [] };
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(storagePath: string) {
    this.dbPath = path.join(storagePath, "findings.json");
    this.bakPath = path.join(storagePath, "findings.json.bak");
    this.load();
  }

  // ─── Read ──────────────────────────────────────────────────────────────────

  getAll(): Finding[] {
    return Object.values(this.data.findings);
  }

  getByStatus(status: Finding["status"]): Finding[] {
    return this.getAll().filter((f) => f.status === status);
  }

  getActive(): Finding[] {
    return this.getAll().filter(
      (f) => f.status === "new" || f.status === "confirmed" || f.status === "reopened"
    );
  }

  get(id: string): Finding | undefined {
    return this.data.findings[id];
  }

  getRecentScans(limit = 10): ScanRecord[] {
    return this.data.scans.slice(-limit).reverse();
  }

  // ─── Write ─────────────────────────────────────────────────────────────────

  // Called after each scan. Merges new findings against stored ones,
  // transitioning statuses correctly so resolved findings aren't silently dropped.
  applyNewFindings(incomingFindings: Finding[], scanId: string): void {
    const incomingIds = new Set(incomingFindings.map((f) => f.id));

    // Transition existing active findings not seen in this scan → resolved.
    for (const existing of Object.values(this.data.findings)) {
      if (existing.status === "resolved") continue;
      if (!incomingIds.has(existing.id)) {
        this.data.findings[existing.id] = { ...existing, status: "resolved", lastSeen: existing.lastSeen };
      }
    }

    // Upsert incoming findings.
    for (const incoming of incomingFindings) {
      const existing = this.data.findings[incoming.id];
      if (!existing) {
        this.data.findings[incoming.id] = { ...incoming, status: "new" };
      } else if (existing.status === "resolved") {
        this.data.findings[incoming.id] = {
          ...incoming,
          status: "reopened",
          firstSeen: existing.firstSeen,
        };
      } else {
        this.data.findings[incoming.id] = {
          ...existing,
          ...incoming,
          status: existing.status === "confirmed" ? "confirmed" : "new",
          firstSeen: existing.firstSeen,
        };
      }
    }

    this.save();
  }

  appendScanRecord(record: ScanRecord): void {
    this.data.scans.push(record);
    // Keep at most 100 scan records.
    if (this.data.scans.length > 100) {
      this.data.scans = this.data.scans.slice(-100);
    }
    this.save();
  }

  // ─── Persistence ───────────────────────────────────────────────────────────

  private load(): void {
    for (const p of [this.dbPath, this.bakPath]) {
      try {
        if (fs.existsSync(p)) {
          const raw = fs.readFileSync(p, "utf8");
          this.data = JSON.parse(raw) as StoreData;
          return;
        }
      } catch {
        // Primary corrupt — try backup on next iteration, then start fresh.
      }
    }
    this.data = { findings: {}, scans: [] };
  }

  private save(): void {
    // Batch writes: defer 200ms so rapid successive saves become one I/O op.
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.flushToDisk();
    }, 200);
  }

  private flushToDisk(): void {
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const payload = JSON.stringify(this.data, null, 2);
    // Write backup before overwriting primary so corruption is recoverable.
    if (fs.existsSync(this.dbPath)) {
      try { fs.copyFileSync(this.dbPath, this.bakPath); } catch { /* non-fatal */ }
    }
    fs.writeFileSync(this.dbPath, payload, "utf8");
  }
}
