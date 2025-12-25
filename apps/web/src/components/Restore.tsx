/// <reference types="w3c-web-usb" />
import { createSignal, Show } from 'solid-js';
import {
	connectDAP,
	disconnectDAP,
	erase,
	restore,
	formatDeviceInfo,
	type DAPConnection,
	type CoreError,
} from '@sdcfw/core';
import { unzipSync } from 'fflate';
import type { CompletedBackup } from './Backup';
import ProgressBar from './ProgressBar';

// Parse percentage from progress messages like "Flashing: 50%" or "Verifying: 75%"
function parsePercent(message: string): number | undefined {
	const match = message.match(/(\d+)%/);
	return match?.[1] ? parseInt(match[1], 10) : undefined;
}

interface RestoreProps {
	selectedDevice: USBDevice | null;
	lastBackup?: CompletedBackup | null;
	inline?: boolean;
}

type RestoreState = 'idle' | 'file-selected' | 'armed' | 'erasing' | 'restoring' | 'complete' | 'error';

interface BackupFiles {
	flashData: Uint8Array;
	uicrData: Uint8Array;
	metadata?: {
		timestamp?: string;
		device?: {
			part?: string;
			flash?: number;
			ram?: number;
		};
		sizes?: {
			flash?: number;
			uicr?: number;
		};
	};
}

type BackupSource = 'file' | 'previous';

