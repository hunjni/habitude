// Migration test: pre-0.4.2 legacy settings (geminiApiKey / coachModel).
//
// Covers:
//   1. Legacy { geminiApiKey, coachModel } migrates to llmApiKey/llmModel with
//      provider 'gemini', and the legacy keys are purged from stored data.
//   2. Legacy key without coachModel falls back to DEFAULT_COACH_MODEL.
//   3. An existing llmApiKey is never overwritten; the legacy key is still purged.
//   4. A lone coachModel (no key) migrates nothing but is still purged.
//   5. Clean data (no legacy keys) triggers no write at all.
//
// Only fake keys are used; nothing here touches the network.
//
// Build & run:
//   esbuild test/settings/migration-test.ts --bundle --platform=node \
//     --alias:obsidian=./test/stress/mock-obsidian.ts \
//     --outfile=test/settings/dist/migration-test.cjs --format=cjs --log-level=warning \
//   && node test/settings/dist/migration-test.cjs

import HabitudePlugin from '../../src/main';
import { DEFAULT_COACH_MODEL } from '../../src/coach/providers';
import { DEFAULT_SETTINGS, type PluginSettings } from '../../src/types';

let failures = 0;

function check(name: string, cond: boolean, extra = ''): void {
	if (cond) {
		console.log(`  PASS ${name}${extra}`);
	} else {
		failures++;
		console.log(`  FAIL ${name}${extra}`);
	}
}

/** Deliberately fake — never a real credential. */
const FAKE_KEY = 'FAKE-LEGACY-KEY-001';

/** Instantiate the real plugin class without Obsidian; capture saved data. */
async function loadSettingsWith(
	stored: unknown,
): Promise<{ settings: PluginSettings; saved: unknown[] }> {
	const inst = Object.create(HabitudePlugin.prototype) as HabitudePlugin & {
		loadData: () => Promise<unknown>;
		saveData: (data: unknown) => Promise<void>;
	};
	const saved: unknown[] = [];
	inst.loadData = async () => stored;
	inst.saveData = async (data: unknown) => {
		saved.push(data);
	};
	await inst.loadSettings();
	return { settings: inst.settings, saved };
}

function hasLegacyKeys(data: unknown): boolean {
	const d = data as Record<string, unknown>;
	return 'geminiApiKey' in d || 'coachModel' in d;
}

async function testFullMigration(): Promise<void> {
	console.log('full legacy migration:');
	const { settings, saved } = await loadSettingsWith({
		geminiApiKey: FAKE_KEY,
		coachModel: 'gemini-2.0-flash',
	});
	check('key migrated to llmApiKey', settings.llmApiKey === FAKE_KEY);
	check('provider set to gemini', settings.llmProvider === 'gemini');
	check('model migrated to llmModel', settings.llmModel === 'gemini-2.0-flash');
	check('stored data was rewritten', saved.length === 1);
	if (saved.length === 1) {
		check('legacy keys purged from stored data', !hasLegacyKeys(saved[0]));
		const persisted = saved[0] as PluginSettings;
		check('migrated key persisted', persisted.llmApiKey === FAKE_KEY);
	}
}

async function testKeyOnlyMigration(): Promise<void> {
	console.log('legacy key without model:');
	const { settings, saved } = await loadSettingsWith({ geminiApiKey: FAKE_KEY });
	check('key migrated to llmApiKey', settings.llmApiKey === FAKE_KEY);
	check(
		'model falls back to default',
		settings.llmModel === DEFAULT_COACH_MODEL,
		` (was "${settings.llmModel}")`,
	);
	check('stored data was rewritten', saved.length === 1);
	if (saved.length === 1) check('legacy keys purged from stored data', !hasLegacyKeys(saved[0]));
}

async function testExistingKeyWins(): Promise<void> {
	console.log('existing llmApiKey is never overwritten:');
	const { settings, saved } = await loadSettingsWith({
		llmApiKey: 'USER-NEW-KEY',
		llmProvider: 'openai',
		llmModel: 'gpt-5-mini',
		geminiApiKey: FAKE_KEY,
		coachModel: 'gemini-2.0-flash',
	});
	check('llmApiKey untouched', settings.llmApiKey === 'USER-NEW-KEY');
	check('llmProvider untouched', settings.llmProvider === 'openai');
	check('llmModel untouched', settings.llmModel === 'gpt-5-mini');
	check('legacy keys still purged', saved.length === 1 && !hasLegacyKeys(saved[0]));
}

async function testModelOnlyPurge(): Promise<void> {
	console.log('lone legacy model (no key):');
	const { settings, saved } = await loadSettingsWith({ coachModel: 'gemini-2.0-flash' });
	check('no key materialized', settings.llmApiKey === '');
	check('model default unchanged', settings.llmModel === DEFAULT_SETTINGS.llmModel);
	check('legacy keys purged', saved.length === 1 && !hasLegacyKeys(saved[0]));
}

async function testCleanDataNoWrite(): Promise<void> {
	console.log('clean data:');
	const { settings, saved } = await loadSettingsWith({});
	check('no write triggered', saved.length === 0, ` (wrote ${saved.length})`);
	check('defaults intact', settings.llmApiKey === '' && settings.llmProvider === 'gemini');
}

async function testNullDataFreshInstall(): Promise<void> {
	// Obsidian's loadData() returns null when no data.json exists yet
	// (fresh install). This used to crash onload with
	// "Cannot read properties of null (reading 'geminiApiKey')".
	console.log('fresh install (loadData returns null):');
	const { settings, saved } = await loadSettingsWith(null);
	check('no crash and defaults intact', settings.llmApiKey === '' && settings.llmProvider === 'gemini');
	check('no write triggered', saved.length === 0, ` (wrote ${saved.length})`);
}

async function main(): Promise<void> {
	await testFullMigration();
	await testKeyOnlyMigration();
	await testExistingKeyWins();
	await testModelOnlyPurge();
	await testCleanDataNoWrite();
	await testNullDataFreshInstall();
	if (failures > 0) {
		console.log(`\n${failures} check(s) FAILED`);
		process.exit(1);
	}
	console.log('\nAll migration checks passed.');
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
