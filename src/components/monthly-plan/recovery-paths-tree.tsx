"use client"

import { useMemo } from "react"
import { fromCents } from "@/lib/money"
import type { TradeSituation } from "./decision-tree-modal"
import type { GainMode } from "@/types/risk-profile"

// ─── Types ─────────────────────────────────────────────────

interface RootNode {
	id: string
	type: "root"
	depth: 0
	riskCents: number
	children: { loss: TreeNode; gain: TreeNode }
	x: number
	y: number
}

interface DecisionNode {
	id: string
	type: "decision"
	depth: number
	tradeNumber: number
	riskCents: number
	children: { loss: TreeNode; gain: TreeNode }
	x: number
	y: number
}

interface LeafNode {
	id: string
	type: "leaf"
	depth: number
	totalPnlCents: number
	pathPattern: string
	probability: number
	wins: number
	losses: number
	leafIndex: number
	status?: "stop" | "target" | "exit" | "continues"
	x: number
	y: number
}

type TreeNode = RootNode | DecisionNode | LeafNode

interface EdgeInfo {
	key: string
	x1: number
	y1: number
	x2: number
	y2: number
	variant: "loss" | "gain"
	amountCents: number
}

// ─── Constants ─────────────────────────────────────────────

const NODE_WIDTH = 140
const NODE_HEIGHT = 60
const LEAF_HEIGHT = 95
const DIAMOND_SIZE = 80
const LEVEL_GAP = 120
const LEAF_GAP = 50
const PADDING = 40
const HALF_DIAMOND = DIAMOND_SIZE / 2
const WIN_RATE = 0.5
const MAX_COMPOUNDING_DEPTH = 4

// ─── Tree Construction ─────────────────────────────────────

interface TreeBuildResult {
	root: RootNode
	leaves: LeafNode[]
	maxDepth: number
}

interface BuildConfig {
	situations: TradeSituation[]
	rewardRatio: number
	executeAllRegardless: boolean
	gainMode: GainMode
	baseRiskCents: number
	stopAfterSequence: boolean
}

