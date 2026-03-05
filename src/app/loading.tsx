import { Card } from "@/components/ui/card"

/**
 * Loading state for main dashboard
 */
const Loading = () => {
	return (
		<div className="min-h-dvh bg-bg-100 p-m-400 sm:p-m-500 lg:p-m-600">
			{/* Header skeleton */}
			<header className="mb-m-500 flex w-full items-center justify-between sm:mb-l-700">
				<div>
					<div className="h-10 w-48 animate-pulse rounded-lg bg-bg-200 sm:h-12 sm:w-64" />
					<div className="mt-s-200 h-5 w-56 animate-pulse rounded-lg bg-bg-200 sm:h-6 sm:w-96" />
				</div>
				<div className="h-10 w-10 animate-pulse rounded-lg bg-bg-200" />
			</header>

			{/* Main grid skeleton */}
			<div className="grid grid-cols-1 gap-m-500 md:grid-cols-2 lg:grid-cols-3 lg:gap-l-700">
				{/* Stats column */}
				<div className="space-y-m-600">
					{[1, 2, 3, 4].map((i) => (
						<Card id={`loading-stat-card-${i}`} key={i} className="bg-bg-200 p-m-600 shadow-medium">
							<div className="space-y-s-300 animate-pulse">
								<div className="h-4 w-20 rounded bg-bg-300" />
								<div className="h-8 w-32 rounded bg-bg-300" />
								<div className="h-4 w-24 rounded bg-bg-300" />
							</div>
						</Card>
					))}
				</div>

				{/* Tasks column */}
				<div className="lg:col-span-2">
					<Card id="loading-tasks-card" className="bg-bg-200 p-l-700 shadow-medium">
						<div className="space-y-m-500 animate-pulse">
							<div className="h-8 w-48 rounded bg-bg-300" />
							<div className="space-y-m-400">
								{[1, 2, 3].map((i) => (
									<div key={i} className="h-32 w-full rounded-lg bg-bg-300" />
								))}
							</div>
						</div>
					</Card>
				</div>
			</div>

			{/* Week goals skeleton */}
			<div className="mt-l-700">
				<Card id="loading-goals-card" className="bg-bg-200 p-l-700 shadow-medium">
					<div className="space-y-m-500 animate-pulse">
						<div className="h-8 w-56 rounded bg-bg-300" />
						<div className="space-y-m-400">
							{[1, 2].map((i) => (
								<div key={i} className="h-40 w-full rounded-lg bg-bg-300" />
							))}
						</div>
					</div>
				</Card>
			</div>
		</div>
	)
}

export default Loading
