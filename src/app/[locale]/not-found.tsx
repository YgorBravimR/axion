import { Link } from "@/i18n/routing"

const NotFound = () => {
	return (
		<div className="flex flex-col items-center justify-center min-h-[60dvh] gap-4">
			<h1 className="text-4xl font-bold text-foreground">404</h1>
			<p className="text-lg text-muted-foreground">Page not found</p>
			<Link
				href="/"
				className="px-4 py-2 text-sm font-medium text-white bg-brand-primary rounded-lg hover:bg-brand-primary/90 transition-colors"
			>
				Go back home
			</Link>
		</div>
	)
}

export default NotFound
