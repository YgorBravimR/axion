/**
 * React-PDF template for weekly and monthly trading reports.
 * Renders to a printable PDF with clean white/navy aesthetic.
 */

import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer"
import type { WeeklyReport, MonthlyReport, CommissionFeeImpact } from "@/app/actions/reports"
import { formatCurrency, formatPercent, formatR } from "./report-pdf-helpers"

// ============================================================================
// STYLES
// ============================================================================

const colors = {
	navy: "#0c0e0f",
	darkNavy: "#171a1d",
	gold: "#d4a843",
	green: "#22c55e",
	red: "#ef4444",
	gray: "#6b7280",
	lightGray: "#f3f4f6",
	white: "#ffffff",
	border: "#e5e7eb",
}

const styles = StyleSheet.create({
	page: {
		padding: 40,
		fontFamily: "Helvetica",
		fontSize: 10,
		color: colors.navy,
		backgroundColor: colors.white,
	},
	header: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		borderBottom: `2px solid ${colors.gold}`,
		paddingBottom: 12,
		marginBottom: 20,
	},
	headerTitle: {
		fontSize: 18,
		fontFamily: "Helvetica-Bold",
		color: colors.navy,
	},
	headerSubtitle: {
		fontSize: 10,
		color: colors.gray,
		marginTop: 4,
	},
	headerBrand: {
		fontSize: 12,
		fontFamily: "Helvetica-Bold",
		color: colors.gold,
	},
	section: {
		marginBottom: 16,
	},
	sectionTitle: {
		fontSize: 12,
		fontFamily: "Helvetica-Bold",
		color: colors.navy,
		marginBottom: 8,
		paddingBottom: 4,
		borderBottom: `1px solid ${colors.border}`,
	},
	metricsGrid: {
		flexDirection: "row",
		flexWrap: "wrap",
		gap: 8,
	},
	metricCard: {
		width: "30%",
		backgroundColor: colors.lightGray,
		borderRadius: 4,
		padding: 8,
	},
	metricLabel: {
		fontSize: 8,
		color: colors.gray,
		marginBottom: 2,
	},
	metricValue: {
		fontSize: 14,
		fontFamily: "Helvetica-Bold",
	},
	table: {
		width: "100%",
	},
	tableHeader: {
		flexDirection: "row",
		backgroundColor: colors.darkNavy,
		padding: 6,
		borderRadius: 2,
	},
	tableHeaderCell: {
		fontSize: 8,
		fontFamily: "Helvetica-Bold",
		color: colors.white,
	},
	tableRow: {
		flexDirection: "row",
		padding: 6,
		borderBottom: `1px solid ${colors.border}`,
	},
	tableRowAlt: {
		flexDirection: "row",
		padding: 6,
		borderBottom: `1px solid ${colors.border}`,
		backgroundColor: colors.lightGray,
	},
	tableCell: {
		fontSize: 9,
	},
	positive: {
		color: colors.green,
	},
	negative: {
		color: colors.red,
	},
	footer: {
		position: "absolute",
		bottom: 30,
		left: 40,
		right: 40,
		flexDirection: "row",
		justifyContent: "space-between",
		borderTop: `1px solid ${colors.border}`,
		paddingTop: 8,
	},
	footerText: {
		fontSize: 8,
		color: colors.gray,
	},
	feeSection: {
		backgroundColor: colors.lightGray,
		borderRadius: 4,
		padding: 10,
		marginTop: 8,
	},
})

// ============================================================================
// HELPERS
// ============================================================================

const PnlText = ({ value }: { value: number }) => (
	<Text style={[styles.metricValue, value >= 0 ? styles.positive : styles.negative]}>
		{formatCurrency(value)}
	</Text>
)

// ============================================================================
// WEEKLY REPORT TEMPLATE
// ============================================================================

interface WeeklyReportPdfProps {
	report: WeeklyReport
	feeData: CommissionFeeImpact | null
	generatedAt: string
}

