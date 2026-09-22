// Onload simulation probe (diagnostic only, not shipped):
// 1. place a fake `obsidian` package in a temp node_modules
// 2. copy main.js next to it and require it via createRequire
// 3. instantiate the plugin class with a fake app + real manifest
// 4. await onload() and report any thrown error
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'habitude-onload-'));
const nm = path.join(tmp, 'node_modules', 'obsidian');
fs.mkdirSync(nm, { recursive: true });

const stubSrc = `
const M = {
  Plugin: class { constructor(app, manifest){ this.app = app; this.manifest = manifest; this.commands = []; this.data = null; }
    async loadData(){ return this.data; } async saveData(d){ this.data = d; }
    addCommand(c){ this.commands.push(c); return c; }
    addRibbonIcon(){ return new Proxy({}, { get: () => () => {} }); }
    addStatusBarItem(){ return new Proxy({}, { get: () => () => {} }); }
    registerView(){} registerEvent(){} registerDomEvent(){} registerInterval(){ return 1; }
    addSettingTab(){} registerMarkdownPostProcessor(){} registerEditorExtension(){}
  },
  PluginSettingTab: class { constructor(){ } display(){} },
  ItemView: class { constructor(){ } getViewType(){ return 'fake'; } getDisplayText(){ return 'fake'; }
    onOpen(){ return Promise.resolve(); } onClose(){ return Promise.resolve(); } },
  Modal: class { open(){} close(){} },
  Setting: class { setName(){ return this; } setDesc(){ return this; } addText(){ return this; }
    addToggle(){ return this; } addDropdown(){ return this; } addButton(){ return this; }
    addExtraButton(){ return this; } setClass(){ return this; } },
  Menu: class { addItem(){ return this; } addSeparator(){ return this; } showAtMouseEvent(){} showAtPosition(){} },
  Notice: class { constructor(){} },
  TFile: class {}, TFolder: class {}, MarkdownView: class {}, Component: class {},
  Scope: class {}, FuzzySuggestModal: class {}, AbstractInputSuggest: class {}, EditorSuggest: class {},
  normalizePath: (p) => p,
  requestUrl: async () => ({ text: '', status: 200 }),
  addIcon: () => {}, setIcon: () => {},
  Platform: { isMobile: false, isDesktop: true, isDesktopApp: true },
  debounce: (f) => f,
  moment: () => ({ format: () => '', locale: () => ({}), isSame: () => false, add: () => ({}),
    startOf: () => ({}), day: () => 0, clone: () => ({}) }),
  momentPropertyName: 'moment',
};
module.exports = new Proxy(M, { get(t, p){ if (p in t) return t[p]; return class { constructor(){} }; } });
`;
fs.writeFileSync(path.join(nm, 'index.js'), stubSrc);
fs.writeFileSync(
	path.join(nm, 'package.json'),
	JSON.stringify({ name: 'obsidian', version: '1.0.0', main: 'index.js' }),
);

const cjsPath = path.join(tmp, 'main.cjs');
fs.copyFileSync('N:/新建文件夹/habitude/main.js', cjsPath);

const requireCjs = createRequire(cjsPath);
const mod = requireCjs('./main.cjs') as { default?: abstract new () => unknown };
const PluginClass = (mod.default ?? mod) as abstract new (
	app: unknown,
	manifest: unknown,
) => PluginLike;

const fakeApp: Record<string, unknown> = {
	vault: {
		on: () => ({ off() {} }),
		getAbstractFileByPath: () => null,
		createFolder: async () => {},
		read: async () => '',
		create: async () => null,
		modify: async () => {},
	},
	workspace: {
		on: () => ({ off() {} }),
		getLeavesOfType: () => [],
		getLeaf: () => ({ setViewState: async () => {} }),
		getActiveViewOfType: () => null,
	},
	fileManager: { trashFile: async () => {} },
	lastEvent: null,
	addStatusBarItem: () => new Proxy({}, { get: () => () => {} }),
};
// Permissive fallback: any unknown app API becomes a callable returning a
// self-similar proxy, so onload can run to completion in simulation.
const fakeAppProxy: unknown = new Proxy(fakeApp, {
	get(t, p: string | symbol) {
		if (typeof p === 'string' && p in t) return Reflect.get(t, p, t);
		const fn = (): unknown => fakeAppProxy;
		return new Proxy(fn, {
			get: (_ft, fp) => (fp === Symbol.toPrimitive ? () => '' : (Reflect.get(fn, fp, fn) as unknown)),
		});
	},
});

const manifest = JSON.parse(fs.readFileSync('N:/新建文件夹/habitude/manifest.json', 'utf8')) as object;

type PluginLike = { onload: () => Promise<void>; onunload?: () => void };
const Ctor = PluginClass as unknown as new (app: unknown, manifest: object) => PluginLike;
const plugin = new Ctor(fakeAppProxy, manifest);
try {
	await plugin.onload();
	console.log('ONLOAD OK, commands registered:', (plugin as unknown as { commands?: unknown[] }).commands?.length ?? 'n/a');
} catch (e) {
	console.log('ONLOAD FAILED:', e instanceof Error ? e.message : String(e));
	if (e instanceof Error && e.stack) console.log(e.stack.split('\n').slice(0, 10).join('\n'));
}
try {
	plugin.onunload?.();
	console.log('ONUNLOAD OK');
} catch (e) {
	console.log('ONUNLOAD FAILED:', e instanceof Error ? e.message : String(e));
}
