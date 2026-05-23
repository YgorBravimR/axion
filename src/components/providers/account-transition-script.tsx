import Script from "next/script"

/**
 * Synchronous pre-paint script. If a pending account-switch flag is in
 * sessionStorage, sets data-account-transitioning="visible" on <html> BEFORE
 * body parses. The post-reload cover (rendered in the SSR React tree) is then
 * visible at frame 1 instead of snapping in after hydration — eliminates the
 * dark flash between the pre-reload overlay and the page fade-in.
 *
 * Must stay in sync with the session key used by AccountTransitionOverlayProvider.
 */
const AccountTransitionScript = () => {
	const script = `
(function(){
	try {
		if (sessionStorage.getItem("account-transition")) {
			sessionStorage.removeItem("account-transition");
			document.documentElement.setAttribute("data-account-transitioning", "visible");
		}
	} catch(e) {}
})();
`

	return (
		<Script
			id="account-transition-script"
			strategy="beforeInteractive"
			dangerouslySetInnerHTML={{ __html: script }}
		/>
	)
}

export { AccountTransitionScript }