const buildDecisionTree = (config: BuildConfig): TreeBuildResult | null => {
	const {
		situations,
		rewardRatio,
		executeAllRegardless,
		gainMode,
		baseRiskCents,
		stopAfterSequence,
	} = config

	const leaves: LeafNode[] = []
	let leafCounter = 0
	let maxDepth = 0

	const makeLeaf = (
		depth: number,
		totalPnlCents: number,
		pathParts: string[],
		wins: number,
		losses: number,
		status?: LeafNode["status"]
	): LeafNode => {
		const leaf: LeafNode = {
			id: `leaf-${leafCounter}`,
			type: "leaf",
			depth,
			totalPnlCents,
			pathPattern: pathParts.join("-"),
			probability:
				Math.pow(WIN_RATE, wins) * Math.pow(1 - WIN_RATE, losses),
			wins,
			losses,
			leafIndex: leafCounter++,
			status,
			x: 0,
			y: 0,
		}
		maxDepth = Math.max(maxDepth, leaf.depth)
		leaves.push(leaf)
		return leaf
	}

	// ── Loss Subtree (recovery) ──────────────────────────

	const buildLossSubtree = (
		stepIndex: number,
		treeDepth: number,
		cumulativePnlCents: number,
		pathParts: string[],
		wins: number,
		losses: number
	): TreeNode => {
		if (situations.length <= 1) {
			// No recovery steps — single leaf at -baseRiskCents
			return makeLeaf(
				treeDepth,
				cumulativePnlCents,
				pathParts,
				wins,
				losses,
				"stop"
			)
		}

		const situationIdx = stepIndex + 1
		if (situationIdx >= situations.length) {
			return makeLeaf(
				treeDepth,
				cumulativePnlCents,
				pathParts,
				wins,
				losses,
				"stop"
			)
		}

		const situation = situations[situationIdx]
		const gainCents = situation.riskCents * rewardRatio
		const isLastStep = situationIdx >= situations.length - 1

		const node: DecisionNode = {
			id: `d-${situation.tradeNumber}-${pathParts.join("")}`,
			type: "decision",
			depth: treeDepth,
			tradeNumber: situation.tradeNumber,
			riskCents: situation.riskCents,
			children: {
				loss: null as unknown as TreeNode,
				gain: null as unknown as TreeNode,
			},
			x: 0,
			y: 0,
		}

		// LOSS branch
		const lossPnl = cumulativePnlCents - situation.riskCents
		const lossPath = [...pathParts, "L"]
		const lossLosses = losses + 1

		if (isLastStep) {
			node.children.loss = makeLeaf(
				treeDepth + 1,
				lossPnl,
				lossPath,
				wins,
				lossLosses,
				"stop"
			)
		} else {
			node.children.loss = buildLossSubtree(
				stepIndex + 1,
				treeDepth + 1,
				lossPnl,
				lossPath,
				wins,
				lossLosses
			)
		}

		// GAIN branch
		const gainPnl = cumulativePnlCents + gainCents
		const gainPath = [...pathParts, "G"]
		const gainWins = wins + 1

		if (!executeAllRegardless || isLastStep) {
			// Recovery win: exit or stop depending on stopAfterSequence
			const gainStatus: LeafNode["status"] = stopAfterSequence
				? "stop"
				: "exit"
			node.children.gain = makeLeaf(
				treeDepth + 1,
				gainPnl,
				gainPath,
				gainWins,
				losses,
				gainStatus
			)
		} else {
			node.children.gain = buildLossSubtree(
				stepIndex + 1,
				treeDepth + 1,
				gainPnl,
				gainPath,
				gainWins,
				losses
			)
		}

		return node
	}

	// ── Gain Subtree ─────────────────────────────────────

	const buildGainSubtree = (
		treeDepth: number,
		cumulativePnlCents: number,
		pathParts: string[],
		wins: number,
		losses: number
	): TreeNode => {
		if (gainMode.type === "singleTarget") {
			const gainPerTrade = baseRiskCents * rewardRatio
			const tradesToTarget = Math.ceil(
				gainMode.dailyTargetCents / gainPerTrade
			)

			// T1 gain alone >= target
			if (tradesToTarget <= 1) {
				return makeLeaf(
					treeDepth,
					cumulativePnlCents,
					pathParts,
					wins,
					losses,
					"target"
				)
			}

			// Build chain of decisions for singleTarget
			return buildSingleTargetChain(
				treeDepth,
				cumulativePnlCents,
				pathParts,
				wins,
				losses,
				gainPerTrade,
				tradesToTarget,
				1 // already counted T1 gain
			)
		}

		if (gainMode.type === "gainSequence") {
			return buildGainSequenceChain(
				treeDepth,
				cumulativePnlCents,
				pathParts,
				wins,
				losses,
				0,
				1,
				baseRiskCents
			)
		}

		// Compounding variant
		return buildCompoundingChain(
			treeDepth,
			cumulativePnlCents,
			pathParts,
			wins,
			losses,
			cumulativePnlCents, // accumulated gains = pnl so far (since we start from T1 gain)
			1 // depth counter for compounding
		)
	}

	const buildSingleTargetChain = (
		treeDepth: number,
		cumulativePnlCents: number,
		pathParts: string[],
		wins: number,
		losses: number,
		gainPerTrade: number,
		tradesToTarget: number,
		gainsAccumulated: number
	): TreeNode => {
		if (gainsAccumulated >= tradesToTarget) {
			return makeLeaf(
				treeDepth,
				cumulativePnlCents,
				pathParts,
				wins,
				losses,
				"target"
			)
		}

		const tradeNumber = gainsAccumulated + 1 // T2, T3, etc. on the gain side
		const node: DecisionNode = {
			id: `dg-${tradeNumber}-${pathParts.join("")}`,
			type: "decision",
			depth: treeDepth,
			tradeNumber,
			riskCents: baseRiskCents,
			children: {
				loss: null as unknown as TreeNode,
				gain: null as unknown as TreeNode,
			},
			x: 0,
			y: 0,
		}

		// Loss on gain side → stop
		const lossPnl = cumulativePnlCents - baseRiskCents
		const lossPath = [...pathParts, "L"]
		node.children.loss = makeLeaf(
			treeDepth + 1,
			lossPnl,
			lossPath,
			wins,
			losses + 1,
			"stop"
		)

		// Win on gain side → check if target reached
		const winPnl = cumulativePnlCents + gainPerTrade
		const winPath = [...pathParts, "G"]
		const newGains = gainsAccumulated + 1

		if (newGains >= tradesToTarget) {
			node.children.gain = makeLeaf(
				treeDepth + 1,
				winPnl,
				winPath,
				wins + 1,
				losses,
				"target"
			)
		} else {
			node.children.gain = buildSingleTargetChain(
				treeDepth + 1,
				winPnl,
				winPath,
				wins + 1,
				losses,
				gainPerTrade,
				tradesToTarget,
				newGains
			)
		}

		return node
	}

	const computeGainStepRisk = (
		step: { riskCalculation: { type: string; percent?: number; amountCents?: number } },
		prevRiskCents: number
	): number => {
		if (step.riskCalculation.type === "percentOfBase") {
			return Math.round((baseRiskCents * (step.riskCalculation.percent ?? 100)) / 100)
		}
		if (step.riskCalculation.type === "fixedCents") {
			return step.riskCalculation.amountCents ?? 0
		}
		return prevRiskCents
	}

	const buildGainSequenceChain = (
		treeDepth: number,
		cumulativePnlCents: number,
		pathParts: string[],
		wins: number,
		losses: number,
		stepIndex: number,
		chainDepth: number,
		previousStepRiskCents: number
	): TreeNode => {
		if (gainMode.type !== "gainSequence") {
			return makeLeaf(treeDepth, cumulativePnlCents, pathParts, wins, losses, "stop")
		}

		// Cap depth to prevent infinite recursion (repeatLastStep)
		if (chainDepth > MAX_COMPOUNDING_DEPTH) {
			return makeLeaf(treeDepth, cumulativePnlCents, pathParts, wins, losses, "continues")
		}

		// Check target already hit
		if (gainMode.dailyTargetCents !== null && cumulativePnlCents >= gainMode.dailyTargetCents) {
			return makeLeaf(treeDepth, cumulativePnlCents, pathParts, wins, losses, "target")
		}

		const seqLen = gainMode.sequence.length
		let step: (typeof gainMode.sequence)[number]

		if (stepIndex < seqLen) {
			step = gainMode.sequence[stepIndex]
		} else if (gainMode.repeatLastStep && seqLen > 0) {
			step = gainMode.sequence[seqLen - 1]
		} else {
			// Sequence exhausted, no repeat
			return makeLeaf(treeDepth, cumulativePnlCents, pathParts, wins, losses, "stop")
		}

		const stepRiskCents = computeGainStepRisk(step, previousStepRiskCents)

		if (stepRiskCents <= 0) {
			return makeLeaf(treeDepth, cumulativePnlCents, pathParts, wins, losses, "continues")
		}

		const gainCents = stepRiskCents * rewardRatio
		const tradeNumber = chainDepth + 1

		const node: DecisionNode = {
			id: `dg-${tradeNumber}-${pathParts.join("")}`,
			type: "decision",
			depth: treeDepth,
			tradeNumber,
			riskCents: stepRiskCents,
			children: {
				loss: null as unknown as TreeNode,
				gain: null as unknown as TreeNode,
			},
			x: 0,
			y: 0,
		}

		// Loss branch
		const lossPnl = cumulativePnlCents - stepRiskCents
		const lossPath = [...pathParts, "L"]

		if (gainMode.stopOnFirstLoss) {
			node.children.loss = makeLeaf(treeDepth + 1, lossPnl, lossPath, wins, losses + 1, "stop")
		} else {
			node.children.loss = buildGainSequenceChain(
				treeDepth + 1, lossPnl, lossPath, wins, losses + 1,
				stepIndex + 1, chainDepth + 1, stepRiskCents
			)
		}

		// Win branch — check target, then continue
		const winPnl = cumulativePnlCents + gainCents
		const winPath = [...pathParts, "G"]

		if (gainMode.dailyTargetCents !== null && winPnl >= gainMode.dailyTargetCents) {
			node.children.gain = makeLeaf(treeDepth + 1, winPnl, winPath, wins + 1, losses, "target")
		} else {
			node.children.gain = buildGainSequenceChain(
				treeDepth + 1, winPnl, winPath, wins + 1, losses,
				stepIndex + 1, chainDepth + 1, stepRiskCents
			)
		}

		return node
	}

	const buildCompoundingChain = (
		treeDepth: number,
		cumulativePnlCents: number,
		pathParts: string[],
		wins: number,
		losses: number,
		accumulatedGainsCents: number,
		compoundingDepth: number
	): TreeNode => {
		// Truncate at MAX_COMPOUNDING_DEPTH
		if (compoundingDepth > MAX_COMPOUNDING_DEPTH) {
			return makeLeaf(
				treeDepth,
				cumulativePnlCents,
				pathParts,
				wins,
				losses,
				"continues"
			)
		}

		// Check for target hit
		if (
			gainMode.type === "compounding" &&
			gainMode.dailyTargetCents !== null &&
			cumulativePnlCents >= gainMode.dailyTargetCents
		) {
			return makeLeaf(
				treeDepth,
				cumulativePnlCents,
				pathParts,
				wins,
				losses,
				"target"
			)
		}

		const riskCents = Math.round(
			(accumulatedGainsCents *
				(gainMode.type === "compounding"
					? gainMode.reinvestmentPercent
					: 100)) /
				100
		)
		// If risk rounds to 0, can't continue
		if (riskCents <= 0) {
			return makeLeaf(
				treeDepth,
				cumulativePnlCents,
				pathParts,
				wins,
				losses,
				"continues"
			)
		}

		const gainCents = riskCents * rewardRatio
		const tradeNumber = compoundingDepth + 1 // T2, T3, etc.

		const node: DecisionNode = {
			id: `dg-${tradeNumber}-${pathParts.join("")}`,
			type: "decision",
			depth: treeDepth,
			tradeNumber,
			riskCents,
			children: {
				loss: null as unknown as TreeNode,
				gain: null as unknown as TreeNode,
			},
			x: 0,
			y: 0,
		}

		// Loss → stop
		const lossPnl = cumulativePnlCents - riskCents
		const lossPath = [...pathParts, "L"]
		node.children.loss = makeLeaf(
			treeDepth + 1,
			lossPnl,
			lossPath,
			wins,
			losses + 1,
			"stop"
		)

		// Win → continue compounding
		const winPnl = cumulativePnlCents + gainCents
		const winPath = [...pathParts, "G"]
		const newAccumulated = accumulatedGainsCents + gainCents
		const isLastCompounding = compoundingDepth + 1 >= MAX_COMPOUNDING_DEPTH

		// Check target after win
		if (
			gainMode.type === "compounding" &&
			gainMode.dailyTargetCents !== null &&
			winPnl >= gainMode.dailyTargetCents
		) {
			node.children.gain = makeLeaf(
				treeDepth + 1,
				winPnl,
				winPath,
				wins + 1,
				losses,
				"target"
			)
		} else if (isLastCompounding) {
			node.children.gain = makeLeaf(
				treeDepth + 1,
				winPnl,
				winPath,
				wins + 1,
				losses,
				"continues"
			)
		} else {
			node.children.gain = buildCompoundingChain(
				treeDepth + 1,
				winPnl,
				winPath,
				wins + 1,
				losses,
				newAccumulated,
				compoundingDepth + 1
			)
		}

		return node
	}

	// ── Build the full tree from T1 as root ──────────────

	const t1GainCents = baseRiskCents * rewardRatio

	const lossChild = buildLossSubtree(
		0,
		1,
		-baseRiskCents,
		["L"],
		0,
		1
	)

	const gainChild = buildGainSubtree(
		1,
		t1GainCents,
		["G"],
		1,
		0
	)

	const root: RootNode = {
		id: "root",
		type: "root",
		depth: 0,
		riskCents: baseRiskCents,
		children: { loss: lossChild, gain: gainChild },
		x: 0,
		y: 0,
	}

	return { root, leaves, maxDepth }
}

