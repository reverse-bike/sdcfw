/// <reference types="w3c-web-usb" />
import { createSignal } from 'solid-js';
import UsbProbeSelect from './UsbProbeSelect';
import ReadInfo from './ReadInfo';
import Backup, { type CompletedBackup } from './Backup';
import Restore from './Restore';

interface StepCardProps {
	number: number;
	title: string;
	description: string;
}

function StepCard(props: StepCardProps) {
	return (
		<div class="relative">
			<div class="absolute -left-3 -top-3 w-8 h-8 bg-blue-500 text-white rounded-full flex items-center justify-center font-bold text-sm z-10 shadow-md">
				{props.number}
			</div>
			<div class="bg-white border border-gray-200 rounded-lg p-6">
				<h3 class="font-semibold text-lg">{props.title}</h3>
				<p class="text-gray-600 mt-1">{props.description}</p>
			</div>
		</div>
	);
}

interface ToolStepProps {
	number: number;
	title: string;
	description: any;
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
				description="Plug the Raspberry Pi Debug Probe into your computer's USB port and connect the jumper wires to the test points. Turn on the bike's power so the display is powered."
			/>

			{/* Step 2: Select Device */}
			<ToolStep
				number={2}
				title="Select the Device"
				description="Click 'Connect New Device' and select your debug probe from the browser's device picker. It will appear as 'CMSIS-DAP' or similar."
			>
				<UsbProbeSelect onDeviceSelected={setSelectedDevice} inline={true} />
			</ToolStep>

			{/* Step 3: Read Info */}
			<ToolStep
				number={3}
				title="Read Device Info"
				description="Practice the connection process: click the button to arm the tool, then press and hold the jumper wires against the test points. The tool will poll for a connection and read the chip info once contact is made."
			>
				<ReadInfo selectedDevice={selectedDevice()} inline={true} />
			</ToolStep>

			{/* Step 4: Backup */}
			<ToolStep
				number={4}
				title="Backup Your Firmware"
				description="Always backup first! Arm the tool, then press and hold the wires to the test points. Keep holding until the backup and verification complete - this takes about a minute. The tool will download a ZIP file when done."
			>
				<Backup selectedDevice={selectedDevice()} onBackupComplete={setLastBackup} inline={true} />
			</ToolStep>

			{/* Step 5: Restore */}
			<ToolStep
				number={5}
				title="Restore or Flash Custom Firmware"
				description={<>Use this tool to restore your original backup if something goes wrong, or to flash <a href="/firmware" target="_blank" class="text-blue-500 hover:underline">custom firmware</a>. Select your ZIP file, arm the tool, then press and hold the wires to the test points until complete.</>}
			>
				<Restore selectedDevice={selectedDevice()} lastBackup={lastBackup()} inline={true} />
			</ToolStep>
		</div>
	);
}
