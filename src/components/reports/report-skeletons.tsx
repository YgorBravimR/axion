// Static row-key sets — skeleton rows never reorder, so stable string keys
// are sufficient and avoid the no-array-index-key warning.
const KEYS_3 = ["a", "b", "c"] as const
const KEYS_4 = ["a", "b", "c", "d"] as const
const KEYS_5 = ["a", "b", "c", "d", "e"] as const
const KEYS_6 = ["a", "b", "c", "d", "e", "f"] as const

const SkeletonLine = ({ width = "w-full", height = "h-4" }) => (
	<div className={`${width} ${height} bg-bg-300 animate-pulse rounded-sm`} />
)

const AnnualRollupSkeleton = () => (
	<div className="space-y-s-300">
		<SkeletonLine width="w-32" height="h-6" />
		<div className="space-y-s-200">
			{KEYS_6.map((key) => (
				<SkeletonLine key={key} height="h-8" />
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
			{KEYS_4.map((key) => (
				<SkeletonLine key={key} height="h-8" />
			))}
		</div>
	</div>
)

const MonthlyReportCardSkeleton = () => (
	<div className="border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 lg:p-m-500 rounded-lg border">
		<SkeletonLine width="w-24" height="h-6" />
		<div className="mt-m-500 space-y-s-300">
			{KEYS_4.map((key) => (
				<SkeletonLine key={key} height="h-8" />
			))}
		</div>
	</div>
)

const MistakeCostCardSkeleton = () => (
	<div className="border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 lg:p-m-500 rounded-lg border">
		<SkeletonLine width="w-32" height="h-6" />
		<div className="mt-m-500 space-y-s-300">
			{KEYS_3.map((key) => (
				<SkeletonLine key={key} height="h-8" />
			))}
		</div>
	</div>
)

const CommissionFeeImpactCardSkeleton = () => (
	<div className="border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 lg:p-m-500 rounded-lg border">
		<SkeletonLine width="w-32" height="h-6" />
		<div className="mt-m-500 space-y-s-300">
			{KEYS_3.map((key) => (
				<SkeletonLine key={key} height="h-8" />
			))}
		</div>
	</div>
)

const RDistributionSkeleton = () => (
	<div className="space-y-s-300">
		<SkeletonLine width="w-32" height="h-6" />
		<div className="space-y-s-200">
			{KEYS_5.map((key) => (
				<SkeletonLine key={key} height="h-4" />
			))}
		</div>
	</div>
)

const AnnualTaxSkeleton = () => (
	<div className="space-y-s-300">
		<SkeletonLine width="w-32" height="h-6" />
		<div className="space-y-s-200">
			{KEYS_6.map((key) => (
				<SkeletonLine key={key} height="h-8" />
			))}
		</div>
	</div>
)

const CarryoverLedgerSkeleton = () => (
	<div className="space-y-s-300">
		<SkeletonLine width="w-32" height="h-6" />
		<div className="space-y-s-200">
			{KEYS_4.map((key) => (
				<SkeletonLine key={key} height="h-8" />
			))}
		</div>
	</div>
)

const MonthClosingSkeleton = () => (
	<div className="space-y-s-300">
		<SkeletonLine width="w-32" height="h-6" />
		<div className="space-y-s-200">
			{KEYS_5.map((key) => (
				<SkeletonLine key={key} height="h-8" />
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