// ─── Layout ────────────────────────────────────────────────

interface LayoutDimensions {
	width: number
	height: number
}

const assignPositions = (
	root: RootNode,
	leaves: LeafNode[],
	maxDepth: number
): LayoutDimensions => {
	const leafCount = leaves.length
	const totalLeafWidth = leafCount * NODE_WIDTH + (leafCount - 1) * LEAF_GAP
	const width = totalLeafWidth + 2 * PADDING
	const height = (maxDepth + 1) * LEVEL_GAP + 2 * PADDING

	// Assign leaf X based on left-to-right leafIndex ordering
	for (const leaf of leaves) {
		leaf.x =
			PADDING + leaf.leafIndex * (NODE_WIDTH + LEAF_GAP) + NODE_WIDTH / 2
		leaf.y = PADDING + leaf.depth * LEVEL_GAP
	}

	// Bottom-up: internal node X = midpoint of children
	const assignNode = (node: TreeNode): void => {
		if (node.type === "leaf") return

		assignNode(node.children.loss)
		assignNode(node.children.gain)
		node.x = (node.children.loss.x + node.children.gain.x) / 2
		node.y = PADDING + node.depth * LEVEL_GAP
	}

	assignNode(root)
	return { width, height }
}

// ─── Render Data Collection ────────────────────────────────

