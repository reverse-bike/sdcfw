import type { JSX } from 'solid-js';
import { iconPaths, type IconType } from './ui';

interface IconProps {
	type: IconType;
	class?: string;
}

export default function Icon(props: IconProps): JSX.Element {
	return (
		<svg
			class={props.class ?? 'h-5 w-5'}
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 20 20"
			fill="currentColor"
		>
			<path fill-rule="evenodd" d={iconPaths[props.type]} clip-rule="evenodd" />
		</svg>
	);
}
