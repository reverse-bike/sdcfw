/// <reference types="w3c-web-usb" />
import { createSignal, createEffect, onCleanup, For, Show } from 'solid-js';

interface UsbDevice {
	device: USBDevice;
	id: string;
	name: string;
}

interface UsbProbeSelectProps {
	onDeviceSelected?: (device: USBDevice | null) => void;
}

export default function UsbProbeSelect(props: UsbProbeSelectProps) {
	const [devices, setDevices] = createSignal<UsbDevice[]>([]);
	const [selectedDevice, setSelectedDevice] = createSignal<USBDevice | null>(null);
	const [error, setError] = createSignal<string>('');
	const [isSupported, setIsSupported] = createSignal(true);

	// Check if WebUSB is supported
	createEffect(() => {
		if (!navigator.usb) {
			setIsSupported(false);
			setError('WebUSB is not supported in this browser. Please use Chrome, Edge, or another Chromium-based browser.');
		}
	});

	// Filter for DAPLink-compatible devices
	// DAPLink devices typically have class 0xFF (vendor-specific)
	const isDapLinkDevice = (_device: USBDevice): boolean => {
		// Filtering disabled - allow all devices for now
		return true;

		// Original implementation (disabled):
		// Check if device has vendor-specific interface class
		// if (!device.configuration) return false;
		// for (const iface of device.configuration.interfaces) {
		//   for (const alt of iface.alternates) {
		//     if (alt.interfaceClass === 0xFF) {
		//       return true;
		//     }
		//   }
		// }
		// return false;
	};

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
			const filteredDevices = authorizedDevices
				.filter(isDapLinkDevice)
				.map(device => ({
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
			// Request any USB device - show all connected devices in the picker
			const device = await navigator.usb.requestDevice({
				filters: []
			});

			await device.open();
			if (device.configuration === null) {
				await device.selectConfiguration(1);
			}

			setSelectedDevice(device);
			props.onDeviceSelected?.(device);
			await refreshDevices();
		} catch (err) {
			if (err instanceof Error && err.name === 'NotFoundError') {
				// User cancelled the selection
				return;
			}
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

	// Handle USB device connection/disconnection events
	const handleConnect = (event: USBConnectionEvent) => {
		console.log('USB device connected:', event.device);
		refreshDevices();
	};

	const handleDisconnect = (event: USBConnectionEvent) => {
		console.log('USB device disconnected:', event.device);
		const currentDevice = selectedDevice();
		if (currentDevice && getDeviceId(currentDevice) === getDeviceId(event.device)) {
			setSelectedDevice(null);
			props.onDeviceSelected?.(null);
		}
		refreshDevices();
	};

	// Set up event listeners
	createEffect(() => {
		if (!navigator.usb) return;

		navigator.usb.addEventListener('connect', handleConnect);
		navigator.usb.addEventListener('disconnect', handleDisconnect);

		// Initial device refresh
		refreshDevices();

		onCleanup(() => {
			navigator.usb.removeEventListener('connect', handleConnect);
			navigator.usb.removeEventListener('disconnect', handleDisconnect);
		});
	});

	return (
		<div class="bg-white border border-gray-200 rounded-lg p-6 mb-6">
			<h2 class="text-2xl font-semibold mb-4">USB Probe Select</h2>

			<Show when={!isSupported()}>
				<div class="bg-red-50 border-l-4 border-red-400 p-4 mb-4">
					<p class="text-sm text-red-700">{error()}</p>
				</div>
			</Show>

			<Show when={isSupported()}>
				<div class="mb-4">
					<p class="text-sm text-gray-600 mb-3">
						Select a DAPLink-compatible USB probe device to use for the rest of the tools.
					</p>

					<Show when={error()}>
						<div class="bg-red-50 border-l-4 border-red-400 p-4 mb-4">
							<p class="text-sm text-red-700">{error()}</p>
						</div>
					</Show>

					<Show when={selectedDevice()}>
						<div class="bg-green-50 border-l-4 border-green-400 p-4 mb-4">
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
				</div>
			</Show>
		</div>
	);
}
