// Several mobile/in-app browsers (notably WhatsApp/Instagram's in-app webview, and some Android
// browsers) return a non-null object from window.open() even when nothing actually became visible
// to the user, which defeats block-detection that trusts the return value alone. There's no fully
// reliable cross-browser way to detect this synchronously, so same-tab navigation is the backstop
// — but every call site must ALSO offer a manual way back to this URL, since on some devices
// neither the new tab nor the same-tab fallback visibly does anything.
export function openErpPaymentPage(url: string): void {
  const openedWindow = window.open(url, "_blank");
  if (openedWindow) {
    openedWindow.opener = null;
  } else {
    window.location.href = url;
  }
}
