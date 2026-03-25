import { BRANDS } from "@/lib/brands"

/**
 * Blocking inline script that applies the persisted brand from localStorage
 * before the first paint. Mirrors the pattern `next-themes` uses for `data-theme`.
 *
 * Runs synchronously in <head> — no React hydration involved.
 * This is a server component (no "use client") — it only renders static HTML.
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
		<script
			dangerouslySetInnerHTML={{ __html: script }}
			data-brand-script=""
		/>
	)
}

export { BrandScript }
