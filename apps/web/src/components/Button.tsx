import type { JSX } from "solid-js";

interface ButtonProps {
  onClick: () => void;
  disabled?: boolean;
  /** Primary for the action a step expects, secondary for alternatives */
  variant?: "primary" | "secondary";
  size?: "md" | "sm";
  children: JSX.Element;
}

const VARIANTS = {
  primary:
    "bg-blue-500 font-semibold text-white hover:bg-blue-600 disabled:bg-gray-300 disabled:hover:bg-gray-300",
  secondary:
    "border border-blue-500 font-semibold text-blue-600 hover:bg-blue-50 disabled:border-gray-300 disabled:text-gray-400 disabled:hover:bg-transparent",
} as const;

const SIZES = {
  md: "px-5 py-2",
  sm: "px-4 py-1.5 text-sm",
} as const;

/** The one button in the browser tools, so shades and states cannot drift. */
export default function Button(props: ButtonProps) {
  return (
    <button
      type="button"
      onClick={() => props.onClick()}
      disabled={props.disabled ?? false}
      class={`rounded-lg transition focus:ring-2 focus:ring-blue-300 focus:outline-none disabled:cursor-not-allowed ${
        VARIANTS[props.variant ?? "primary"]
      } ${SIZES[props.size ?? "md"]}`}
    >
      {props.children}
    </button>
  );
}