const WeeklyReportPdf = ({ report, feeData, generatedAt }: WeeklyReportPdfProps) => {
	const { summary, dailyBreakdown, topWins, topLosses } = report

	return (
		<Document>
			<Page size="A4" style={styles.page}>
				{/* Header */}
				<View style={styles.header}>
					<View>
						<Text style={styles.headerTitle}>Weekly Report</Text>
						<Text style={styles.headerSubtitle}>
							{report.weekStart} — {report.weekEnd}
						</Text>
					</View>
					<Text style={styles.headerBrand}>AXION</Text>
				</View>

				{/* Summary Metrics */}
				<View style={styles.section}>
					<Text style={styles.sectionTitle}>Performance Summary</Text>
					<View style={styles.metricsGrid}>
						<View style={styles.metricCard}>
							<Text style={styles.metricLabel}>Net P&L</Text>
							<PnlText value={summary.netPnl} />
						</View>
						<View style={styles.metricCard}>
							<Text style={styles.metricLabel}>Gross P&L</Text>
							<PnlText value={summary.grossPnl} />
						</View>
						<View style={styles.metricCard}>
							<Text style={styles.metricLabel}>Win Rate</Text>
							<Text style={styles.metricValue}>{formatPercent(summary.winRate)}</Text>
						</View>
						<View style={styles.metricCard}>
							<Text style={styles.metricLabel}>Profit Factor</Text>
							<Text style={styles.metricValue}>{summary.profitFactor.toFixed(2)}</Text>
						</View>
						<View style={styles.metricCard}>
							<Text style={styles.metricLabel}>Avg R</Text>
							<Text style={[styles.metricValue, summary.avgR >= 0 ? styles.positive : styles.negative]}>
								{formatR(summary.avgR)}
							</Text>
						</View>
						<View style={styles.metricCard}>
							<Text style={styles.metricLabel}>Trades</Text>
							<Text style={styles.metricValue}>
								{summary.totalTrades} ({summary.winCount}W / {summary.lossCount}L)
							</Text>
						</View>
					</View>
				</View>

				{/* Daily Breakdown */}
				{dailyBreakdown.length > 0 && (
					<View style={styles.section}>
						<Text style={styles.sectionTitle}>Daily Breakdown</Text>
						<View style={styles.table}>
							<View style={styles.tableHeader}>
								<Text style={[styles.tableHeaderCell, { width: "25%" }]}>Date</Text>
								<Text style={[styles.tableHeaderCell, { width: "15%" }]}>Trades</Text>
								<Text style={[styles.tableHeaderCell, { width: "15%" }]}>W/L</Text>
								<Text style={[styles.tableHeaderCell, { width: "20%" }]}>Win Rate</Text>
								<Text style={[styles.tableHeaderCell, { width: "25%" }]}>P&L</Text>
							</View>
							{dailyBreakdown.map((day, i) => (
								<View key={day.date} style={i % 2 === 0 ? styles.tableRow : styles.tableRowAlt}>
									<Text style={[styles.tableCell, { width: "25%" }]}>{day.date}</Text>
									<Text style={[styles.tableCell, { width: "15%" }]}>{day.tradeCount}</Text>
									<Text style={[styles.tableCell, { width: "15%" }]}>{day.winCount}/{day.lossCount}</Text>
									<Text style={[styles.tableCell, { width: "20%" }]}>{formatPercent(day.winRate)}</Text>
									<Text style={[styles.tableCell, { width: "25%" }, day.pnl >= 0 ? styles.positive : styles.negative]}>
										{formatCurrency(day.pnl)}
									</Text>
								</View>
							))}
						</View>
					</View>
				)}

				{/* Top Trades */}
				{(topWins.length > 0 || topLosses.length > 0) && (
					<View style={styles.section}>
						<Text style={styles.sectionTitle}>Top Trades</Text>
						<View style={{ flexDirection: "row", gap: 12 }}>
							{topWins.length > 0 && (
								<View style={{ flex: 1 }}>
									<Text style={[styles.metricLabel, { marginBottom: 4 }]}>Best Trades</Text>
									{topWins.slice(0, 3).map((trade) => (
										<View key={trade.id} style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 2 }}>
											<Text style={styles.tableCell}>{trade.asset} ({trade.direction})</Text>
											<Text style={[styles.tableCell, styles.positive]}>{formatCurrency(trade.pnl)}</Text>
										</View>
									))}
								</View>
							)}
							{topLosses.length > 0 && (
								<View style={{ flex: 1 }}>
									<Text style={[styles.metricLabel, { marginBottom: 4 }]}>Worst Trades</Text>
									{topLosses.slice(0, 3).map((trade) => (
										<View key={trade.id} style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 2 }}>
											<Text style={styles.tableCell}>{trade.asset} ({trade.direction})</Text>
											<Text style={[styles.tableCell, styles.negative]}>{formatCurrency(trade.pnl)}</Text>
										</View>
									))}
								</View>
							)}
						</View>
					</View>
				)}

				{/* Fee Impact */}
				{feeData && feeData.hasData && (
					<View style={styles.section}>
						<Text style={styles.sectionTitle}>Commission & Fee Impact</Text>
						<View style={styles.feeSection}>
							<View style={{ flexDirection: "row", justifyContent: "space-between" }}>
								<View>
									<Text style={styles.metricLabel}>Total Fees</Text>
									<Text style={[styles.tableCell, styles.negative]}>{formatCurrency(-feeData.summary.totalFees)}</Text>
								</View>
								<View>
									<Text style={styles.metricLabel}>Fees % of Gross</Text>
									<Text style={styles.tableCell}>
										{feeData.summary.grossPnl > 0 ? formatPercent(feeData.summary.feesAsPercentOfGross) : "—"}
									</Text>
								</View>
								<View>
									<Text style={styles.metricLabel}>Avg Fee/Trade</Text>
									<Text style={[styles.tableCell, styles.negative]}>{formatCurrency(-feeData.summary.avgFeePerTrade)}</Text>
								</View>
							</View>
						</View>
					</View>
				)}

				{/* Footer */}
				<View style={styles.footer}>
					<Text style={styles.footerText}>Generated by Axion</Text>
					<Text style={styles.footerText}>{generatedAt}</Text>
				</View>
			</Page>
		</Document>
	)
}