const getChildTopY = (child: TreeNode): number => {
	if (child.type === "decision") return child.y - HALF_DIAMOND
	if (child.type === "leaf") return child.y - LEAF_HEIGHT / 2
	return child.y - NODE_HEIGHT / 2
}

const collectEdges = (
	root: RootNode,
	rewardRatio: number
): EdgeInfo[] => {
	const edges: EdgeInfo[] = []

	const traverse = (node: TreeNode): void => {
		if (node.type === "leaf") return

		const { loss, gain } = node.children
		const bottomY =
			node.y + (node.type === "root" ? NODE_HEIGHT / 2 : HALF_DIAMOND)

		edges.push({
			key: `edge-${node.id}-loss`,
			x1: node.x,
			y1: bottomY,
			x2: loss.x,
			y2: getChildTopY(loss),
			variant: "loss",
			amountCents: node.riskCents,
		})
		traverse(loss)

		edges.push({
			key: `edge-${node.id}-gain`,
			x1: node.x,
			y1: bottomY,
			x2: gain.x,
			y2: getChildTopY(gain),
			variant: "gain",
			amountCents: node.riskCents * rewardRatio,
		})
		traverse(gain)
	}

	traverse(root)
	return edges
}

const collectNodes = (root: RootNode): TreeNode[] => {
	const nodes: TreeNode[] = []

	const traverse = (node: TreeNode): void => {
		nodes.push(node)
		if (node.type !== "leaf") {
			traverse(node.children.loss)
			traverse(node.children.gain)
		}
	}

	traverse(root)
	return nodes
}

