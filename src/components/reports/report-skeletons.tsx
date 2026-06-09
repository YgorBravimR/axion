const SkeletonLine = ({ width = "w-full", height = "h-4" }) => (
	<div className={`${width} ${height} bg-bg-300 animate-pulse rounded-sm`} />
)

const AnnualRollupSkeleton = () => (
	<div className="space-y-s-300">
		<SkeletonLine width="w-32" height="h-6" />
		<div className="space-y-s-200">
			{Array.from({ length: 6 }).map((_, i) => (
				<SkeletonLine key={i} height="h-8" />
			))}
		</div>
	</div>
)

const WeeklyMetaSkeleton = () => (
	<div className="space-y-s-300">
		<SkeletonLine width="w-32" height="h-6" />
		<SkeletonLine height="h-72" />
	</div>
)

const WeeklyReportCardSkeleton = () => (
	<div className="border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 lg:p-m-500 rounded-lg border">
		<SkeletonLine width="w-24" height="h-6" />
		<div className="mt-m-500 space-y-s-300">
			{Array.from({ length: 4 }).map((_, i) => (
				<SkeletonLine key={i} height="h-8" />
			))}
		</div>
	</div>
)

const MonthlyReportCardSkeleton = () => (
	<div className="border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 lg:p-m-500 rounded-lg border">
		<SkeletonLine width="w-24" height="h-6" />
		<div className="mt-m-500 space-y-s-300">
			{Array.from({ length: 4 }).map((_, i) => (
				<SkeletonLine key={i} height="h-8" />
			))}
		</div>
	</div>
)

const MistakeCostCardSkeleton = () => (
	<div className="border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 lg:p-m-500 rounded-lg border">
		<SkeletonLine width="w-32" height="h-6" />
		<div className="mt-m-500 space-y-s-300">
			{Array.from({ length: 3 }).map((_, i) => (
				<SkeletonLine key={i} height="h-8" />
			))}
		</div>
	</div>
)

const CommissionFeeImpactCardSkeleton = () => (
	<div className="border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 lg:p-m-500 rounded-lg border">
		<SkeletonLine width="w-32" height="h-6" />
		<div className="mt-m-500 space-y-s-300">
			{Array.from({ length: 3 }).map((_, i) => (
				<SkeletonLine key={i} height="h-8" />
			))}
		</div>
	</div>
)

const RDistributionSkeleton = () => (
	<div className="space-y-s-300">
		<SkeletonLine width="w-32" height="h-6" />
		<div className="space-y-s-200">
			{Array.from({ length: 5 }).map((_, i) => (
				<SkeletonLine key={i} height="h-4" />
			))}
		</div>
	</div>
)

const AnnualTaxSkeleton = () => (
	<div className="space-y-s-300">
		<SkeletonLine width="w-32" height="h-6" />
		<div className="space-y-s-200">
			{Array.from({ length: 6 }).map((_, i) => (
				<SkeletonLine key={i} height="h-8" />
			))}
		</div>
	</div>
)

const CarryoverLedgerSkeleton = () => (
	<div className="space-y-s-300">
		<SkeletonLine width="w-32" height="h-6" />
		<div className="space-y-s-200">
			{Array.from({ length: 4 }).map((_, i) => (
				<SkeletonLine key={i} height="h-8" />
			))}
		</div>
	</div>
)

const MonthClosingSkeleton = () => (
	<div className="space-y-s-300">
		<SkeletonLine width="w-32" height="h-6" />
		<div className="space-y-s-200">
			{Array.from({ length: 5 }).map((_, i) => (
				<SkeletonLine key={i} height="h-8" />
			))}
		</div>
	</div>
)

export {
	AnnualRollupSkeleton,
	WeeklyMetaSkeleton,
	WeeklyReportCardSkeleton,
	MonthlyReportCardSkeleton,
	MistakeCostCardSkeleton,
	CommissionFeeImpactCardSkeleton,
	RDistributionSkeleton,
	AnnualTaxSkeleton,
	CarryoverLedgerSkeleton,
	MonthClosingSkeleton,
}
