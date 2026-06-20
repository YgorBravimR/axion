import { describe, it, expect } from "vitest"
import { parseCsvContent } from "@/lib/csv-parser"

describe("CSV Parser - Profit Chart Extension (Phase 2)", () => {
	it("should parse Profit Chart CSV with metadata columns (no encoding issues)", () => {
		const csvContent = `Ativo;Lado;Abertura;Fechamento;Qtd Compra;Qtd Venda;Preco Compra;Preco Venda;Res. Operacao;Ganho Max.;Perda Max.;Numero Operacao;Drawdown;MEP;MEN;Preco de Mercado;Medio
WIN;C;15/06/2026 09:30:00;15/06/2026 10:30:00;5;5;75000,00;75250,00;1250,00;1500,00;-750,00;12345;500,00;1500,00;750,00;75100,00;Nao
WIN;V;16/06/2026 10:00:00;16/06/2026 11:00:00;3;3;75500,00;75200,00;-900,00;600,00;-400,00;12346;300,00;600,00;400,00;75350,00;Sim`

		const result = parseCsvContent(csvContent)

		expect(result.success).toBe(true)
		expect(result.trades).toHaveLength(2)
		expect(result.profitOperations).toHaveLength(2)

		const trade1 = result.trades[0]!
		expect(trade1.asset).toBe("WIN")
		expect(trade1.direction).toBe("long")
		expect(trade1.positionSize).toBe(5)
		expect(trade1.entryPrice).toBe(75000)
		expect(trade1.exitPrice).toBe(75250)
		expect(trade1.profitOperationNumber).toBe(12345)
		expect(trade1.profitMetadata).toBeDefined()
		expect(trade1.profitMetadata!.marketPriceAtClose).toBe(75100)
		expect(trade1.profitMetadata!.wasAveraged).toBe(false)
		expect(trade1.profitMetadata!.profitDrawdown).toBe(500)
		expect(trade1.profitMetadata!.profitMep).toBe(1500)
		expect(trade1.profitMetadata!.profitMen).toBe(750)

		const trade2 = result.trades[1]!
		expect(trade2.asset).toBe("WIN")
		expect(trade2.direction).toBe("short")
		expect(trade2.profitOperationNumber).toBe(12346)
		expect(trade2.profitMetadata!.wasAveraged).toBe(true)
	})

	it("should reject rows with blank Fechamento (open positions)", () => {
		const csvContent = `Ativo;Lado;Abertura;Fechamento;Qtd Compra;Qtd Venda;Preco Compra;Preco Venda;Res. Operacao;Ganho Max.;Perda Max.;Numero Operacao
WIN;C;15/06/2026 09:30:00;;5;5;75000,00;75250,00;1250,00;1500,00;-750,00;12345
WIN;C;15/06/2026 10:30:00;15/06/2026 11:30:00;5;5;75000,00;75250,00;1250,00;1500,00;-750,00;12346`

		const result = parseCsvContent(csvContent)

		expect(result.success).toBe(true)
		expect(result.trades).toHaveLength(1)
		expect(result.warnings).toHaveLength(1)
		expect(result.warnings[0]!.message).toContain("Fechamento blank")
	})

	it("should handle multi-day Profit CSV exports", () => {
		const csvContent = `Ativo;Lado;Abertura;Fechamento;Qtd Compra;Qtd Venda;Preco Compra;Preco Venda;Res. Operacao;Ganho Max.;Perda Max.;Numero Operacao
WIN;C;14/06/2026 15:30:00;14/06/2026 16:30:00;5;5;75000,00;75250,00;1250,00;1500,00;-750,00;12340
WDO;V;15/06/2026 09:30:00;15/06/2026 10:30:00;2;2;10500,00;10400,00;-200,00;300,00;-100,00;12341
WIN;C;16/06/2026 10:00:00;16/06/2026 11:00:00;3;3;75500,00;75200,00;-900,00;600,00;-400,00;12342`

		const result = parseCsvContent(csvContent)

		expect(result.success).toBe(true)
		expect(result.trades).toHaveLength(3)
		expect(result.profitOperations).toHaveLength(3)

		const dates = new Set(
			result.trades.map((t) => {
				const d =
					t.entryDate instanceof Date ? t.entryDate : new Date(t.entryDate)
				return d.toDateString()
			})
		)
		expect(dates.size).toBe(3)
	})

	it("should preserve B3 asset normalization with Profit metadata", () => {
		const csvContent = `Ativo;Lado;Abertura;Fechamento;Qtd Compra;Qtd Venda;Preco Compra;Preco Venda;Res. Operacao;Ganho Max.;Perda Max.;Numero Operacao
WINM26;C;15/06/2026 09:30:00;15/06/2026 10:30:00;5;5;75000,00;75250,00;1250,00;1500,00;-750,00;12345`

		const result = parseCsvContent(csvContent)

		expect(result.success).toBe(true)
		expect(result.trades).toHaveLength(1)

		const trade = result.trades[0]!
		expect(trade.asset).toBe("WIN")
		expect(trade.normalizedAsset).toBe("WIN")
		expect(trade.originalAssetCode).toBe("WINM26")
		expect(trade.profitOperationNumber).toBe(12345)
	})

	it("should track Profit operations separately from standard trades", () => {
		const csvContent = `Ativo;Lado;Abertura;Fechamento;Qtd Compra;Qtd Venda;Preco Compra;Preco Venda;Res. Operacao;Ganho Max.;Perda Max.;Numero Operacao
WIN;C;15/06/2026 09:30:00;15/06/2026 10:30:00;5;5;75000,00;75250,00;1250,00;1500,00;-750,00;12345`

		const result = parseCsvContent(csvContent)

		expect(result.trades).toHaveLength(1)
		expect(result.profitOperations).toHaveLength(1)

		const profitOp = result.profitOperations![0]!
		expect(profitOp.profitOperationNumber).toBe(12345)
		expect(profitOp.profitMetadata).toBeDefined()
	})
})
