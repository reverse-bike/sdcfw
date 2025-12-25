/// <reference types="w3c-web-usb" />
import { createSignal } from 'solid-js';
import UsbProbeSelect from './UsbProbeSelect';
import ReadInfo from './ReadInfo';
import Backup, { type CompletedBackup } from './Backup';
import Restore from './Restore';

interface StepHeaderProps {
	number: number;
	title: string;
	description: string;
}

function StepHeader(props: StepHeaderProps) {
	return (
		<div class="flex items-start mb-4">
			<span class="flex-shrink-0 w-8 h-8 bg-blue-500 text-white rounded-full flex items-center justify-center font-bold mr-4">
				{props.number}
			</span>
			<div>
				<h3 class="font-semibold text-lg">{props.title}</h3>
				<p class="text-gray-600 mt-1">{props.description}</p>
			</div>
		</div>
	);
}

interface StepCardProps {
	number: number;
	title: string;
	description: string;
}

function StepCard(props: StepCardProps) {
	return (
		<div class="bg-white border border-gray-200 rounded-lg p-6">
			<StepHeader number={props.number} title={props.title} description={props.description} />
		</div>
	);
}

interface ToolStepProps {
	number: number;
	title: string;
	description: string;
	children: any;
}

function ToolStep(props: ToolStepProps) {
	return (
		<div class="relative">
			{/* Step indicator badge */}
			<div class="absolute -left-3 -top-3 w-8 h-8 bg-blue-500 text-white rounded-full flex items-center justify-center font-bold text-sm z-10 shadow-md">
				{props.number}
			</div>
			{/* Tool content with description prepended */}
			<div class="bg-white border border-gray-200 rounded-lg overflow-hidden">
				<div class="bg-gray-50 border-b border-gray-200 px-6 py-4">
					<h3 class="font-semibold text-lg">{props.title}</h3>
					<p class="text-gray-600 text-sm mt-1">{props.description}</p>
				</div>
				<div class="p-6">
					{props.children}
				</div>
			</div>
		</div>
	);
}

export default function GuidedTutorial() {
	const [selectedDevice, setSelectedDevice] = createSignal<USBDevice | null>(null);
	const [lastBackup, setLastBackup] = createSignal<CompletedBackup | null>(null);

	return (
		<div class="space-y-8 pl-4">
			{/* Step 1: Connect - no tool, just instructions */}
			<StepCard
				number={1}
				title="Connect Your Debug Probe"
				description="Plug the Raspberry Pi Debug Probe into your computer's USB port and connect the jumper wires to the test points. Turn on the bike's power so the controller is powered."
			/>

			{/* Step 2: Select Device */}
			<ToolStep
				number={2}
				title="Select the Device"
				description="Click 'Connect New Device' and select your debug probe from the browser's device picker. It will appear as 'CMSIS-DAP' or similar."
			>
				<UsbProbeSelectInline onDeviceSelected={setSelectedDevice} />
			</ToolStep>

			{/* Step 3: Read Info */}
			<ToolStep
				number={3}
				title="Read Device Info"
				description="Verify the connection and see details about your controller's chip, including the part number, memory size, and protection status."
			>
				<ReadInfoInline selectedDevice={selectedDevice()} />
			</ToolStep>

			{/* Step 4: Backup */}
			<ToolStep
				number={4}
				title="Backup Your Firmware"
				description="Always backup first! The backup tool reads the entire flash memory and configuration, verifies the data, and downloads a ZIP file."
			>
				<BackupInline selectedDevice={selectedDevice()} onBackupComplete={setLastBackup} />
			</ToolStep>

			{/* Step 5: Restore */}
			<ToolStep
				number={5}
				title="Restore When Needed"
				description="If something goes wrong or you want to revert changes, use this tool to flash your backup back to the controller."
			>
				<RestoreInline selectedDevice={selectedDevice()} lastBackup={lastBackup()} />
			</ToolStep>
		</div>
	);
}

// Inline versions of tools without their own card wrapper and heading
// These are thin wrappers that import the internal logic