export default function Restore(props: RestoreProps) {
	const [state, setState] = createSignal<RestoreState>('idle');
	const [error, setError] = createSignal<string>('');
	const [progress, setProgress] = createSignal<string>('');
	const [progressPercent, setProgressPercent] = createSignal<number | undefined>(undefined);
	const [backupFiles, setBackupFiles] = createSignal<BackupFiles | null>(null);
	const [fileName, setFileName] = createSignal<string>('');
	const [backupSource, setBackupSource] = createSignal<BackupSource | null>(null);
	const [verifyEnabled, setVerifyEnabled] = createSignal<boolean>(true);
	const [connection, setConnection] = createSignal<DAPConnection | null>(null);

	const isDisabled = () => !props.selectedDevice || state() === 'restoring';

	// Helper to update progress with optional percent parsing
	const updateProgress = (message: string, percent?: number) => {
		setProgress(message);
		setProgressPercent(percent ?? parsePercent(message));
	};

	const handleError = (coreErr: CoreError): boolean => {
		console.log('Error:', coreErr.message, 'recoverable:', coreErr.recoverable);
		if (!coreErr.recoverable) {
			setState('error');
			setError(`Restore failed: ${coreErr.message}`);
			return false;
		}
		return true;
	};

	const safeDisconnect = async (conn: DAPConnection | null) => {
		if (conn) {
			await disconnectDAP(conn);
		}
	};

	const handleFileSelect = async (event: Event) => {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		setError('');
		setProgress('Reading backup file...');

		try {
			const arrayBuffer = await file.arrayBuffer();
			const zipData = new Uint8Array(arrayBuffer);

			// Unzip the backup
			const unzipped = unzipSync(zipData);

			// Check for required files
			const flashData = unzipped['flash.bin'];
			const uicrData = unzipped['uicr.bin'];

			if (!flashData) {
				throw new Error('Backup file missing flash.bin');
			}
			if (!uicrData) {
				throw new Error('Backup file missing uicr.bin');
			}

			// Try to read metadata if present
			let metadata;
			const metadataRaw = unzipped['metadata.json'];
			if (metadataRaw) {
				try {
					const metadataStr = new TextDecoder().decode(metadataRaw);
					metadata = JSON.parse(metadataStr);
				} catch {
					// Metadata is optional, ignore parse errors
				}
			}

			setBackupFiles({
				flashData,
				uicrData,
				metadata,
			});
			setFileName(file.name);
			setBackupSource('file');
			setState('file-selected');
			setProgress('');
		} catch (err) {
			setError(`Failed to read backup: ${err instanceof Error ? err.message : 'Unknown error'}`);
			setState('error');
			setProgress('');
		}
	};

	const usePreviousBackup = () => {
		if (!props.lastBackup) return;

		const info = formatDeviceInfo(props.lastBackup.deviceInfo);
		setBackupFiles({
			flashData: props.lastBackup.flashData,
			uicrData: props.lastBackup.uicrData,
			metadata: {
				timestamp: props.lastBackup.timestamp.toISOString(),
				device: {
					part: info.part,
					flash: props.lastBackup.deviceInfo.flash,
					ram: props.lastBackup.deviceInfo.ram,
				},
				sizes: {
					flash: props.lastBackup.flashData.length,
					uicr: props.lastBackup.uicrData.length,
				},
			},
		});
		setFileName(`Previous backup (${info.part})`);
		setBackupSource('previous');
		setState('file-selected');
	};

	const arm = async () => {
		if (!props.selectedDevice || !backupFiles()) {
			setError('No device or backup file selected');
			return;
		}

		setState('armed');
		setError('');
		setProgress('Armed - connect target to begin restore...');

		const retryDelayMs = 500;
		let conn: DAPConnection | null = null;

		// Poll for target connection
		while (state() === 'armed') {
			if (!conn) {
				setProgress('Waiting for target...');
				const connectResult = await connectDAP(props.selectedDevice);
				if (!connectResult.ok) {
					if (connectResult.error.recoverable) {
						await new Promise(resolve => setTimeout(resolve, retryDelayMs));
						continue;
					}
					handleError(connectResult.error);
					return;
				}
				conn = connectResult.value;
				setConnection(conn);
			}

			// Target connected, start erase
			setState('erasing');
			updateProgress('Erasing chip...');

			const eraseResult = await erase(conn, (message) => updateProgress(message));

			if (!eraseResult.ok) {
				if (eraseResult.error.recoverable) {
					await safeDisconnect(conn);
					conn = null;
					setConnection(null);
					setState('armed');
					updateProgress('Connection lost, waiting for target...');
					await new Promise(resolve => setTimeout(resolve, retryDelayMs));
					continue;
				}
				handleError(eraseResult.error);
				await safeDisconnect(conn);
				setConnection(null);
				return;
			}

			// Erase complete, now restore
			setState('restoring');
			updateProgress('Starting restore...', 0);

			const files = backupFiles()!;
			const result = await restore(
				conn,
				files.flashData,
				files.uicrData,
				{ verify: verifyEnabled() },
				(message) => updateProgress(message)
			);

			if (result.ok) {
				setState('complete');
				setProgress('');
				setProgressPercent(undefined);
			} else {
				if (result.error.recoverable) {
					// Disconnect and retry from beginning (need to erase again)
					await safeDisconnect(conn);
					conn = null;
					setConnection(null);
					setState('armed');
					updateProgress('Connection lost, waiting for target...');
					await new Promise(resolve => setTimeout(resolve, retryDelayMs));
					continue;
				}
				handleError(result.error);
			}

			await safeDisconnect(conn);
			setConnection(null);
			return;
		}

		// Cancelled
		await safeDisconnect(conn);
		setConnection(null);
	};

	const unarm = async () => {
		const conn = connection();
		await safeDisconnect(conn);
		setConnection(null);
		setState('file-selected');
		setProgress('');
		setError('');
	};

	const reset = () => {
		setState('idle');
		setError('');
		setProgress('');
		setProgressPercent(undefined);
		setBackupFiles(null);
		setFileName('');
		setBackupSource(null);
	};

	const formatSize = (bytes: number): string => {
		if (bytes >= 1024) {
			return `${(bytes / 1024).toFixed(1)} kB`;
		}
		return `${bytes} bytes`;
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
						variant="orange"
					/>
				</div>
			</Show>

			<Show when={state() === 'idle'}>
				<div class="space-y-4">
					<Show when={props.lastBackup}>
						<div class="p-4 bg-green-50 border border-green-200 rounded">
							<h3 class="font-semibold text-green-800 mb-2">Previous Backup Available</h3>
							<div class="text-sm space-y-1 mb-3">
								<div class="flex justify-between">
									<span class="text-gray-600">Device:</span>
									<span class="font-mono">{formatDeviceInfo(props.lastBackup!.deviceInfo).part}</span>
								</div>
								<div class="flex justify-between">
									<span class="text-gray-600">Flash Size:</span>
									<span class="font-mono">{formatSize(props.lastBackup!.flashData.length)}</span>
								</div>
								<div class="flex justify-between">
									<span class="text-gray-600">Backup Time:</span>
									<span class="font-mono text-xs">{props.lastBackup!.timestamp.toLocaleString()}</span>
								</div>
							</div>
							<button
								onClick={usePreviousBackup}
								class="w-full px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 transition-colors"
							>
								Use Previous Backup
							</button>
						</div>
						<div class="text-center text-sm text-gray-500">— or —</div>
					</Show>
					<div>
						<label class="block text-sm font-medium text-gray-700 mb-2">
							Select Backup File (.zip)
						</label>
						<input
							type="file"
							accept=".zip"
							onChange={handleFileSelect}
							class="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
						/>
					</div>
				</div>
			</Show>

			<Show when={state() === 'file-selected' && backupFiles()}>
				<div class="space-y-4">
					<div class="p-4 bg-gray-50 rounded">
						<h3 class="font-semibold mb-2">Backup File</h3>
						<div class="text-sm space-y-1">
							<div class="flex justify-between">
								<span class="text-gray-600">File:</span>
								<span class="font-mono">{fileName()}</span>
							</div>
							<div class="flex justify-between">
								<span class="text-gray-600">Flash Size:</span>
								<span class="font-mono">{formatSize(backupFiles()!.flashData.length)}</span>
							</div>
							<div class="flex justify-between">
								<span class="text-gray-600">UICR Size:</span>
								<span class="font-mono">{formatSize(backupFiles()!.uicrData.length)}</span>
							</div>
							<Show when={backupFiles()?.metadata?.timestamp}>
								<div class="flex justify-between">
									<span class="text-gray-600">Backup Date:</span>
									<span class="font-mono text-xs">
										{new Date(backupFiles()!.metadata!.timestamp!).toLocaleString()}
									</span>
								</div>
							</Show>
							<Show when={backupFiles()?.metadata?.device?.part}>
								<div class="flex justify-between">
									<span class="text-gray-600">Device:</span>
									<span class="font-mono">{backupFiles()!.metadata!.device!.part}</span>
								</div>
							</Show>
						</div>
					</div>

					<div class="flex items-center gap-2">
						<input
							type="checkbox"
							id="verify-checkbox"
							checked={verifyEnabled()}
							onChange={(e) => setVerifyEnabled(e.target.checked)}
							class="h-4 w-4 text-blue-600 rounded border-gray-300"
						/>
						<label for="verify-checkbox" class="text-sm text-gray-700">
							Verify after writing (recommended)
						</label>
					</div>

					<div class="flex gap-2">
						<button
							onClick={arm}
							disabled={isDisabled()}
							class="flex-1 px-4 py-2 bg-orange-500 text-white rounded hover:bg-orange-600 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
						>
							Arm Restore
						</button>
						<button
							onClick={reset}
							class="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors"
						>
							Clear
						</button>
					</div>
				</div>
			</Show>

			<Show when={state() === 'armed' || state() === 'erasing' || state() === 'restoring'}>
				<button
					onClick={unarm}
					class="w-full px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
				>
					Cancel / Unarm
				</button>
			</Show>

			<Show when={state() === 'complete'}>
				<div class="space-y-4">
					<div class="p-4 bg-green-50 border border-green-200 rounded">
						<h3 class="font-semibold text-green-800 mb-2">Restore Complete!</h3>
						<p class="text-sm text-green-700">
							The device has been restored and reset. You can now power cycle the device.
						</p>
					</div>
					<button
						onClick={reset}
						class="w-full px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors"
					>
						Reset
					</button>
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
			<h2 class="text-2xl font-semibold mb-4">Restore Tool</h2>

			<Show when={!props.selectedDevice}>
				<div class="bg-gray-50 border border-gray-200 rounded p-4 mb-4">
					<p class="text-sm text-gray-600">Please select a USB probe device first.</p>
				</div>
			</Show>

			<Show when={props.selectedDevice}>
				<div class="mb-4">
					<p class="text-sm text-gray-600 mb-3">
						Restore firmware from a backup file or flash <a href="/firmware" class="text-blue-500 hover:underline">custom firmware</a>. This will overwrite the device's flash and UICR.
					</p>

					<div class="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-4">
						<p class="text-sm text-yellow-800">
							<strong>Warning:</strong> This will erase and overwrite all data on the target device.
							Make sure you have selected the correct file and have a backup of your original firmware.
						</p>
					</div>

					<details class="mb-4 text-sm">
						<summary class="cursor-pointer text-gray-600 hover:text-gray-800 select-none">
							File format details
						</summary>
						<div class="mt-2 p-3 bg-gray-50 rounded border border-gray-200 text-gray-700">
							<p class="mb-2">
								The firmware file must be a <code class="bg-gray-200 px-1 rounded">.zip</code> archive containing:
							</p>
							<ul class="list-disc list-inside space-y-1 ml-2">
								<li>
									<code class="bg-gray-200 px-1 rounded">flash.bin</code> — Flash memory image (required)
								</li>
								<li>
									<code class="bg-gray-200 px-1 rounded">uicr.bin</code> — UICR configuration (required)
								</li>
								<li>
									<code class="bg-gray-200 px-1 rounded">metadata.json</code> — Firmware metadata (optional)
								</li>
							</ul>
							<p class="mt-2 text-gray-500">
								Backups and custom firmware from this site are in the correct format.
							</p>
						</div>
					</details>

					{content}
				</div>
			</Show>
		</div>
	);
}
