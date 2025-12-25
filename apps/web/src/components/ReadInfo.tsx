/// <reference types="w3c-web-usb" />
import { createSignal, Show } from 'solid-js';
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

interface ReadInfoProps {
	selectedDevice: USBDevice | null;
	inline?: boolean;
}

type ReadInfoState = 'idle' | 'armed' | 'reading' | 'complete' | 'error';

export default function ReadInfo(props: ReadInfoProps) {
	const [state, setState] = createSignal<ReadInfoState>('idle');
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
		if (conn) {
			await disconnectDAP(conn);
		}
	};

	const arm = async () => {
		if (!props.selectedDevice) {
			setError('No device selected');
			return;
		}

		setState('armed');
		setError('');
		setProgress('Armed - connect target to read info...');
		setDeviceInfo(null);
		setUicr(null);

		const retryDelayMs = 500;
		let conn: DAPConnection | null = null;

		// Poll for target connection
		while (state() === 'armed' || state() === 'reading') {
			// Try to connect if not connected
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
			}

			// Try to read device info
			setState('reading');
			setProgress('Reading device info...');
			try {
				const info = await readDeviceInfo(conn.dap);
				setDeviceInfo(info);

				setProgress('Reading UICR...');
				const uicrData = await readUICR(conn.dap);
				setUicr(uicrData);

				setState('complete');
				setProgress('');
				await safeDisconnect(conn);
				return;
			} catch (err) {
				const coreErr = toCoreError(err);
				if (coreErr.recoverable) {
					// Disconnect and retry
					await safeDisconnect(conn);
					conn = null;
					setState('armed');
					setProgress('Waiting for target connection...');
					await new Promise(resolve => setTimeout(resolve, retryDelayMs));
				} else {
					handleError(coreErr);
					await safeDisconnect(conn);
					return;
				}
			}
		}

		// Cancelled
		await safeDisconnect(conn);
	};

	const unarm = async () => {
		setState('idle');
		setProgress('');
		setError('');
	};

	const reset = () => {
		setState('idle');
		setProgress('');
		setError('');
		setDeviceInfo(null);
		setUicr(null);
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
					<ProgressBar message={progress()} variant="blue" />
				</div>
			</Show>

			<Show when={state() === 'idle'}>
				<button
					onClick={arm}
					disabled={isDisabled()}
					class="w-full px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
				>
					{props.selectedDevice ? 'Arm Read Info' : 'Select a device first'}
				</button>
			</Show>

			<Show when={state() === 'armed' || state() === 'reading'}>
				<button
					onClick={unarm}
					class="w-full px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
				>
					Cancel / Unarm
				</button>
			</Show>

			<Show when={state() === 'error'}>
				<button
					onClick={reset}
					class="w-full px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors"
				>
					Reset
				</button>
			</Show>

			<Show when={state() === 'complete' && deviceInfo() && uicr()}>
				{(() => {
					const info = formatDeviceInfo(deviceInfo()!);
					const uicrDisplay = formatUICR(uicr()!);
					return (
						<div class="space-y-4">
							<div class="p-4 bg-gray-50 rounded">
								<h3 class="font-semibold mb-2">Device Information</h3>
								<div class="text-sm space-y-1">
									<div class="flex justify-between">
										<span class="text-gray-600">Part:</span>
										<span class="font-mono">{info.part}</span>
									</div>
									<div class="flex justify-between">
										<span class="text-gray-600">Variant:</span>
										<span class="font-mono">{info.variant}</span>
									</div>
									<div class="flex justify-between">
										<span class="text-gray-600">Package:</span>
										<span class="font-mono">{info.package}</span>
									</div>
									<div class="flex justify-between">
										<span class="text-gray-600">RAM:</span>
										<span class="font-mono">{info.ram}</span>
									</div>
									<div class="flex justify-between">
										<span class="text-gray-600">Flash:</span>
										<span class="font-mono">{info.flash}</span>
									</div>
									<div class="flex justify-between">
										<span class="text-gray-600">Device ID:</span>
										<span class="font-mono text-xs">{info.deviceId}</span>
									</div>
									<div class="flex justify-between">
										<span class="text-gray-600">MAC Address:</span>
										<span class="font-mono text-xs">{info.macAddress} ({info.macType})</span>
									</div>
								</div>
							</div>

							<div class="p-4 bg-gray-50 rounded">
								<h3 class="font-semibold mb-2">Configuration</h3>
								<div class="text-sm space-y-1">
									<div class="flex justify-between">
										<span class="text-gray-600">Readout Protection:</span>
										<span class="font-mono">{uicrDisplay.approtect}</span>
									</div>
									<div class="flex justify-between">
										<span class="text-gray-600">Bootloader Address:</span>
										<span class="font-mono text-xs">{uicrDisplay.bootloaderAddr}</span>
									</div>
								</div>
							</div>

							<button
								onClick={reset}
								class="w-full px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors"
							>
								Read Again
							</button>
						</div>
					);
				})()}
			</Show>
		</>
	);

	if (props.inline) {
		return <div>{content}</div>;
	}

	return (
		<div class="bg-white border border-gray-200 rounded-lg p-6 mb-6">
			<h2 class="text-2xl font-semibold mb-4">Read Device Info</h2>

			<Show when={!props.selectedDevice}>
				<div class="bg-gray-50 border border-gray-200 rounded p-4 mb-4">
					<p class="text-sm text-gray-600">Please select a USB probe device first.</p>
				</div>
			</Show>

			<Show when={props.selectedDevice}>
				<p class="text-sm text-gray-600 mb-3">
					Read device information from the connected target.
				</p>
				{content}
			</Show>
		</div>
	);
}
