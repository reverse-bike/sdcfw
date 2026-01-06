/// <reference types="w3c-web-usb" />
import { createSignal, createEffect, onCleanup, Show } from 'solid-js';
import {
	connectDAP,
	disconnectDAP,
	readDeviceInfo,
	backup,
	toCoreError,
	type DAPConnection,
	type DeviceInfo,
	type BackupResult,
	type CoreError,
} from '@sdcfw/core';
import { zipSync, strToU8 } from 'fflate';
import ProgressBar from './ProgressBar';
import { playSuccessSound, playErrorSound, playConnectedSound } from './ui';

export interface CompletedBackup {
	flashData: Uint8Array;
	uicrData: Uint8Array;
	deviceInfo: DeviceInfo;
	timestamp: Date;
}

interface BackupProps {
	selectedDevice: USBDevice | null;
	onBackupComplete?: (backup: CompletedBackup) => void;
	inline?: boolean;
}

type BackupState = 'idle' | 'armed' | 'reading-info' | 'backing-up' | 'verifying' | 'complete' | 'error';

// Parse percentage from progress messages like "Reading: 50%" or "Verifying: 75%"
function parsePercent(message: string): number | undefined {
	const match = message.match(/(\d+)%/);
	return match?.[1] ? parseInt(match[1], 10) : undefined;
}

