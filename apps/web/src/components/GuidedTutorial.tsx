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

interface ContentStepProps {
	number: number;
	title: string;
	description: string;
	children: any;
}

function ContentStep(props: ContentStepProps) {
	return (
		<div class="relative">
			<div class="absolute -left-3 -top-3 w-8 h-8 bg-blue-500 text-white rounded-full flex items-center justify-center font-bold text-sm z-10 shadow-md">
				{props.number}
			</div>
			<div class="bg-white border border-gray-200 rounded-lg p-6">
				<h3 class="font-semibold text-lg">{props.title}</h3>
				<p class="text-gray-600 mt-1 mb-4">{props.description}</p>
				{props.children}
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
				description="Plug the Raspberry Pi Debug Probe into your computer's (or phone's) USB port."
			/>

			{/* Step 2: Select Device */}
			<ToolStep
				number={2}
				title="Select the Device"
				description="Click 'Connect New Device' and select your debug probe from the browser's device picker. It will appear as 'CMSIS-DAP' or similar."
			>
				<UsbProbeSelect onDeviceSelected={setSelectedDevice} inline={true} />
			</ToolStep>

			{/* Step 3: Open the Case */}
			<ContentStep
				number={3}
				title="Open the Display Case"
				description="Follow these steps to safely open your Diamond display and access the test points. This can be done with or without removing the display from your bike, however the display will need to be connected to the bike for the next steps."
			>
				<div class="grid grid-cols-1 sm:grid-cols-2 gap-6">
					<figure>
						<a href="/dd-dis-01-buttons.webp" target="_blank" rel="noopener" class="block aspect-[4/3] overflow-hidden rounded-lg border border-gray-200">
							<img
								src="/dd-dis-01-buttons.webp"
								alt="Step 1: Display buttons"
								class="w-full h-full object-cover hover:opacity-90 transition-opacity cursor-zoom-in"
							/>
						</a>
						<figcaption class="text-sm text-gray-500 mt-2">
							<span class="font-semibold text-gray-700">Step 1:</span> Remove the button cover with your fingers, or a slim piece of sturdy plastic or metal.
						</figcaption>
					</figure>

					<figure>
						<a href="/dd-dis-02-screws.webp" target="_blank" rel="noopener" class="block aspect-[4/3] overflow-hidden rounded-lg border border-gray-200">
							<img
								src="/dd-dis-02-screws.webp"
								alt="Step 2: Remove screws"
								class="w-full h-full object-cover hover:opacity-90 transition-opacity cursor-zoom-in"
							/>
						</a>
						<figcaption class="text-sm text-gray-500 mt-2">
							<span class="font-semibold text-gray-700">Step 2:</span> Remove the 6 small screws on the inner case.
						</figcaption>
					</figure>

					<figure>
						<a href="/dd-dis-03-cover.webp" target="_blank" rel="noopener" class="block aspect-[4/3] overflow-hidden rounded-lg border border-gray-200">
							<img
								src="/dd-dis-03-cover.webp"
								alt="Step 3: Remove cover"
								class="w-full h-full object-cover hover:opacity-90 transition-opacity cursor-zoom-in"
							/>
						</a>
						<figcaption class="text-sm text-gray-500 mt-2">
							<span class="font-semibold text-gray-700">Step 3:</span> The inner case should come off easily once screws are removed. <span class="font-bold">Warning:</span> The inner case is connected to the PCB with a delicate ribbon cable. The cable does not need to be disconnected, but take care not to tear it.
						</figcaption>
					</figure>

					<figure>
						<a href="/dd-dis-04-sticker.webp" target="_blank" rel="noopener" class="block aspect-[4/3] overflow-hidden rounded-lg border border-gray-200">
							<img
								src="/dd-dis-04-sticker.webp"
								alt="Step 4: Sticker location"
								class="w-full h-full object-cover hover:opacity-90 transition-opacity cursor-zoom-in"
							/>
						</a>
						<figcaption class="text-sm text-gray-500 mt-2">
							<span class="font-semibold text-gray-700">Step 4:</span> You may need to remove the yellow tape to reveal your golden test points.
						</figcaption>
					</figure>
				</div>
			</ContentStep>

			{/* Step 4: Read Info (with wiring guide) */}
			<ToolStep
				number={4}
				title="Connect Wires & Read Device Info"
				description="Connect your debug probe wires to the test points and read the chip info to verify the connection works."
			>
				<div class="mb-6">
					<h4 class="font-medium text-gray-900 mb-3">Wire Connections</h4>
					<div class="bg-gray-50 rounded-lg p-4 mb-4">
						<div class="space-y-3">
							<div class="flex items-center">
								<span class="w-5 h-5 rounded-full bg-yellow-400 border border-yellow-500 mr-3" title="Yellow wire"></span>
								<span class="w-20 text-yellow-700 font-medium">Yellow</span>
								<span class="w-24 font-semibold">SWDIO (SD)</span>
								<span class="text-gray-400 mx-3">&rarr;</span>
								<span class="font-mono text-sm bg-gray-200 px-2 py-1 rounded">TP10</span>
							</div>
							<div class="flex items-center">
								<span class="w-5 h-5 rounded-full bg-orange-500 border border-orange-600 mr-3" title="Orange wire"></span>
								<span class="w-20 text-orange-600 font-medium">Orange</span>
								<span class="w-24 font-semibold">SWCLK (SC)</span>
								<span class="text-gray-400 mx-3">&rarr;</span>
								<span class="font-mono text-sm bg-gray-200 px-2 py-1 rounded">TP11</span>
							</div>
							<div class="flex items-center">
								<span class="w-5 h-5 rounded-full bg-gray-800 border border-gray-900 mr-3" title="Black wire"></span>
								<span class="w-20 text-gray-800 font-medium">Black</span>
								<span class="w-24 font-semibold">GND</span>
								<span class="text-gray-400 mx-3">&rarr;</span>
								<span class="font-mono text-sm bg-gray-200 px-2 py-1 rounded">Terminal 8</span>
							</div>
						</div>
					</div>

					<div class="grid grid-cols-1 md:grid-cols-3 gap-4">
						<figure>
							<a href="/debug-probe-wires.webp" target="_blank" rel="noopener" class="block">
								<img
									src="/debug-probe-wires.webp"
									alt="Raspberry Pi Debug Probe showing SWDIO (yellow), SWCLK (orange), and GND (black) wires"
									class="w-full rounded-lg border border-gray-200 hover:opacity-90 transition-opacity cursor-zoom-in"
								/>
							</a>
							<figcaption class="text-sm text-gray-500 mt-2 text-center">
								Debug probe wires: <span class="text-yellow-600 font-medium">Yellow</span> = SWDIO, <span class="text-orange-600 font-medium">Orange</span> = SWCLK, <span class="text-gray-800 font-medium">Black</span> = GND
							</figcaption>
						</figure>
						<figure>
							<a href="/test-points.webp" target="_blank" rel="noopener" class="block">
								<img
									src="/test-points.webp"
									alt="Test points inside the Diamond display showing TP10 (SWDIO) and TP11 (SWCLK)"
									class="w-full rounded-lg border border-gray-200 hover:opacity-90 transition-opacity cursor-zoom-in"
								/>
							</a>
							<figcaption class="text-sm text-gray-500 mt-2 text-center">
								Test point locations inside the display
							</figcaption>
						</figure>
						<figure>
							<a href="/terminal-8-gnd.webp" target="_blank" rel="noopener" class="block">
								<img
									src="/terminal-8-gnd.webp"
									alt="White connector showing Terminal 8 for GND connection"
									class="w-full rounded-lg border border-gray-200 hover:opacity-90 transition-opacity cursor-zoom-in"
								/>
							</a>
							<figcaption class="text-sm text-gray-500 mt-2 text-center">
								Terminal 8 on the white connector for GND. You may need some tape to keep this wire in place.
							</figcaption>
						</figure>
					</div>
				</div>

				<div class="border-t border-gray-200 pt-6">
					<h4 class="font-medium text-gray-900 mb-3">Test the Connection</h4>
					<p class="text-gray-600 text-sm mb-4">First power on the bike. Then click the button to arm the tool, connect the ground wire, then press and hold the jumper wires against the test points. The tool will poll for a connection and read the chip info once contact is made.</p>
					<ReadInfo selectedDevice={selectedDevice()} inline={true} />
				</div>
			</ToolStep>

			{/* Step 5: Backup */}
			<ToolStep
				number={5}
				title="Backup Your Firmware"
				description="Always backup first! Arm the tool, then press and hold the wires to the test points. Keep holding until the backup and verification complete - this takes about a minute. The tool will download a ZIP file when done."
			>
				<Backup selectedDevice={selectedDevice()} onBackupComplete={setLastBackup} inline={true} />
			</ToolStep>

			{/* Step 6: Restore */}
			<ToolStep
				number={6}
				title="Restore or Flash Custom Firmware"
				description={<>Use this tool to restore your original backup if something goes wrong, or to flash <a href="/firmware" target="_blank" class="text-blue-500 hover:underline">custom firmware</a>. Select your ZIP file, arm the tool, then press and hold the wires to the test points until complete.</>}
			>
				<div class="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-4">
					<div class="flex">
						<div class="shrink-0">
							<svg class="h-5 w-5 text-yellow-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
								<path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
							</svg>
						</div>
						<div class="ml-3">
							<p class="text-sm text-yellow-700">
								<strong>Warning:</strong> This tool provides low-level access to your device firmware. Always backup before making changes.
							</p>
						</div>
					</div>
				</div>
				<Restore selectedDevice={selectedDevice()} lastBackup={lastBackup()} inline={true} />
			</ToolStep>
		</div>
	);
}