import { createEffect, onCleanup, For, Show } from 'solid-js';

// ============ USB Probe Select Inline ============
interface UsbProbeSelectInlineProps {
	onDeviceSelected?: (device: USBDevice | null) => void;
}

function UsbProbeSelectInline(props: UsbProbeSelectInlineProps) {
	const [devices, setDevices] = createSignal<Array<{ device: USBDevice; id: string; name: string }>>([]);
	const [selectedDevice, setSelectedDevice] = createSignal<USBDevice | null>(null);
	const [error, setError] = createSignal<string>('');
	const [isSupported, setIsSupported] = createSignal(true);

	createEffect(() => {
		if (!navigator.usb) {
			setIsSupported(false);
			setError('WebUSB is not supported in this browser. Please use Chrome, Edge, or another Chromium-based browser.');
		}
	});

	const getDeviceName = (device: USBDevice): string => {
		return device.productName || `Unknown Device (${device.vendorId?.toString(16)}:${device.productId?.toString(16)})`;
	};

	const getDeviceId = (device: USBDevice): string => {
		return `${device.vendorId}-${device.productId}-${device.serialNumber || 'no-serial'}`;
	};

	const refreshDevices = async () => {
		if (!navigator.usb) return;
		try {
			const authorizedDevices = await navigator.usb.getDevices();
			const filteredDevices = authorizedDevices.map(device => ({
				device,
				id: getDeviceId(device),
				name: getDeviceName(device)
			}));
			setDevices(filteredDevices);
			setError('');
		} catch (err) {
			setError(`Failed to list devices: ${err instanceof Error ? err.message : 'Unknown error'}`);
		}
	};

	const requestDevice = async () => {
		if (!navigator.usb) return;
		try {
			const device = await navigator.usb.requestDevice({ filters: [] });
			await device.open();
			if (device.configuration === null) {
				await device.selectConfiguration(1);
			}
			setSelectedDevice(device);
			props.onDeviceSelected?.(device);
			await refreshDevices();
		} catch (err) {
			if (err instanceof Error && err.name === 'NotFoundError') return;
			setError(`Failed to connect to device: ${err instanceof Error ? err.message : 'Unknown error'}`);
		}
	};

	const selectDevice = async (device: USBDevice) => {
		try {
			if (!device.opened) {
				await device.open();
				if (device.configuration === null) {
					await device.selectConfiguration(1);
				}
			}
			setSelectedDevice(device);
			props.onDeviceSelected?.(device);
			setError('');
		} catch (err) {
			setError(`Failed to select device: ${err instanceof Error ? err.message : 'Unknown error'}`);
		}
	};

	const disconnectDevice = async () => {
		const device = selectedDevice();
		if (device && device.opened) {
			try {
				await device.close();
			} catch (err) {
				console.error('Error closing device:', err);
			}
		}
		setSelectedDevice(null);
		props.onDeviceSelected?.(null);
	};

	const handleConnect = () => refreshDevices();
	const handleDisconnect = (event: USBConnectionEvent) => {
		const currentDevice = selectedDevice();
		if (currentDevice && getDeviceId(currentDevice) === getDeviceId(event.device)) {
			setSelectedDevice(null);
			props.onDeviceSelected?.(null);
		}
		refreshDevices();
	};

	createEffect(() => {
		if (!navigator.usb) return;
		navigator.usb.addEventListener('connect', handleConnect);
		navigator.usb.addEventListener('disconnect', handleDisconnect);
		refreshDevices();
		onCleanup(() => {
			navigator.usb.removeEventListener('connect', handleConnect);
			navigator.usb.removeEventListener('disconnect', handleDisconnect);
		});
	});

	return (
		<div>
			<Show when={!isSupported()}>
				<div class="bg-red-50 border-l-4 border-red-400 p-4 mb-4">
					<p class="text-sm text-red-700">{error()}</p>
				</div>
			</Show>

			<Show when={isSupported()}>
				<Show when={error()}>
					<div class="bg-red-50 border-l-4 border-red-400 p-4 mb-4">
						<p class="text-sm text-red-700">{error()}</p>
					</div>
				</Show>

				<Show when={selectedDevice()}>
					<div class="bg-green-50 border-l-4 border-green-400 p-4">
						<div class="flex justify-between items-center">
							<div>
								<p class="text-sm font-medium text-green-800">Connected Device</p>
								<p class="text-sm text-green-700">{getDeviceName(selectedDevice()!)}</p>
								<Show when={selectedDevice()!.serialNumber}>
									<p class="text-xs text-green-600">Serial: {selectedDevice()!.serialNumber}</p>
								</Show>
							</div>
							<button
								onClick={disconnectDevice}
								class="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
							>
								Disconnect
							</button>
						</div>
					</div>
				</Show>

				<Show when={!selectedDevice()}>
					<button
						onClick={requestDevice}
						class="w-full px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors mb-4"
					>
						Connect New Device
					</button>

					<Show when={devices().length > 0}>
						<div>
							<p class="text-sm font-medium text-gray-700 mb-2">Previously Authorized Devices:</p>
							<div class="space-y-2">
								<For each={devices()}>
									{(deviceInfo) => (
										<button
											onClick={() => selectDevice(deviceInfo.device)}
											class="w-full text-left px-4 py-3 border border-gray-300 rounded hover:bg-gray-50 transition-colors"
										>
											<p class="font-medium text-gray-900">{deviceInfo.name}</p>
											<Show when={deviceInfo.device.serialNumber}>
												<p class="text-xs text-gray-500">Serial: {deviceInfo.device.serialNumber}</p>
											</Show>
										</button>
									)}
								</For>
							</div>
						</div>
					</Show>

					<Show when={devices().length === 0}>
						<p class="text-sm text-gray-500 text-center py-4">
							No previously authorized devices found. Click "Connect New Device" to get started.
						</p>
					</Show>
				</Show>
			</Show>
		</div>
	);
}

