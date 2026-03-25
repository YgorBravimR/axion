"use client"

import { Fragment } from "react"
import { useTranslations } from "next-intl"
import { usePathname } from "@/i18n/routing"
import { Link } from "@/i18n/routing"
import { navItems } from "@/lib/navigation"
import {
	Breadcrumb,
	BreadcrumbList,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"

const PageBreadcrumb = () => {
	const pathname = usePathname()
	const tNav = useTranslations("nav")
	const tBreadcrumb = useTranslations("breadcrumb")

	const segments = pathname.split("/").filter(Boolean)

	// Find the matching nav item for the first segment
	const matchedNavItem = navItems.find((item) => {
		if (item.href === "/") return false
		return pathname.startsWith(item.href)
	})

	// Dashboard (root) — just show "Home"
	if (segments.length === 0) {
		return (
			<Breadcrumb>
				<BreadcrumbList>
					<BreadcrumbItem>
						<BreadcrumbPage>{tBreadcrumb("home")}</BreadcrumbPage>
					</BreadcrumbItem>
				</BreadcrumbList>
			</Breadcrumb>
		)
	}

	// Build crumbs
	const crumbs: Array<{ label: string; href?: string }> = [
		{ label: tBreadcrumb("home"), href: "/" },
	]

	// Add the main section if we found a matching nav item
	if (matchedNavItem) {
		const isExactMatch = pathname === matchedNavItem.href
		crumbs.push({
			label: tNav(matchedNavItem.labelKey),
			href: isExactMatch ? undefined : matchedNavItem.href,
		})

		// Handle nested routes
		const remainingPath = pathname.slice(matchedNavItem.href.length)
		const nestedSegments = remainingPath.split("/").filter(Boolean)

		if (nestedSegments.length > 0) {
			const lastSegment = nestedSegments[nestedSegments.length - 1]
			const nestedLabel = getNestedLabel(lastSegment, matchedNavItem.labelKey, tBreadcrumb)
			crumbs.push({ label: nestedLabel })
		}
	} else {
		// Fallback: use segment name
		const label = segments[0]
			.replace(/-/g, " ")
			.replace(/\b\w/g, (char) => char.toUpperCase())
		crumbs.push({ label })
	}

	return (
		<Breadcrumb>
			<BreadcrumbList>
				{crumbs.map((crumb, index) => {
					const isLast = index === crumbs.length - 1
					return (
						<Fragment key={crumb.href ?? crumb.label}>
							{index > 0 && <BreadcrumbSeparator />}
							<BreadcrumbItem>
								{isLast || !crumb.href ? (
									<BreadcrumbPage>{crumb.label}</BreadcrumbPage>
								) : (
									<BreadcrumbLink asChild>
										<Link href={crumb.href}>{crumb.label}</Link>
									</BreadcrumbLink>
								)}
							</BreadcrumbItem>
						</Fragment>
					)
				})}
			</BreadcrumbList>
		</Breadcrumb>
	)
}

const getNestedLabel = (
	segment: string,
	parentKey: string,
	t: ReturnType<typeof useTranslations<"breadcrumb">>
): string => {
	if (segment === "new") {
		if (parentKey === "journal") return t("newTrade")
		if (parentKey === "playbook") return t("newPlaybook")
	}

	if (segment === "edit") {
		if (parentKey === "journal") return t("editTrade")
		if (parentKey === "playbook") return t("editPlaybook")
	}

	// UUID-like segments (trade/playbook detail pages)
	if (segment.length > 8 && segment.includes("-")) {
		if (parentKey === "journal") return t("tradeDetails")
		if (parentKey === "playbook") return t("playbookDetails")
	}

	// Fallback: capitalize the segment
	return segment
		.replace(/-/g, " ")
		.replace(/\b\w/g, (char) => char.toUpperCase())
}

export { PageBreadcrumb }