// ─── SVG Helpers ───────────────────────────────────────────

const diamondPoints = (cx: number, cy: number, r: number): string =>
	`${cx},${cy - r} ${cx + r},${cy} ${cx},${cy + r} ${cx - r},${cy}`

const getLeafStrokeColor = (leaf: LeafNode, baseRiskCents: number): string => {
	if (leaf.status === "continues") return "var(--color-acc-100)"
	if (leaf.status === "target") return "var(--color-trade-buy)"
	if (leaf.totalPnlCents > 0) return "var(--color-trade-buy)"
	if (leaf.totalPnlCents >= -(baseRiskCents / 2)) return "var(--color-warning)"
	return "var(--color-trade-sell)"
}

const formatProbability = (p: number): string => {
	const pct = p * 100
	if (Number.isInteger(pct)) return `${pct}%`
	if (pct >= 1) return `${pct.toFixed(1)}%`
	return `${pct.toFixed(2)}%`
}

const getEdgeStrokeColor = (variant: EdgeInfo["variant"]): string =>
	variant === "loss" ? "var(--color-trade-sell)" : "var(--color-trade-buy)"

// ─── SVG Sub-components (module-private) ───────────────────

interface SvgRootNodeProps {
	x: number
	y: number
	title: string
	subtitle: string
}

const SvgRootNode = ({ x, y, title, subtitle }: SvgRootNodeProps) => (
	<g>
		<rect
			x={x - NODE_WIDTH / 2}
			y={y - NODE_HEIGHT / 2}
			width={NODE_WIDTH}
			height={NODE_HEIGHT}
			rx={8}
			fill="var(--color-acc-100)"
		/>
		<text
			x={x}
			y={y - 8}
			textAnchor="middle"
			dominantBaseline="central"
			fontSize={11}
			fontWeight={700}
			fill="white"
		>
			{title}
		</text>
		<text
			x={x}
			y={y + 12}
			textAnchor="middle"
			dominantBaseline="central"
			fontSize={10}
			fill="rgba(255,255,255,0.8)"
		>
			{subtitle}
		</text>
	</g>
)

interface SvgDecisionNodeProps {
	x: number
	y: number
	tradeLabel: string
	riskLabel: string
}

