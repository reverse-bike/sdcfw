import { Show, type JSX } from "solid-js";

interface ToolCardProps {
  title: string;
  description?: JSX.Element;
  children: JSX.Element;
}

/** The panel every browser tool sits in, so they read as one set. */
export default function ToolCard(props: ToolCardProps) {
  return (
    <section class="mt-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <h2 class="text-xl font-bold">{props.title}</h2>
      <Show when={props.description}>
        <p class="mt-2 text-gray-600">{props.description}</p>
      </Show>
      <div class="mt-4">{props.children}</div>
    </section>
  );
}
