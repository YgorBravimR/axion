import Script from "next/script"
import { BRANDS } from "@/lib/brands"

/**
 * Blocking inline script that applies the persisted brand from localStorage
 * before the first paint. Mirrors the pattern `next-themes` uses for `data-theme`.
 *
 * Uses next/script with strategy="beforeInteractive" to run synchronously in <head>
 * before the first paint. This is a server component (no "use client").
 */
const BrandScript = () => {
	const brandList = JSON.stringify(BRANDS)

	// The script is inlined into the HTML and runs before first paint
	const script = `
(function(){
	try {
		var stored = localStorage.getItem("brand");
		var brands = ${brandList};
		if (stored && brands.indexOf(stored) !== -1) {
			document.documentElement.setAttribute("data-brand", stored);
		}
	} catch(e) { if(typeof console!=='undefined') console.warn('[brand]',e) }
})();
`

	return (
		<Script
			id="brand-script"
			strategy="beforeInteractive"
			dangerouslySetInnerHTML={{ __html: script }}
		/>
	)
}

export { BrandScript }