const SvgDecisionNode = ({
	x,
	y,
	tradeLabel,
	riskLabel,
}: SvgDecisionNodeProps) => (
	<g>
		<polygon
			points={diamondPoints(x, y, HALF_DIAMOND)}
			fill="var(--color-bg-200)"
			stroke="var(--color-acc-100)"
			strokeWidth={2}
		/>
		<text
			x={x}
			y={y - 8}
			textAnchor="middle"
			dominantBaseline="central"
			fontSize={11}
			fontWeight={700}
			fill="var(--color-txt-100)"
		>
			{tradeLabel}
		</text>
		<text
			x={x}
			y={y + 10}
			textAnchor="middle"
			dominantBaseline="central"
			fontSize={10}
			fill="var(--color-txt-300)"
		>
			{riskLabel}
		</text>
	</g>
)

interface SvgLeafNodeProps {
	x: number
	y: number
	pnlLabel: string
	pnlColor: string
	strokeColor: string
	pathPattern: string
	probabilityLabel: string
	statusLabel?: string
}

const SvgLeafNode = ({
	x,
	y,
	pnlLabel,
	pnlColor,
	strokeColor,
	pathPattern,
	probabilityLabel,
	statusLabel,
}: SvgLeafNodeProps) => (
	<g>
		<rect
			x={x - NODE_WIDTH / 2}
			y={y - LEAF_HEIGHT / 2}
			width={NODE_WIDTH}
			height={LEAF_HEIGHT}
			rx={8}
			fill="var(--color-bg-200)"
			stroke={strokeColor}
			strokeWidth={2}
		/>
		<text
			x={x}
			y={y - 26}
			textAnchor="middle"
			dominantBaseline="central"
			fontSize={13}
			fontWeight={700}
			fill={pnlColor}
		>
			{pnlLabel}
		</text>
		<text
			x={x}
			y={y - 8}
			textAnchor="middle"
			dominantBaseline="central"
			fontSize={9}
			fill="var(--color-txt-300)"
		>
			{pathPattern}
		</text>
		<text
			x={x}
			y={y + 10}
			textAnchor="middle"
			dominantBaseline="central"
			fontSize={9}
			fill="var(--color-txt-300)"
		>
			{probabilityLabel}
		</text>
		{statusLabel && (
			<text
				x={x}
				y={y + 28}
				textAnchor="middle"
				dominantBaseline="central"
				fontSize={9}
				fontWeight={700}
				fill={strokeColor}
			>
				{statusLabel}
			</text>
		)}
	</g>
)

interface SvgTreeEdgeProps {
	x1: number
	y1: number
	x2: number
	y2: number
	strokeColor: string
	label: string
	variant: EdgeInfo["variant"]
}

// Stagger loss/gain labels at different positions along the edge so
// sibling edges that share the same origin don't overlap each other
const LABEL_T_LOSS = 0.3
const LABEL_T_GAIN = 0.6

const SvgTreeEdge = ({
	x1,
	y1,
	x2,
	y2,
	strokeColor,
	label,
	variant,
}: SvgTreeEdgeProps) => {
	const t = variant === "gain" ? LABEL_T_GAIN : LABEL_T_LOSS
	const labelX = x1 + (x2 - x1) * t
	const labelY = y1 + (y2 - y1) * t
	const labelWidth = label.length > 0 ? Math.max(label.length * 6.2 + 16, 70) : 0

	return (
		<g>
			<line
				x1={x1}
				y1={y1}
				x2={x2}
				y2={y2}
				stroke={strokeColor}
				strokeWidth={2}
			/>
			{label.length > 0 && (
				<>
					<rect
						x={labelX - labelWidth / 2}
						y={labelY - 10}
						width={labelWidth}
						height={20}
						rx={4}
						fill="var(--color-bg-100)"
						fillOpacity={0.95}
					/>
					<text
						x={labelX}
						y={labelY}
						textAnchor="middle"
						dominantBaseline="central"
						fontSize={10}
						fontWeight={600}
						fill={strokeColor}
					>
						{label}
					</text>
				</>
			)}
		</g>
	)
}

// ─── Main Component ────────────────────────────────────────

interface RecoveryPathsTreeProps {
	situations: TradeSituation[]
	executeAllRegardless: boolean
	rewardRatio: number
	formatCurrency: (value: number) => string
	t: (key: string, values?: Record<string, string | number>) => string
	gainMode: GainMode
	baseRiskCents: number
	stopAfterSequence: boolean
}

