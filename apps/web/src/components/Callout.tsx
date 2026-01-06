import type { JSX } from 'solid-js';
import Icon from './Icon';
import { calloutStyles, type CalloutType } from './ui';

interface CalloutProps {
	type: CalloutType;
	title?: string;
	children: JSX.Element;
}

export default function Callout(props: CalloutProps): JSX.Element {
	const style = () => calloutStyles[props.type];

	return (
		<div class={`${style().bg} border-l-4 ${style().border} p-4`}>
			<div class="flex">
				<div class="shrink-0">
					<Icon type={props.type} class={`h-5 w-5 ${style().icon}`} />
				</div>
				<div class="ml-3">
					<p class={`text-sm ${style().text}`}>
						{props.title && <strong>{props.title}:</strong>} {props.children}
					</p>
				</div>
			</div>
		</div>
	);
}
