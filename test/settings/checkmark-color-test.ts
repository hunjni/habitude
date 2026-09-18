// Tests for the user-configurable checkmark color (feature/checkmark-color).
//
// Covers:
//   1. DEFAULT_SETTINGS.checkmarkColor is white (#ffffff).
//   2. normalizeCheckmarkColor(): valid '#rrggbb' kept, anything else -> white.
//   3. loadSettings(): old data without the key inherits white; invalid
//      stored values are normalized (existing users' settings never break).
//   4. i18n: settings.checkmarkColor.name/desc exist in en and ko.
//   5. Declarative path (Obsidian 1.13+): a 'color' control with
//      key 'checkmarkColor' and white defaultValue; setControlValue
//      normalizes and persists.
//   6. (0.4.2) The display() fallback for Obsidian < 1.13 was removed:
//      settings now render only via getSettingDefinitions() and the plugin
//      requires Obsidian 1.13.0+.
//
// Build & run:
//   esbuild test/settings/checkmark-color-test.ts --bundle --platform=node \
//     --alias:obsidian=./test/stress/mock-obsidian.ts \
//     --outfile=test/settings/dist/checkmark-color-test.cjs --format=cjs --log-level=warning \
//   && node test/settings/dist/checkmark-color-test.cjs

import { HabitudeSettingTab } from '../../src/settings';
import {
	DEFAULT_SETTINGS,
	normalizeCheckmarkColor,
	type PluginSettings,
} from '../../src/types';
import { setUiLocale, t } from '../../src/i18n';
import { Setting } from '../stress/mock-obsidian';
import type { App, SettingDefinitionItem } from 'obsidian';
import HabitudePlugin from '../../src/main';
import type { SettingDefinitionControl } from 'obsidian';

let failures = 0;

function check(name: string, cond: boolean, extra = ''): void {
	if (cond) {
		console.log(`  PASS ${name}${extra}`);
	} else {
		failures++;
		console.log(`  FAIL ${name}${extra}`);
	}
}

interface FakePlugin {
	settings: PluginSettings;
	saves: number;
	saveSettings: () => Promise<void>;
}

function makePlugin(overrides: Partial<PluginSettings> = {}): FakePlugin {
	const holder: FakePlugin = {
		settings: { ...DEFAULT_SETTINGS, ...overrides },
		saves: 0,
		saveSettings: async () => {
			holder.saves++;
		},
	};
	return holder;
}

function makeTab(plugin: FakePlugin): HabitudeSettingTab {
	const app = {} as unknown as App;
	const typedPlugin = plugin as unknown as HabitudePlugin;
	return new HabitudeSettingTab(app, typedPlugin);
}

/** Instantiate the real plugin class without Obsidian: stub loadData/saveData. */
async function loadSettingsWith(stored: unknown): Promise<PluginSettings> {
	const inst = Object.create(HabitudePlugin.prototype) as HabitudePlugin & {
		loadData: () => Promise<unknown>;
		saveData: (data: unknown) => Promise<void>;
	};
	inst.loadData = async () => stored;
	inst.saveData = async () => {};
	await inst.loadSettings();
	return inst.settings;
}

async function testDefaultsAndNormalize(): Promise<void> {
	console.log('defaults + normalize:');
	check('default checkmark color is white', DEFAULT_SETTINGS.checkmarkColor === '#ffffff');
	check('valid hex kept', normalizeCheckmarkColor('#a1b2c3') === '#a1b2c3');
	check('uppercase hex kept', normalizeCheckmarkColor('#A1B2C3') === '#A1B2C3');
	check('surrounding whitespace trimmed', normalizeCheckmarkColor('  #00ff00  ') === '#00ff00');
	check('color name rejected', normalizeCheckmarkColor('red') === '#ffffff');
	check('short hex rejected', normalizeCheckmarkColor('#abc') === '#ffffff');
	check('empty string rejected', normalizeCheckmarkColor('') === '#ffffff');
	check('undefined rejected', normalizeCheckmarkColor(undefined) === '#ffffff');
	check('non-string rejected', normalizeCheckmarkColor(12345) === '#ffffff');
}

async function testLoadSettingsMigration(): Promise<void> {
	console.log('loadSettings migration:');
	const oldUser = await loadSettingsWith({});
	check('old data (no key) inherits white', oldUser.checkmarkColor === '#ffffff');
	const custom = await loadSettingsWith({ checkmarkColor: '#a1b2c3' });
	check('existing custom color preserved', custom.checkmarkColor === '#a1b2c3');
	const junk = await loadSettingsWith({ checkmarkColor: 'not-a-color' });
	check('invalid stored color normalized to white', junk.checkmarkColor === '#ffffff');
}

function testI18n(): void {
	console.log('i18n:');
	setUiLocale('en');
	const enName = t('settings.checkmarkColor.name');
	const enDesc = t('settings.checkmarkColor.desc');
	check('en name non-empty', enName === 'Checkmark color', ` (was "${enName}")`);
	check('en desc non-empty', enDesc.length > 0);
	setUiLocale('ko');
	const koName = t('settings.checkmarkColor.name');
	const koDesc = t('settings.checkmarkColor.desc');
	check('ko name non-empty', koName === '체크마크 색상', ` (was "${koName}")`);
	check('ko desc non-empty', koDesc.length > 0);
	check('ko name differs from en', koName !== enName);
}

function findColorDef(defs: SettingDefinitionItem[]): SettingDefinitionControl | undefined {
	for (const d of defs) {
		if (
			'control' in d &&
			d.control !== undefined &&
			d.control.type === 'color' &&
			d.control.key === 'checkmarkColor'
		) {
			return d;
		}
	}
	return undefined;
}

async function testDeclarativePath(): Promise<void> {
	console.log('declarative path (Obsidian 1.13+, display() bypassed):');
	setUiLocale('en');
	Setting.instances.length = 0;
	const plugin = makePlugin();
	const tab = makeTab(plugin);
	const defs = tab.getSettingDefinitions();

	const def = findColorDef(defs);
	check('color control definition exists', !!def);
	if (!def) return;
	check('definition name is set', typeof def.name === 'string' && def.name.length > 0, ` (was "${def.name}")`);
	check(
		'defaultValue is white',
		def.control.defaultValue === '#ffffff',
		` (was "${def.control.defaultValue}")`,
	);

	check('getControlValue returns current setting', tab.getControlValue('checkmarkColor') === '#ffffff');

	await tab.setControlValue('checkmarkColor', '#a1b2c3');
	check('setControlValue stores valid hex', plugin.settings.checkmarkColor === '#a1b2c3');
	check('setControlValue persists', plugin.saves === 1);

	await tab.setControlValue('checkmarkColor', 'junk');
	check('setControlValue normalizes junk to white', plugin.settings.checkmarkColor === '#ffffff');
}

async function main(): Promise<void> {
	await testDefaultsAndNormalize();
	await testLoadSettingsMigration();
	testI18n();
	await testDeclarativePath();
	if (failures > 0) {
		console.log(`\n${failures} check(s) FAILED`);
		process.exit(1);
	}
	console.log('\nAll checkmark-color checks passed.');
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