// ============================================================================
// MONTHLY REPORT TEMPLATE
// ============================================================================

interface MonthlyReportPdfProps {
	report: MonthlyReport
	feeData: CommissionFeeImpact | null
	generatedAt: string
}

const MonthlyReportPdf = ({ report, feeData, generatedAt }: MonthlyReportPdfProps) => {
	const { summary, weeklyBreakdown, assetBreakdown } = report

	return (
		<Document>
			<Page size="A4" style={styles.page}>
				{/* Header */}
				<View style={styles.header}>
					<View>
						<Text style={styles.headerTitle}>Monthly Report</Text>
						<Text style={styles.headerSubtitle}>
							{report.monthStart} — {report.monthEnd}
						</Text>
					</View>
					<Text style={styles.headerBrand}>AXION</Text>
				</View>

				{/* Summary Metrics */}
				<View style={styles.section}>
					<Text style={styles.sectionTitle}>Performance Summary</Text>
					<View style={styles.metricsGrid}>
						<View style={styles.metricCard}>
							<Text style={styles.metricLabel}>Net P&L</Text>
							<PnlText value={summary.netPnl} />
						</View>
						<View style={styles.metricCard}>
							<Text style={styles.metricLabel}>Gross P&L</Text>
							<PnlText value={summary.grossPnl} />
						</View>
						<View style={styles.metricCard}>
							<Text style={styles.metricLabel}>Win Rate</Text>
							<Text style={styles.metricValue}>{formatPercent(summary.winRate)}</Text>
						</View>
						<View style={styles.metricCard}>
							<Text style={styles.metricLabel}>Profit Factor</Text>
							<Text style={styles.metricValue}>{summary.profitFactor.toFixed(2)}</Text>
						</View>
						<View style={styles.metricCard}>
							<Text style={styles.metricLabel}>Avg R</Text>
							<Text style={[styles.metricValue, summary.avgR >= 0 ? styles.positive : styles.negative]}>
								{formatR(summary.avgR)}
							</Text>
						</View>
						<View style={styles.metricCard}>
							<Text style={styles.metricLabel}>Trades</Text>
							<Text style={styles.metricValue}>
								{summary.totalTrades} ({summary.winCount}W / {summary.lossCount}L)
							</Text>
						</View>
					</View>
				</View>

				{/* Weekly Breakdown */}
				{weeklyBreakdown.length > 0 && (
					<View style={styles.section}>
						<Text style={styles.sectionTitle}>Weekly Breakdown</Text>
						<View style={styles.table}>
							<View style={styles.tableHeader}>
								<Text style={[styles.tableHeaderCell, { width: "30%" }]}>Week</Text>
								<Text style={[styles.tableHeaderCell, { width: "15%" }]}>Trades</Text>
								<Text style={[styles.tableHeaderCell, { width: "20%" }]}>Win Rate</Text>
								<Text style={[styles.tableHeaderCell, { width: "35%" }]}>P&L</Text>
							</View>
							{weeklyBreakdown.map((week, i) => (
								<View key={week.weekStart} style={i % 2 === 0 ? styles.tableRow : styles.tableRowAlt}>
									<Text style={[styles.tableCell, { width: "30%" }]}>{week.weekStart} - {week.weekEnd}</Text>
									<Text style={[styles.tableCell, { width: "15%" }]}>{week.tradeCount}</Text>
									<Text style={[styles.tableCell, { width: "20%" }]}>{formatPercent(week.winRate)}</Text>
									<Text style={[styles.tableCell, { width: "35%" }, week.pnl >= 0 ? styles.positive : styles.negative]}>
										{formatCurrency(week.pnl)}
									</Text>
								</View>
							))}
						</View>
					</View>
				)}

				{/* Asset Breakdown */}
				{assetBreakdown.length > 0 && (
					<View style={styles.section}>
						<Text style={styles.sectionTitle}>Asset Performance</Text>
						<View style={styles.table}>
							<View style={styles.tableHeader}>
								<Text style={[styles.tableHeaderCell, { width: "25%" }]}>Asset</Text>
								<Text style={[styles.tableHeaderCell, { width: "15%" }]}>Trades</Text>
								<Text style={[styles.tableHeaderCell, { width: "20%" }]}>Win Rate</Text>
								<Text style={[styles.tableHeaderCell, { width: "40%" }]}>P&L</Text>
							</View>
							{assetBreakdown.map((asset, i) => (
								<View key={asset.asset} style={i % 2 === 0 ? styles.tableRow : styles.tableRowAlt}>
									<Text style={[styles.tableCell, { width: "25%" }]}>{asset.asset}</Text>
									<Text style={[styles.tableCell, { width: "15%" }]}>{asset.tradeCount}</Text>
									<Text style={[styles.tableCell, { width: "20%" }]}>{formatPercent(asset.winRate)}</Text>
									<Text style={[styles.tableCell, { width: "40%" }, asset.pnl >= 0 ? styles.positive : styles.negative]}>
										{formatCurrency(asset.pnl)}
									</Text>
								</View>
							))}
						</View>
					</View>
				)}

				{/* Best/Worst Days */}
				{(summary.bestDay || summary.worstDay) && (
					<View style={styles.section}>
						<Text style={styles.sectionTitle}>Notable Days</Text>
						<View style={{ flexDirection: "row", gap: 12 }}>
							{summary.bestDay && (
								<View style={[styles.metricCard, { flex: 1 }]}>
									<Text style={styles.metricLabel}>Best Day</Text>
									<Text style={styles.tableCell}>{summary.bestDay.date}</Text>
									<Text style={[styles.tableCell, styles.positive]}>{formatCurrency(summary.bestDay.pnl)}</Text>
								</View>
							)}
							{summary.worstDay && (
								<View style={[styles.metricCard, { flex: 1 }]}>
									<Text style={styles.metricLabel}>Worst Day</Text>
									<Text style={styles.tableCell}>{summary.worstDay.date}</Text>
									<Text style={[styles.tableCell, styles.negative]}>{formatCurrency(summary.worstDay.pnl)}</Text>
								</View>
							)}
						</View>
					</View>
				)}

				{/* Fee Impact */}
				{feeData && feeData.hasData && (
					<View style={styles.section}>
						<Text style={styles.sectionTitle}>Commission & Fee Impact</Text>
						<View style={styles.feeSection}>
							<View style={{ flexDirection: "row", justifyContent: "space-between" }}>
								<View>
									<Text style={styles.metricLabel}>Total Fees</Text>
									<Text style={[styles.tableCell, styles.negative]}>{formatCurrency(-feeData.summary.totalFees)}</Text>
								</View>
								<View>
									<Text style={styles.metricLabel}>Fees % of Gross</Text>
									<Text style={styles.tableCell}>
										{feeData.summary.grossPnl > 0 ? formatPercent(feeData.summary.feesAsPercentOfGross) : "—"}
									</Text>
								</View>
								<View>
									<Text style={styles.metricLabel}>Avg Fee/Trade</Text>
									<Text style={[styles.tableCell, styles.negative]}>{formatCurrency(-feeData.summary.avgFeePerTrade)}</Text>
								</View>
							</View>
						</View>
					</View>
				)}

				{/* Footer */}
				<View style={styles.footer}>
					<Text style={styles.footerText}>Generated by Axion</Text>
					<Text style={styles.footerText}>{generatedAt}</Text>
				</View>
			</Page>
		</Document>
	)
}

export { WeeklyReportPdf, MonthlyReportPdf }
export type { WeeklyReportPdfProps, MonthlyReportPdfProps }