const RecoveryPathsTree = ({
	situations,
	executeAllRegardless,
	rewardRatio,
	formatCurrency,
	t,
	gainMode,
	baseRiskCents,
	stopAfterSequence,
}: RecoveryPathsTreeProps) => {
	const treeData = useMemo(() => {
		const result = buildDecisionTree({
			situations,
			rewardRatio,
			executeAllRegardless,
			gainMode,
			baseRiskCents,
			stopAfterSequence,
		})
		if (!result) return null

		const layout = assignPositions(result.root, result.leaves, result.maxDepth)
		const edges = collectEdges(result.root, rewardRatio)
		const nodes = collectNodes(result.root)

		return {
			root: result.root,
			leaves: result.leaves,
			edges,
			nodes,
			...layout,
		}
	}, [situations, rewardRatio, executeAllRegardless, gainMode, baseRiskCents, stopAfterSequence])

	if (!treeData) {
		return (
			<p className="text-tiny text-txt-300 py-m-400 text-center">
				{t("paths.noRecovery")}
			</p>
		)
	}

	const getEdgeLabel = (edge: EdgeInfo): string => {
		if (edge.variant === "loss") {
			return t("paths.loss", {
				amount: `-${formatCurrency(fromCents(edge.amountCents))}`,
			})
		}
		if (edge.variant === "gain") {
			return t("paths.gain", {
				amount: `+${formatCurrency(fromCents(edge.amountCents))}`,
			})
		}
		return ""
	}

	const getLeafPnlLabel = (leaf: LeafNode): string => {
		const sign = leaf.totalPnlCents >= 0 ? "+" : "-"
		return `${sign}${formatCurrency(fromCents(Math.abs(leaf.totalPnlCents)))}`
	}

	const getStatusLabel = (leaf: LeafNode): string | undefined => {
		if (!leaf.status) return undefined
		return t(`paths.${leaf.status}`)
	}

	return (
		<div className="space-y-s-300">
			<div className="overflow-x-auto rounded-lg flex justify-center">
				<svg
					width={treeData.width}
					height={treeData.height}
					viewBox={`0 0 ${treeData.width} ${treeData.height}`}
					aria-label={t("paths.ariaLabel")}
					role="img"
					className="font-sans"
				>
					{/* Edges (drawn first — behind nodes) */}
					<g>
						{treeData.edges.map((edge) => (
							<SvgTreeEdge
								key={edge.key}
								x1={edge.x1}
								y1={edge.y1}
								x2={edge.x2}
								y2={edge.y2}
								strokeColor={getEdgeStrokeColor(edge.variant)}
								label={getEdgeLabel(edge)}
								variant={edge.variant}
							/>
						))}
					</g>

					{/* Nodes (drawn on top) */}
					<g>
						{treeData.nodes.map((node) => {
							if (node.type === "root") {
								return (
									<SvgRootNode
										key={node.id}
										x={node.x}
										y={node.y}
										title={t("paths.tradeRoot", { number: 1 })}
										subtitle={t("paths.risk", {
											amount: formatCurrency(fromCents(node.riskCents)),
										})}
									/>
								)
							}
							if (node.type === "decision") {
								return (
									<SvgDecisionNode
										key={node.id}
										x={node.x}
										y={node.y}
										tradeLabel={t("paths.trade", {
											number: node.tradeNumber,
										})}
										riskLabel={t("paths.risk", {
											amount: formatCurrency(fromCents(node.riskCents)),
										})}
									/>
								)
							}
							if (node.type === "leaf") {
								const leafStroke = getLeafStrokeColor(node, baseRiskCents)
								return (
									<SvgLeafNode
										key={node.id}
										x={node.x}
										y={node.y}
										pnlLabel={getLeafPnlLabel(node)}
										pnlColor={leafStroke}
										strokeColor={leafStroke}
										pathPattern={node.pathPattern}
										probabilityLabel={t("paths.probability", {
											value: formatProbability(node.probability),
										})}
										statusLabel={getStatusLabel(node)}
									/>
								)
							}
							return null
						})}
					</g>
				</svg>
			</div>

			<p className="text-tiny text-txt-300 text-center italic">
				{t("paths.assumedWinRate")}
			</p>
		</div>
	)
}

// ─── Exports ───────────────────────────────────────────────

export { RecoveryPathsTree }
export type { RecoveryPathsTreeProps }
