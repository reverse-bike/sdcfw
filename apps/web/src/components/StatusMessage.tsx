import { Show, type JSX } from "solid-js";

export type Tone = "info" | "success" | "warning" | "error";

interface StatusMessageProps {
  tone: Tone;
  /** Leads the message in bold, e.g. "Something went wrong" */
  title?: string;
  children: JSX.Element;
}

const TONES: Record<Tone, string> = {
  info: "border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950 text-blue-800 dark:text-blue-200",
  success:
    "border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950 text-green-800 dark:text-green-200",
  warning:
    "border-yellow-200 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-950 text-yellow-800 dark:text-yellow-200",
  error:
    "border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950 text-red-800 dark:text-red-200",
};

/** Inline result of an action, as opposed to Callout's standing advice. */
export default function StatusMessage(props: StatusMessageProps) {
  return (
    <div
      role={props.tone === "error" ? "alert" : "status"}
      class={`mt-5 rounded-lg border px-4 py-3 text-sm ${TONES[props.tone]}`}
    >
      <Show when={props.title}>
        <span class="font-semibold">{props.title}:</span>{" "}
      </Show>
      {props.children}
    </div>
  );
}