export default function Backup(props: BackupProps) {
	const [state, setState] = createSignal<BackupState>('idle');
	const [error, setError] = createSignal<string>('');
	const [progress, setProgress] = createSignal<string>('');
	const [progressPercent, setProgressPercent] = createSignal<number | undefined>(undefined);
	const [deviceInfo, setDeviceInfo] = createSignal<DeviceInfo | null>(null);
	const [backupResult, setBackupResult] = createSignal<BackupResult | null>(null);
	const [verificationPassed, setVerificationPassed] = createSignal<boolean>(false);
	const [connection, setConnection] = createSignal<DAPConnection | null>(null);
	const [backupDownloaded, setBackupDownloaded] = createSignal<boolean>(false);

	// Warn user if they try to leave with an undownloaded backup
	createEffect(() => {
		const hasUndownloadedBackup = state() === 'complete' && backupResult() && !backupDownloaded();

		const handleBeforeUnload = (e: BeforeUnloadEvent) => {
			if (hasUndownloadedBackup) {
				e.preventDefault();
				return;
			}
		};

		if (hasUndownloadedBackup) {
			window.addEventListener('beforeunload', handleBeforeUnload);
		}

		onCleanup(() => {
			window.removeEventListener('beforeunload', handleBeforeUnload);
		});
	});

	const isDisabled = () => !props.selectedDevice || state() !== 'idle';

	// Helper to update progress with optional percent parsing
	const updateProgress = (message: string, percent?: number) => {
		setProgress(message);
		setProgressPercent(percent ?? parsePercent(message));
	};

	// Helper to handle errors - returns true if recoverable and should retry
	const handleError = (coreErr: CoreError): boolean => {
		console.log('Error:', coreErr.message, 'recoverable:', coreErr.recoverable);
		if (!coreErr.recoverable) {
			setState('error');
			setError(`Backup failed: ${coreErr.message}`);
			playErrorSound();
			return false;
		}
		return true;
	};

	// Helper to safely disconnect
	const safeDisconnect = async (conn: DAPConnection | null) => {
		if (conn) {
			await disconnectDAP(conn); // Ignore result - best effort
		}
	};

	// Helper to reconnect after a temporary disconnection
	const reconnect = async (): Promise<DAPConnection | null> => {
		const currentConn = connection();
		await safeDisconnect(currentConn);
		setConnection(null);

		if (!props.selectedDevice) return null;

		const retryDelayMs = 500;
		while (state() !== 'idle' && state() !== 'error' && state() !== 'complete') {
			setProgress('Reconnecting to target...');
			const result = await connectDAP(props.selectedDevice);
			if (result.ok) {
				setConnection(result.value);
				playConnectedSound();
				return result.value;
			}
			if (result.error.recoverable) {
				console.log('Reconnect attempt failed, retrying...');
				await new Promise(resolve => setTimeout(resolve, retryDelayMs));
			} else {
				handleError(result.error);
				return null;
			}
		}
		return null;
	};

	const arm = async () => {
		if (!props.selectedDevice) {
			setError('No device selected');
			return;
		}

		setState('armed');
		setError('');
		setProgress('Armed - connect target to begin backup...');

		// Poll for target connection - retry both connect and device info
		let info: DeviceInfo | null = null;
		let conn: DAPConnection | null = null;
		const retryDelayMs = 500;

		while (state() === 'armed' || state() === 'reading-info') {
			// Try to connect if not connected
			if (!conn) {
				setProgress('Waiting for target...');
				const connectResult = await connectDAP(props.selectedDevice);
				if (!connectResult.ok) {
					if (connectResult.error.recoverable) {
						console.log('Target not ready:', connectResult.error.message);
						await new Promise(resolve => setTimeout(resolve, retryDelayMs));
						continue;
					}
					handleError(connectResult.error);
					return;
				}
				conn = connectResult.value;
				setConnection(conn);
				playConnectedSound();
			}

			// Try to read device info
			setState('reading-info');
			setProgress('Reading device info...');
			try {
				info = await readDeviceInfo(conn.dap);
				setDeviceInfo(info);
				setProgress('Device info read successfully');
				break; // Success! Exit the polling loop
			} catch (err) {
				const coreErr = toCoreError(err);
				console.log('Target not ready:', coreErr.message);

				if (coreErr.recoverable) {
					// Disconnect and retry - target isn't connected yet
					await safeDisconnect(conn);
					conn = null;
					setConnection(null);
					setState('armed');
					setProgress('Waiting for target connection...');
					await new Promise(resolve => setTimeout(resolve, retryDelayMs));
					// Continue polling
				} else {
					handleError(coreErr);
					await safeDisconnect(conn);
					setConnection(null);
					return;
				}
			}
		}

		// Check if we were cancelled
		if (!info || !conn) {
			await safeDisconnect(conn);
			setConnection(null);
			return;
		}

		// Perform backup with retry on temporary disconnection
		setState('backing-up');
		let result: BackupResult | null = null;
		while (state() === 'backing-up') {
			updateProgress('Starting backup...', 0);
			const backupRes = await backup(conn, (message) => {
				updateProgress(message);
			});
			if (backupRes.ok) {
				result = backupRes.value;
				setBackupResult(result);
				break; // Success!
			}
			if (backupRes.error.recoverable) {
				console.log('Backup interrupted, reconnecting...');
				setProgress('Connection lost, reconnecting...');
				playErrorSound();
				const newConn = await reconnect();
				if (!newConn) return; // Cancelled or non-recoverable
				conn = newConn;
				// Restart backup from beginning
			} else {
				handleError(backupRes.error);
				await safeDisconnect(conn);
				setConnection(null);
				return;
			}
		}

		if (!result || state() !== 'backing-up') return; // Cancelled

		// Verify backup with retry on temporary disconnection
		setState('verifying');
		let verifyResult: BackupResult | null = null;
		while (state() === 'verifying') {
			updateProgress('Verifying backup...', 0);
			const verifyRes = await backup(conn, (message) => {
				updateProgress(`Verification: ${message}`);
			});
			if (verifyRes.ok) {
				verifyResult = verifyRes.value;
				break; // Success!
			}
			if (verifyRes.error.recoverable) {
				console.log('Verification interrupted, reconnecting...');
				setProgress('Connection lost, reconnecting...');
				playErrorSound();
				const newConn = await reconnect();
				if (!newConn) return; // Cancelled or non-recoverable
				conn = newConn;
				// Restart verification from beginning
			} else {
				handleError(verifyRes.error);
				await safeDisconnect(conn);
				setConnection(null);
				return;
			}
		}

		if (!verifyResult || state() !== 'verifying') return; // Cancelled

		// Compare backups - compare Uint8Arrays byte by byte
		const compareUint8Arrays = (a: Uint8Array, b: Uint8Array): boolean => {
			if (a.length !== b.length) return false;
			for (let i = 0; i < a.length; i++) {
				if (a[i] !== b[i]) return false;
			}
			return true;
		};

		const flashMatch = compareUint8Arrays(result.flashData, verifyResult.flashData);
		const uicrMatch = compareUint8Arrays(result.uicrData, verifyResult.uicrData);

		if (flashMatch && uicrMatch) {
			setVerificationPassed(true);
			setProgress('');
			setProgressPercent(undefined);
			setState('complete');
			playSuccessSound();
			// Notify parent of completed backup
			if (props.onBackupComplete && info) {
				props.onBackupComplete({
					flashData: result.flashData,
					uicrData: result.uicrData,
					deviceInfo: info,
					timestamp: new Date(),
				});
			}
		} else {
			setVerificationPassed(false);
			setError('Backup verification failed: Data mismatch');
			setState('error');
			playErrorSound();
		}

		// Disconnect
		await safeDisconnect(conn);
		setConnection(null);
	};

	const unarm = async () => {
		const conn = connection();
		await safeDisconnect(conn);
		setConnection(null);
		reset();
	};

	const reset = () => {
		setState('idle');
		setError('');
		setProgress('');
		setProgressPercent(undefined);
		setDeviceInfo(null);
		setBackupResult(null);
		setVerificationPassed(false);
		setBackupDownloaded(false);
	};

	const downloadBackup = async () => {
		const result = backupResult();
		const info = deviceInfo();
		if (!result || !info) return;

		try {
			// Prepare metadata
			const metadata = {
				timestamp: new Date().toISOString(),
				device: {
					part: `nRF${info.part.toString(16).toUpperCase()}`,
					variant: info.variant,
					package: info.package,
					ram: info.ram,
					flash: info.flash,
					deviceId: info.deviceId,
				},
				sizes: {
					flash: result.flashData.length,
					uicr: result.uicrData.length,
				},
			};

			// Create zip file with fflate
			const zipData = zipSync({
				'flash.bin': new Uint8Array(result.flashData),
				'uicr.bin': new Uint8Array(result.uicrData),
				'metadata.json': strToU8(JSON.stringify(metadata, null, 2)),
			});

			// Create download link - convert to ArrayBuffer for Blob compatibility
			const zipBuffer = zipData.buffer.slice(zipData.byteOffset, zipData.byteOffset + zipData.byteLength) as ArrayBuffer;
			const blob = new Blob([zipBuffer], { type: 'application/zip' });
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
			a.download = `nrf52-backup-${timestamp}.zip`;
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
			URL.revokeObjectURL(url);
			setBackupDownloaded(true);
		} catch (err) {
			console.error('Failed to create download:', err);
			setError(`Failed to create download: ${err instanceof Error ? err.message : 'Unknown error'}`);
		}
	};

	const formatDeviceInfo = (info: DeviceInfo) => {
		const partStr = `nRF${info.part.toString(16).toUpperCase()}`;
		const variantBuf = new ArrayBuffer(4);
		new DataView(variantBuf).setUint32(0, info.variant, false);
		const variantStr = new TextDecoder().decode(variantBuf).replace(/\0/g, '');

		return {
			part: partStr,
			variant: variantStr,
			ram: `${info.ram} kB`,
			flash: `${info.flash} kB`,
			deviceId: `0x${info.deviceId[1]?.toString(16).padStart(8, '0')}${info.deviceId[0]?.toString(16).padStart(8, '0')}`,
		};
	};

	const content = (
		<>
			<Show when={error()}>
				<div class="bg-red-50 border-l-4 border-red-400 p-4 mb-4">
					<p class="text-sm text-red-700">{error()}</p>
				</div>
			</Show>

			<Show when={progress()}>
				<div class="mb-4">
					<ProgressBar
						message={progress()}
						percent={progressPercent()}
						variant="green"
					/>
				</div>
			</Show>

			<Show when={state() === 'idle'}>
				<button
					onClick={arm}
					disabled={isDisabled()}
					class="w-full px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
				>
					{props.selectedDevice ? 'Arm Backup' : 'Select a device first'}
				</button>
			</Show>

			<Show when={state() !== 'idle' && state() !== 'complete' && state() !== 'error'}>
				<button
					onClick={unarm}
					class="w-full px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
				>
					Cancel / Unarm
				</button>
			</Show>

			<Show when={deviceInfo()}>
				<div class="mt-4 p-4 bg-gray-50 rounded">
					<h3 class="font-semibold mb-2">Device Information</h3>
					<div class="text-sm space-y-1">
						<div class="flex justify-between">
							<span class="text-gray-600">Part:</span>
							<span class="font-mono">{formatDeviceInfo(deviceInfo()!).part}</span>
						</div>
						<div class="flex justify-between">
							<span class="text-gray-600">Variant:</span>
							<span class="font-mono">{formatDeviceInfo(deviceInfo()!).variant}</span>
						</div>
						<div class="flex justify-between">
							<span class="text-gray-600">RAM:</span>
							<span class="font-mono">{formatDeviceInfo(deviceInfo()!).ram}</span>
						</div>
						<div class="flex justify-between">
							<span class="text-gray-600">Flash:</span>
							<span class="font-mono">{formatDeviceInfo(deviceInfo()!).flash}</span>
						</div>
						<div class="flex justify-between">
							<span class="text-gray-600">Device ID:</span>
							<span class="font-mono text-xs">{formatDeviceInfo(deviceInfo()!).deviceId}</span>
						</div>
					</div>
				</div>
			</Show>

			<Show when={state() === 'complete' && backupResult()}>
				<div class="mt-4 p-4 bg-green-50 border border-green-200 rounded">
					<h3 class="font-semibold text-green-800 mb-2">Backup Complete!</h3>
					<div class="text-sm space-y-1 mb-4">
						<div class="flex justify-between">
							<span class="text-gray-600">Flash Size:</span>
							<span class="font-mono">{(backupResult()!.flashData.length / 1024).toFixed(1)} kB</span>
						</div>
						<div class="flex justify-between">
							<span class="text-gray-600">UICR Size:</span>
							<span class="font-mono">{backupResult()!.uicrData.length} bytes</span>
						</div>
						<div class="flex justify-between">
							<span class="text-gray-600">Verification:</span>
							<span class={verificationPassed() ? 'text-green-600 font-semibold' : 'text-red-600 font-semibold'}>
								{verificationPassed() ? 'Passed ✓' : 'Failed ✗'}
							</span>
						</div>
					</div>
					<div class="flex gap-2">
						<button
							onClick={downloadBackup}
							class="flex-1 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
						>
							Download Backup (.zip)
						</button>
						<button
							onClick={reset}
							class="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors"
						>
							Reset
						</button>
					</div>
				</div>
			</Show>

			<Show when={state() === 'error'}>
				<div class="mt-4">
					<button
						onClick={reset}
						class="w-full px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors"
					>
						Reset
					</button>
				</div>
			</Show>
		</>
	);

	if (props.inline) {
		return <div>{content}</div>;
	}

	return (
		<div class="bg-white border border-gray-200 rounded-lg p-6 mb-6">
			<h2 class="text-2xl font-semibold mb-4">Backup Tool</h2>

			<Show when={!props.selectedDevice}>
				<div class="bg-gray-50 border border-gray-200 rounded p-4 mb-4">
					<p class="text-sm text-gray-600">Please select a USB probe device first.</p>
				</div>
			</Show>

			<Show when={props.selectedDevice}>
				<p class="text-sm text-gray-600 mb-3">
					Backup the firmware from your device. This will create a complete backup of flash memory and UICR configuration.
				</p>
				{content}
			</Show>
		</div>
	);
}