// ============ Read Info Inline ============
import {
	connectDAP,
	disconnectDAP,
	readDeviceInfo,
	readUICR,
	toCoreError,
	formatDeviceInfo,
	formatUICR,
	type DAPConnection,
	type DeviceInfo,
	type UICRRegisters,
	type CoreError,
} from '@sdcfw/core';
import ProgressBar from './ProgressBar';

interface ReadInfoInlineProps {
	selectedDevice: USBDevice | null;
}

function ReadInfoInline(props: ReadInfoInlineProps) {
	const [state, setState] = createSignal<'idle' | 'armed' | 'reading' | 'complete' | 'error'>('idle');
	const [progress, setProgress] = createSignal<string>('');
	const [error, setError] = createSignal<string>('');
	const [deviceInfo, setDeviceInfo] = createSignal<DeviceInfo | null>(null);
	const [uicr, setUicr] = createSignal<UICRRegisters | null>(null);

	const isDisabled = () => !props.selectedDevice || state() !== 'idle';

	const handleError = (coreErr: CoreError): boolean => {
		if (!coreErr.recoverable) {
			setState('error');
			setError(`Read failed: ${coreErr.message}`);
			return false;
		}
		return true;
	};

	const safeDisconnect = async (conn: DAPConnection | null) => {
		if (conn) await disconnectDAP(conn);
	};

	const arm = async () => {
		if (!props.selectedDevice) {
			setError('No device selected');
			return;
		}
		setState('armed');
		setProgress('Waiting for target connection...');
		setError('');
		setDeviceInfo(null);
		setUicr(null);

		let connection: DAPConnection | null = null;
		const maxAttempts = 60;
		let attempts = 0;

		while (state() === 'armed' && attempts < maxAttempts) {
			try {
				const result = await connectDAP(props.selectedDevice);
				if (!result.ok) {
					const shouldContinue = handleError(result.error);
					if (!shouldContinue) return;
					await new Promise(r => setTimeout(r, 500));
					attempts++;
					continue;
				}
				connection = result.value;
				break;
			} catch (err) {
				const coreErr = toCoreError(err);
				const shouldContinue = handleError(coreErr);
				if (!shouldContinue) return;
				await new Promise(r => setTimeout(r, 500));
				attempts++;
			}
		}

		if (!connection) {
			if (state() === 'armed') {
				setState('error');
				setError('Could not connect to target. Check your wiring and ensure the device is powered.');
			}
			return;
		}

		setState('reading');
		setProgress('Reading device info...');

		try {
			const infoResult = await readDeviceInfo(connection);
			if (!infoResult.ok) {
				handleError(infoResult.error);
				await safeDisconnect(connection);
				return;
			}
			setDeviceInfo(infoResult.value);

			setProgress('Reading UICR...');
			const uicrResult = await readUICR(connection);
			if (!uicrResult.ok) {
				handleError(uicrResult.error);
				await safeDisconnect(connection);
				return;
			}
			setUicr(uicrResult.value);

			setState('complete');
			setProgress('');
		} catch (err) {
			handleError(toCoreError(err));
		} finally {
			await safeDisconnect(connection);
		}
	};

	const reset = () => {
		setState('idle');
		setProgress('');
		setError('');
		setDeviceInfo(null);
		setUicr(null);
	};

	return (
		<div>
			<Show when={error()}>
				<div class="bg-red-50 border-l-4 border-red-400 p-4 mb-4">
					<p class="text-sm text-red-700">{error()}</p>
				</div>
			</Show>

			<Show when={state() === 'idle'}>
				<button
					onClick={arm}
					disabled={isDisabled()}
					class={`w-full px-4 py-2 rounded transition-colors ${
						isDisabled()
							? 'bg-gray-300 text-gray-500 cursor-not-allowed'
							: 'bg-blue-500 text-white hover:bg-blue-600'
					}`}
				>
					{props.selectedDevice ? 'Read Device Info' : 'Select a device first'}
				</button>
			</Show>

			<Show when={state() === 'armed' || state() === 'reading'}>
				<ProgressBar message={progress()} variant="blue" />
			</Show>

			<Show when={state() === 'complete' || state() === 'error'}>
				<Show when={deviceInfo() && uicr()}>
					<div class="space-y-4 mb-4">
						<div class="p-4 bg-gray-50 rounded">
							<h4 class="font-semibold mb-2">Device Information</h4>
							<pre class="text-xs font-mono whitespace-pre-wrap">{formatDeviceInfo(deviceInfo()!)}</pre>
						</div>
						<div class="p-4 bg-gray-50 rounded">
							<h4 class="font-semibold mb-2">UICR Configuration</h4>
							<pre class="text-xs font-mono whitespace-pre-wrap">{formatUICR(uicr()!)}</pre>
						</div>
					</div>
				</Show>
				<button onClick={reset} class="w-full px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors">
					Read Again
				</button>
			</Show>
		</div>
	);
}

