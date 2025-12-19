import { Show } from 'solid-js';

interface ProgressBarProps {
	/** Progress percentage (0-100). If undefined, shows indeterminate animation. */
	percent?: number;
	/** Status message to display */
	message?: string;
	/** Color variant */
	variant?: 'blue' | 'green' | 'orange' | 'red';
}

export default function ProgressBar(props: ProgressBarProps) {
	const isIndeterminate = () => props.percent === undefined;
	const percent = () => Math.min(100, Math.max(0, props.percent ?? 0));

	const colorClasses = () => {
		switch (props.variant ?? 'blue') {
			case 'green':
				return {
					bg: 'bg-green-100',
					bar: 'bg-green-500',
					text: 'text-green-700',
					border: 'border-green-200',
				};
			case 'orange':
				return {
					bg: 'bg-orange-100',
					bar: 'bg-orange-500',
					text: 'text-orange-700',
					border: 'border-orange-200',
				};
			case 'red':
				return {
					bg: 'bg-red-100',
					bar: 'bg-red-500',
					text: 'text-red-700',
					border: 'border-red-200',
				};
			default:
				return {
					bg: 'bg-blue-100',
					bar: 'bg-blue-500',
					text: 'text-blue-700',
					border: 'border-blue-200',
				};
		}
	};

	return (
		<div class={`rounded-lg border p-4 ${colorClasses().bg} ${colorClasses().border}`}>
			<Show when={props.message}>
				<p class={`text-sm mb-2 ${colorClasses().text}`}>{props.message}</p>
			</Show>
			<div class={`h-3 rounded-full overflow-hidden bg-white/50`}>
				<Show
					when={!isIndeterminate()}
					fallback={
						<div
							class={`h-full ${colorClasses().bar} animate-progress-indeterminate`}
							style={{ width: '30%' }}
						/>
					}
				>
					<div
						class={`h-full ${colorClasses().bar} transition-all duration-300 ease-out`}
						style={{ width: `${percent()}%` }}
					/>
				</Show>
			</div>
			<Show when={!isIndeterminate()}>
				<p class={`text-xs mt-1 text-right ${colorClasses().text} opacity-75`}>
					{percent().toFixed(0)}%
				</p>
			</Show>
		</div>
	);
}
