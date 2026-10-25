/**
 * Bridge to the Reading Journey plugin (id "reading-journey"). Books are always parsed by Book Mind itself
 * (same schema), so standalone and integrated modes behave identically; Reading Journey is used for writes
 * (`logProgress`) and shared settings (books folder, yearly goal, daily hours) when it is installed.
 */
import type { App } from "obsidian";

export const RJ_ID = "reading-journey";

export interface Renderer { render(): void }

export interface RJPlugin {
  settings: { booksFolder?: string; yearGoal?: number; hours?: Record<string, number>; dailyHours?: number; dailyNoteFolder?: string };
  renderers?: Set<Renderer>;
  folder?(): string;
  logProgress?(path: string, opts: { page?: number; delta?: number; hours?: number; session?: boolean; notes?: string }): Promise<void>;
  refreshSoon?(): void;
}

type LooseApp = App & { plugins?: { plugins?: Record<string, unknown> } };

export class ReadingJourneyBridge {
  private hooked: Set<Renderer> | null = null;

  constructor(private app: App, private hook: Renderer, private enabled: () => boolean) {}

  get(): RJPlugin | null {
    if (!this.enabled()) return null;
    const p = (this.app as LooseApp).plugins?.plugins?.[RJ_ID] as RJPlugin | undefined;
    if (!p || !p.settings) return null;
    if (p.renderers && p.renderers !== this.hooked && typeof p.renderers.add === "function") {
      this.detach();
      p.renderers.add(this.hook);
      this.hooked = p.renderers;
    }
    return p;
  }

  detach(): void {
    if (this.hooked) this.hooked.delete(this.hook);
    this.hooked = null;
  }

  folder(fallback: string): string {
    const rj = this.get();
    const f = rj ? (typeof rj.folder === "function" ? rj.folder() : rj.settings.booksFolder || "") : "";
    return String(f || fallback || "Books").replace(/^\/+|\/+$/g, "");
  }

  yearGoal(fallback: number): number {
    const rj = this.get();
    const g = rj ? Number(rj.settings.yearGoal) : NaN;
    return rj && isFinite(g) && g > 0 ? g : fallback;
  }

  hours(date: string, standalone: Record<string, number>): number {
    const rj = this.get();
    const v = rj ? Number((rj.settings.hours || {})[date]) : Number(standalone[date]);
    return isFinite(v) ? v : 0;
  }
}
