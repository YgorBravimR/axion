"use client"

import { Fragment, useMemo } from "react"
import { useTranslations } from "next-intl"
import { usePathname, Link } from "@/i18n/routing"
import { buildNavItems, type NavEntry } from "@/lib/navigation"
import {
	Breadcrumb,
	BreadcrumbList,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"

interface PageBreadcrumbProps {
	navStructure: NavEntry[]
}

const PageBreadcrumb = ({ navStructure }: PageBreadcrumbProps) => {
	const pathname = usePathname()
	const tNav = useTranslations("nav")
	const tBreadcrumb = useTranslations("breadcrumb")
	const navItems = useMemo(() => buildNavItems(navStructure), [navStructure])

	const segments = useMemo(
		() => pathname.split("/").filter(Boolean),
		[pathname]
	)

	const matchedNavItem = useMemo(
		() =>
			navItems
				.filter((item) => item.href !== "/" && pathname.startsWith(item.href))
				.sort((a, b) => b.href.length - a.href.length)[0],
		[pathname, navItems]
	)

	const crumbs = useMemo((): Array<{ label: string; href?: string }> => {
		if (segments.length === 0) {
			return []
		}

		const result: Array<{ label: string; href?: string }> = [
			{ label: tBreadcrumb("home"), href: "/" },
		]

		if (matchedNavItem) {
			const isExactMatch = pathname === matchedNavItem.href
			result.push({
				label: tNav(matchedNavItem.labelKey),
				href: isExactMatch ? undefined : matchedNavItem.href,
			})

			const remainingPath = pathname.slice(matchedNavItem.href.length)
			const nestedSegments = remainingPath.split("/").filter(Boolean)

			const lastSegment = nestedSegments[nestedSegments.length - 1]
			if (lastSegment) {
				const nestedLabel = getNestedLabel(
					lastSegment,
					matchedNavItem.labelKey,
					tBreadcrumb
				)
				result.push({ label: nestedLabel })
			}
		} else {
			const firstSegment = segments[0]
			if (firstSegment) {
				const label = firstSegment
					.replace(/-/g, " ")
					.replace(/\b\w/g, (char) => char.toUpperCase())
				result.push({ label })
			}
		}

		return result
	}, [pathname, segments, matchedNavItem, tNav, tBreadcrumb])

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
		if (parentKey === "journal") {
			return t("newTrade")
		}
		if (parentKey === "playbook") {
			return t("newPlaybook")
		}
	}

	if (segment === "edit") {
		if (parentKey === "journal") {
			return t("editTrade")
		}
		if (parentKey === "playbook") {
			return t("editPlaybook")
		}
	}

	if (segment === "enrich" && parentKey === "journal") {
		return t("enrichJournal")
	}
	if (segment === "review" && parentKey === "journal") {
		return t("enrichReview")
	}

	// UUID-like segments (trade/playbook detail pages)
	if (segment.length > 8 && segment.includes("-")) {
		if (parentKey === "journal") {
			return t("tradeDetails")
		}
		if (parentKey === "playbook") {
			return t("playbookDetails")
		}
	}

	// Fallback: capitalize the segment
	return segment
		.replace(/-/g, " ")
		.replace(/\b\w/g, (char) => char.toUpperCase())
}

export { PageBreadcrumb }
