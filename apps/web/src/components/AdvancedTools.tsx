/// <reference types="w3c-web-usb" />
import { createSignal } from 'solid-js';
import UsbProbeSelect from './UsbProbeSelect';
import ReadInfo from './ReadInfo';
import Backup, { type CompletedBackup } from './Backup';
import Restore from './Restore';

export default function AdvancedTools() {
	const [selectedDevice, setSelectedDevice] = createSignal<USBDevice | null>(null);
	const [lastBackup, setLastBackup] = createSignal<CompletedBackup | null>(null);

	return (
		<div>
			<UsbProbeSelect onDeviceSelected={setSelectedDevice} />
			<ReadInfo selectedDevice={selectedDevice()} />
			<Backup selectedDevice={selectedDevice()} onBackupComplete={setLastBackup} />
			<Restore selectedDevice={selectedDevice()} lastBackup={lastBackup()} />
		</div>
	);
}
