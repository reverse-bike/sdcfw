import { createSignal } from "solid-js";
import { copyText } from "./controllerFlash";

interface CopyButtonProps {
  /** Read lazily, so the text copied is whatever is on screen when clicked */
  text: () => string;
  label: string;
}

/** Text-link button that copies and says so, for logs and version reports. */
export default function CopyButton(props: CopyButtonProps) {
  const [copied, setCopied] = createSignal(false);

  const copy = async () => {
    setCopied(await copyText(props.text()));
  };

  return (
    <button type="button" onClick={copy} class="mt-2 text-sm text-blue-500 hover:underline">
      {copied() ? "Copied" : props.label}
    </button>
  );
}