// ============ Backup Inline ============
import { backup, type BackupResult } from '@sdcfw/core';
import { zipSync, strToU8 } from 'fflate';

interface BackupInlineProps {
	selectedDevice: USBDevice | null;
	onBackupComplete?: (backup: CompletedBackup) => void;
}

function parsePercent(message: string): number | undefined {
	const match = message.match(/(\d+)%/);
	return match?.[1] ? parseInt(match[1], 10) : undefined;
}

function BackupInline(props: BackupInlineProps) {
	const [state, setState] = createSignal<'idle' | 'armed' | 'reading-info' | 'backing-up' | 'verifying' | 'complete' | 'error'>('idle');
	const [error, setError] = createSignal<string>('');
	const [progress, setProgress] = createSignal<string>('');
	const [progressPercent, setProgressPercent] = createSignal<number | undefined>(undefined);
	const [deviceInfo, setDeviceInfo] = createSignal<DeviceInfo | null>(null);
	const [backupResult, setBackupResult] = createSignal<BackupResult | null>(null);
	const [verificationPassed, setVerificationPassed] = createSignal<boolean>(false);

	const isDisabled = () => !props.selectedDevice || state() !== 'idle';

	const updateProgress = (message: string, percent?: number) => {
		setProgress(message);
		setProgressPercent(percent ?? parsePercent(message));
	};

	const handleError = (coreErr: CoreError): boolean => {
		if (!coreErr.recoverable) {
			setState('error');
			setError(`Backup failed: ${coreErr.message}`);
			return false;
		}
		return true;
	};

	const safeDisconnect = async (conn: DAPConnection | null) => {
		if (conn) await disconnectDAP(conn);
	};

	const arm = async () => {
		if (!props.selectedDevice) return;
		setState('armed');
		updateProgress('Waiting for target connection...', 0);
		setError('');
		setDeviceInfo(null);
		setBackupResult(null);
		setVerificationPassed(false);

		let connection: DAPConnection | null = null;
		const maxAttempts = 60;
		let attempts = 0;

		while (state() === 'armed' && attempts < maxAttempts) {
			try {
				const result = await connectDAP(props.selectedDevice);
				if (!result.ok) {
					if (!handleError(result.error)) return;
					await new Promise(r => setTimeout(r, 500));
					attempts++;
					continue;
				}
				connection = result.value;
				break;
			} catch (err) {
				if (!handleError(toCoreError(err))) return;
				await new Promise(r => setTimeout(r, 500));
				attempts++;
			}
		}

		if (!connection) {
			if (state() === 'armed') {
				setState('error');
				setError('Could not connect to target. Check wiring and power.');
			}
			return;
		}

		setState('reading-info');
		updateProgress('Reading device info...', 5);

		try {
			const infoResult = await readDeviceInfo(connection);
			if (!infoResult.ok) {
				handleError(infoResult.error);
				await safeDisconnect(connection);
				return;
			}
			setDeviceInfo(infoResult.value);

			setState('backing-up');
			updateProgress('Starting backup...', 10);

			const firstBackup = await backup(connection, infoResult.value, (msg) => {
				const pct = parsePercent(msg);
				updateProgress(msg, pct ? 10 + pct * 0.4 : undefined);
			});
			if (!firstBackup.ok) {
				handleError(firstBackup.error);
				await safeDisconnect(connection);
				return;
			}

			setState('verifying');
			updateProgress('Verifying backup...', 55);

			const secondBackup = await backup(connection, infoResult.value, (msg) => {
				const pct = parsePercent(msg);
				updateProgress(`Verify: ${msg}`, pct ? 55 + pct * 0.4 : undefined);
			});
			if (!secondBackup.ok) {
				handleError(secondBackup.error);
				await safeDisconnect(connection);
				return;
			}

			updateProgress('Comparing backups...', 95);
			const flashMatch = firstBackup.value.flashData.length === secondBackup.value.flashData.length &&
				firstBackup.value.flashData.every((b, i) => b === secondBackup.value.flashData[i]);
			const uicrMatch = firstBackup.value.uicrData.length === secondBackup.value.uicrData.length &&
				firstBackup.value.uicrData.every((b, i) => b === secondBackup.value.uicrData[i]);

			if (!flashMatch || !uicrMatch) {
				setState('error');
				setError('Verification failed: backup data does not match. Please try again.');
				await safeDisconnect(connection);
				return;
			}

			setVerificationPassed(true);
			setBackupResult(firstBackup.value);

			const completedBackup: CompletedBackup = {
				flashData: firstBackup.value.flashData,
				uicrData: firstBackup.value.uicrData,
				deviceInfo: infoResult.value,
				timestamp: new Date(),
			};
			props.onBackupComplete?.(completedBackup);

			setState('complete');
			updateProgress('Backup complete!', 100);
		} catch (err) {
			handleError(toCoreError(err));
		} finally {
			await safeDisconnect(connection);
		}
	};

	const downloadBackup = () => {
		const result = backupResult();
		const info = deviceInfo();
		if (!result || !info) return;

		const metadata = {
			timestamp: new Date().toISOString(),
			device: { part: info.part, flash: info.flash, ram: info.ram },
			sizes: { flash: result.flashData.length, uicr: result.uicrData.length },
		};

		const zipData = zipSync({
			'flash.bin': result.flashData,
			'uicr.bin': result.uicrData,
			'metadata.json': strToU8(JSON.stringify(metadata, null, 2)),
		});

		const blob = new Blob([zipData], { type: 'application/zip' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `nrf52-backup-${new Date().toISOString().split('T')[0]}.zip`;
		a.click();
		URL.revokeObjectURL(url);
	};

	const reset = () => {
		setState('idle');
		setProgress('');
		setProgressPercent(undefined);
		setError('');
		setDeviceInfo(null);
		setBackupResult(null);
		setVerificationPassed(false);
	};

	const getVariant = () => {
		const s = state();
		if (s === 'error') return 'red';
		if (s === 'complete') return 'green';
		if (s === 'verifying') return 'orange';
		return 'blue';
	};

	return (
		<div>
			<Show when={error()}>
				<div class="bg-red-50 border-l-4 border-red-400 p-4 mb-4">
					<p class="text-sm text-red-700">{error()}</p>
				</div>
			</Show>

			<Show when={state() === 'idle'}>
				<button
					onClick={arm}
					disabled={isDisabled()}
					class={`w-full px-4 py-2 rounded transition-colors ${
						isDisabled()
							? 'bg-gray-300 text-gray-500 cursor-not-allowed'
							: 'bg-orange-500 text-white hover:bg-orange-600'
					}`}
				>
					{props.selectedDevice ? 'Start Backup' : 'Select a device first'}
				</button>
			</Show>

			<Show when={state() !== 'idle' && state() !== 'complete' && state() !== 'error'}>
				<ProgressBar message={progress()} percent={progressPercent()} variant={getVariant()} />
			</Show>

			<Show when={state() === 'complete'}>
				<div class="space-y-4">
					<div class="bg-green-50 border-l-4 border-green-400 p-4">
						<p class="text-sm text-green-700">
							<strong>Backup verified successfully!</strong> Your firmware has been backed up and verified.
						</p>
					</div>
					<Show when={deviceInfo()}>
						<div class="p-4 bg-gray-50 rounded">
							<h4 class="font-semibold mb-2">Backed Up Device</h4>
							<pre class="text-xs font-mono whitespace-pre-wrap">{formatDeviceInfo(deviceInfo()!)}</pre>
						</div>
					</Show>
					<div class="flex gap-2">
						<button onClick={downloadBackup} class="flex-1 px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 transition-colors">
							Download Backup ZIP
						</button>
						<button onClick={reset} class="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors">
							Reset
						</button>
					</div>
				</div>
			</Show>

			<Show when={state() === 'error'}>
				<button onClick={reset} class="w-full px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors">
					Try Again
				</button>
			</Show>
		</div>
	);
}

// ============ Restore Inline ============
import { erase, restore } from '@sdcfw/core';
import { unzipSync } from 'fflate';

interface RestoreInlineProps {
	selectedDevice: USBDevice | null;
	lastBackup?: CompletedBackup | null;
}

interface BackupFiles {
	flashData: Uint8Array;
	uicrData: Uint8Array;
	metadata?: {
		timestamp?: string;
		device?: { part?: string; flash?: number; ram?: number };
		sizes?: { flash?: number; uicr?: number };
	};
}

function RestoreInline(props: RestoreInlineProps) {
	const [state, setState] = createSignal<'idle' | 'file-selected' | 'armed' | 'erasing' | 'restoring' | 'complete' | 'error'>('idle');
	const [error, setError] = createSignal<string>('');
	const [progress, setProgress] = createSignal<string>('');
	const [progressPercent, setProgressPercent] = createSignal<number | undefined>(undefined);
	const [backupFiles, setBackupFiles] = createSignal<BackupFiles | null>(null);
	const [verifyAfterRestore, setVerifyAfterRestore] = createSignal(true);

	const isDisabled = () => !props.selectedDevice;

	const updateProgress = (message: string, percent?: number) => {
		setProgress(message);
		setProgressPercent(percent ?? parsePercent(message));
	};

	const handleError = (coreErr: CoreError): boolean => {
		if (!coreErr.recoverable) {
			setState('error');
			setError(`Restore failed: ${coreErr.message}`);
			return false;
		}
		return true;
	};

	const safeDisconnect = async (conn: DAPConnection | null) => {
		if (conn) await disconnectDAP(conn);
	};

	const handleFileSelect = async (e: Event) => {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		try {
			const arrayBuffer = await file.arrayBuffer();
			const zipData = new Uint8Array(arrayBuffer);
			const unzipped = unzipSync(zipData);

			if (!unzipped['flash.bin'] || !unzipped['uicr.bin']) {
				setError('Invalid backup: missing flash.bin or uicr.bin');
				return;
			}

			let metadata;
			if (unzipped['metadata.json']) {
				try {
					const decoder = new TextDecoder();
					metadata = JSON.parse(decoder.decode(unzipped['metadata.json']));
				} catch {}
			}

			setBackupFiles({
				flashData: unzipped['flash.bin'],
				uicrData: unzipped['uicr.bin'],
				metadata,
			});
			setState('file-selected');
			setError('');
		} catch (err) {
			setError(`Failed to read backup file: ${err instanceof Error ? err.message : 'Unknown error'}`);
		}
	};

	const usePreviousBackup = () => {
		if (!props.lastBackup) return;
		setBackupFiles({
			flashData: props.lastBackup.flashData,
			uicrData: props.lastBackup.uicrData,
			metadata: {
				timestamp: props.lastBackup.timestamp.toISOString(),
				device: {
					part: props.lastBackup.deviceInfo.part,
					flash: props.lastBackup.deviceInfo.flash,
					ram: props.lastBackup.deviceInfo.ram,
				},
			},
		});
		setState('file-selected');
		setError('');
	};

	const startRestore = async () => {
		if (!props.selectedDevice || !backupFiles()) return;
		setState('armed');
		updateProgress('Waiting for target connection...', 0);
		setError('');

		let connection: DAPConnection | null = null;
		const maxAttempts = 60;
		let attempts = 0;

		while (state() === 'armed' && attempts < maxAttempts) {
			try {
				const result = await connectDAP(props.selectedDevice);
				if (!result.ok) {
					if (!handleError(result.error)) return;
					await new Promise(r => setTimeout(r, 500));
					attempts++;
					continue;
				}
				connection = result.value;
				break;
			} catch (err) {
				if (!handleError(toCoreError(err))) return;
				await new Promise(r => setTimeout(r, 500));
				attempts++;
			}
		}

		if (!connection) {
			if (state() === 'armed') {
				setState('error');
				setError('Could not connect to target. Check wiring and power.');
			}
			return;
		}

		try {
			setState('erasing');
			updateProgress('Erasing chip...', 10);

			const eraseResult = await erase(connection);
			if (!eraseResult.ok) {
				handleError(eraseResult.error);
				await safeDisconnect(connection);
				return;
			}

			setState('restoring');
			updateProgress('Restoring firmware...', 20);

			const files = backupFiles()!;
			const restoreResult = await restore(
				connection,
				files.flashData,
				files.uicrData,
				verifyAfterRestore(),
				(msg) => {
					const pct = parsePercent(msg);
					updateProgress(msg, pct ? 20 + pct * 0.8 : undefined);
				}
			);
			if (!restoreResult.ok) {
				handleError(restoreResult.error);
				await safeDisconnect(connection);
				return;
			}

			setState('complete');
			updateProgress('Restore complete!', 100);
		} catch (err) {
			handleError(toCoreError(err));
		} finally {
			await safeDisconnect(connection);
		}
	};

	const reset = () => {
		setState('idle');
		setProgress('');
		setProgressPercent(undefined);
		setError('');
		setBackupFiles(null);
	};

	const getVariant = () => {
		const s = state();
		if (s === 'error') return 'red';
		if (s === 'complete') return 'green';
		if (s === 'erasing') return 'orange';
		return 'blue';
	};

	return (
		<div>
			<Show when={error()}>
				<div class="bg-red-50 border-l-4 border-red-400 p-4 mb-4">
					<p class="text-sm text-red-700">{error()}</p>
				</div>
			</Show>

			<Show when={state() === 'idle'}>
				<div class="space-y-4">
					<div class="bg-red-50 border-l-4 border-red-400 p-4">
						<p class="text-sm text-red-700">
							<strong>Warning:</strong> Restoring will erase your device and replace the firmware. Make sure you have a valid backup.
						</p>
					</div>

					<div class="space-y-2">
						<label class="block">
							<span class="text-sm font-medium text-gray-700">Select backup ZIP file:</span>
							<input
								type="file"
								accept=".zip"
								onChange={handleFileSelect}
								class="mt-1 block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
							/>
						</label>

						<Show when={props.lastBackup}>
							<button
								onClick={usePreviousBackup}
								class="w-full px-4 py-2 border border-blue-500 text-blue-500 rounded hover:bg-blue-50 transition-colors"
							>
								Use Previous Backup (from this session)
							</button>
						</Show>
					</div>
				</div>
			</Show>

			<Show when={state() === 'file-selected'}>
				<div class="space-y-4">
					<div class="p-4 bg-gray-50 rounded">
						<h4 class="font-semibold mb-2">Selected Backup</h4>
						<Show when={backupFiles()?.metadata}>
							<p class="text-sm text-gray-600">
								Device: {backupFiles()?.metadata?.device?.part || 'Unknown'}<br />
								Flash: {backupFiles()?.flashData.length.toLocaleString()} bytes<br />
								UICR: {backupFiles()?.uicrData.length.toLocaleString()} bytes
							</p>
						</Show>
						<Show when={!backupFiles()?.metadata}>
							<p class="text-sm text-gray-600">
								Flash: {backupFiles()?.flashData.length.toLocaleString()} bytes<br />
								UICR: {backupFiles()?.uicrData.length.toLocaleString()} bytes
							</p>
						</Show>
					</div>

					<label class="flex items-center space-x-2">
						<input
							type="checkbox"
							checked={verifyAfterRestore()}
							onChange={(e) => setVerifyAfterRestore(e.target.checked)}
							class="rounded"
						/>
						<span class="text-sm text-gray-700">Verify after restore (recommended)</span>
					</label>

					<div class="flex gap-2">
						<button
							onClick={startRestore}
							disabled={isDisabled()}
							class={`flex-1 px-4 py-2 rounded transition-colors ${
								isDisabled()
									? 'bg-gray-300 text-gray-500 cursor-not-allowed'
									: 'bg-red-500 text-white hover:bg-red-600'
							}`}
						>
							{props.selectedDevice ? 'Start Restore' : 'Select a device first'}
						</button>
						<button onClick={reset} class="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors">
							Cancel
						</button>
					</div>
				</div>
			</Show>

			<Show when={state() === 'armed' || state() === 'erasing' || state() === 'restoring'}>
				<ProgressBar message={progress()} percent={progressPercent()} variant={getVariant()} />
			</Show>

			<Show when={state() === 'complete'}>
				<div class="space-y-4">
					<div class="bg-green-50 border-l-4 border-green-400 p-4">
						<p class="text-sm text-green-700">
							<strong>Restore complete!</strong> Your firmware has been successfully restored.
						</p>
					</div>
					<button onClick={reset} class="w-full px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors">
						Done
					</button>
				</div>
			</Show>

			<Show when={state() === 'error'}>
				<button onClick={reset} class="w-full px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors">
					Try Again
				</button>
			</Show>
		</div>
	);
}
