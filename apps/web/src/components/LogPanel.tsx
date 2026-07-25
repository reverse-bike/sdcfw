import { For, Show } from "solid-js";
import CopyButton from "./CopyButton";

interface LogPanelProps {
  lines: string[];
  /** Disclosure label; the panel is collapsed unless `open` is set */
  label?: string;
  open?: boolean;
}

/**
 * The running log of a Bluetooth operation, collapsed by default.
 *
 * Copyable because the useful thing to do with a failure is paste it to
 * someone who can read it.
 */
export default function LogPanel(props: LogPanelProps) {
  return (
    <Show when={props.lines.length > 0}>
      <details class="mt-5" open={props.open ?? false}>
        <summary class="cursor-pointer text-sm text-gray-600 select-none hover:text-gray-800">
          {props.label ?? "Details"}
        </summary>
        <pre class="mt-2 max-h-72 overflow-auto rounded-lg bg-gray-900 p-4 font-mono text-xs whitespace-pre-wrap text-gray-100">
          <For each={props.lines}>{(line) => <div>{line}</div>}</For>
        </pre>
        <CopyButton text={() => props.lines.join("\n")} label="Copy this log" />
      </details>
    </Show>
  );
}
