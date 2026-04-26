export async function copyTextToClipboard(text: string) {
  const normalized = String(text ?? "");

  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(normalized);
      return;
    } catch {
      // Fallback below for insecure contexts, denied permission, or unsupported WebViews.
    }
  }

  if (typeof document === "undefined") {
    throw new Error("clipboard unavailable");
  }

  const textarea = document.createElement("textarea");
  textarea.value = normalized;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.top = "0";
  textarea.style.left = "0";
  textarea.style.opacity = "0";
  textarea.style.pointerEvents = "none";
  textarea.style.whiteSpace = "pre";

  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);

  try {
    const succeeded = document.execCommand("copy");
    if (!succeeded) {
      throw new Error("execCommand copy failed");
    }
  } finally {
    document.body.removeChild(textarea);
  }
}
