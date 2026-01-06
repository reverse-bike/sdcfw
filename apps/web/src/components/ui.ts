// Shared icon and callout definitions
// Used by both Astro and SolidJS components

export type IconType = 'warning' | 'info' | 'checkmark';

export const iconPaths: Record<IconType, string> = {
	warning:
		'M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z',
	info: 'M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z',
	checkmark:
		'M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z',
};

export type CalloutType = 'warning' | 'info';

export interface CalloutStyle {
	bg: string;
	border: string;
	icon: string;
	text: string;
}

export const calloutStyles: Record<CalloutType, CalloutStyle> = {
	warning: {
		bg: 'bg-yellow-50',
		border: 'border-yellow-400',
		icon: 'text-yellow-400',
		text: 'text-yellow-700',
	},
	info: {
		bg: 'bg-blue-50',
		border: 'border-blue-400',
		icon: 'text-blue-400',
		text: 'text-blue-700',
	},
};
