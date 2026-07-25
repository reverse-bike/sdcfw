import { Show, type JSX } from "solid-js";

export type Tone = "info" | "success" | "warning" | "error";

interface StatusMessageProps {
  tone: Tone;
  /** Leads the message in bold, e.g. "Something went wrong" */
  title?: string;
  children: JSX.Element;
}

const TONES: Record<Tone, string> = {
  info: "border-blue-200 bg-blue-50 text-blue-800",
  success: "border-green-200 bg-green-50 text-green-800",
  warning: "border-yellow-200 bg-yellow-50 text-yellow-800",
  error: "border-red-200 bg-red-50 text-red-800",
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
