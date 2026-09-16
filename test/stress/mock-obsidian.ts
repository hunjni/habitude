// Minimal mock of the 'obsidian' module for Node stress tests.
// Backed by a real directory on disk so file content can be inspected.

import * as fs from 'node:fs';
import * as path from 'node:path';

export function normalizePath(p: string): string {
	return p.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\.\//, '');
}

export class TFile {
	public stat: { mtime: number; ctime: number; size: number };
	constructor(
		public path: string,
		public basename: string,
		mtime = 0,
	) {
		this.stat = { mtime, ctime: mtime, size: 0 };
	}
}

class MockVault {
	private mtimes = new Map<string, number>();
	/** Counts read() calls — lets tests assert cache behavior. */
	readCount = 0;
	constructor(private root: string) {}

	private abs(p: string): string {
		return path.join(this.root, normalizePath(p));
	}

	private touch(p: string): number {
		const np = normalizePath(p);
		let fsM = 0;
		try {
			fsM = fs.statSync(this.abs(p)).mtimeMs;
		} catch {
			/* file may not exist yet */
		}
		// Strictly increasing even for two writes within the same millisecond.
		const prev = this.mtimes.get(np) ?? 0;
		const t = Math.max(fsM, prev + 0.001);
		this.mtimes.set(np, t);
		return t;
	}

	private makeFile(p: string): TFile {
		const np = normalizePath(p);
		let fsM = 0;
		try {
			fsM = fs.statSync(this.abs(p)).mtimeMs;
		} catch {
			/* ignore */
		}
		const known = this.mtimes.get(np);
		let mtime: number;
		if (known === undefined) {
			// Never written through the mock (seeded or hand-created file).
			mtime = fsM;
		} else if (fsM > known) {
			// External (direct-fs) write happened after our last mock write.
			mtime = fsM;
			this.mtimes.set(np, mtime);
		} else {
			mtime = known;
		}
		return new TFile(np, path.basename(np, path.extname(np)), mtime);
	}

	getAbstractFileByPath(p: string): TFile | null {
		const a = this.abs(p);
		if (fs.existsSync(a) && fs.statSync(a).isFile()) {
			return this.makeFile(p);
		}
		return null;
	}

	async read(file: TFile): Promise<string> {
		this.readCount++;
		return fs.readFileSync(this.abs(file.path), 'utf8');
	}

	async modify(file: TFile, data: string): Promise<void> {
		fs.writeFileSync(this.abs(file.path), data, 'utf8');
		this.touch(file.path);
	}

	async create(p: string, data: string): Promise<TFile> {
		const a = this.abs(p);
		fs.mkdirSync(path.dirname(a), { recursive: true });
		fs.writeFileSync(a, data, 'utf8');
		this.touch(p);
		return this.makeFile(p);
	}

	async createFolder(p: string): Promise<void> {
		fs.mkdirSync(this.abs(p), { recursive: true });
	}

	on(_event: string, _cb: (...args: unknown[]) => void): { unload: () => void } {
		return { unload: () => undefined };
	}
}

export class App {
	vault: MockVault;
	constructor(vaultRoot: string) {
		this.vault = new MockVault(vaultRoot);
	}
}

/** Test helper: build a mock App typed as the real Obsidian App. */
export function createTestApp(vaultRoot: string): import('obsidian').App {
	return new App(vaultRoot) as unknown as import('obsidian').App;
}

// Unused runtime stubs (type imports in src are erased at compile time,
// but these keep any stray value imports from crashing).
export class Notice {
	constructor(_message: string | DocumentFragment) {}
	hide(): void {}
}
export class ItemView {}
export class WorkspaceLeaf {}
export class Menu {}
export class Modal {}
export class PluginSettingTab {}
export class Setting {}
export class SuggestModal<T = unknown> {
	/** Keeps the generic parameter referenced for API shape parity. */
	declare protected itemType: T;
}
export class Plugin {}
