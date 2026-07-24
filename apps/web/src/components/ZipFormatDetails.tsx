export default function ZipFormatDetails() {
  return (
    <details class="mb-4 text-sm">
      <summary class="cursor-pointer text-gray-600 hover:text-gray-800 select-none">
        File format details
      </summary>
      <div class="mt-2 p-3 bg-gray-50 rounded border border-gray-200 text-gray-700">
        <p class="mb-2">
          The firmware file must be a <code class="bg-gray-200 px-1 rounded">.zip</code> archive
          containing:
        </p>
        <ul class="list-disc list-inside space-y-1 ml-2">
          <li>
            <code class="bg-gray-200 px-1 rounded">flash.bin</code> — Flash memory image (required)
          </li>
          <li>
            <code class="bg-gray-200 px-1 rounded">uicr.bin</code> — UICR configuration (required)
          </li>
          <li>
            <code class="bg-gray-200 px-1 rounded">metadata.json</code> — Firmware metadata
            (optional)
          </li>
        </ul>
        <p class="mt-2 mb-2">
          The files must be at the top level of the zip, not inside a folder. Compressing a folder
          in Finder or File Explorer nests the files in a folder inside the zip, and the tool won't
          find them. To create a valid zip from the command line, run this from inside the folder
          containing the files:
        </p>
        <pre class="bg-gray-800 text-gray-100 rounded p-3 overflow-x-auto">
          <code>zip ../my-firmware.zip flash.bin uicr.bin</code>
        </pre>
        <p class="mt-2 text-gray-500">
          Backups and custom firmware from this site are in the correct format.
        </p>
      </div>
    </details>
  );
}
