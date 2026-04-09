import { connection } from "next/server"
import { getAssetsWithPriceData } from "@/app/actions/candle-query"
import { CandleTestContent } from "@/components/candle-test/candle-test-content"

const CandleTestPage = async () => {
	await connection()
	const result = await getAssetsWithPriceData()

	return (
		<div className="p-m-400 sm:p-m-500 lg:p-m-600">
			<h1 className="text-h2 text-txt-100 font-semibold mb-m-500">
				Candle Data Test
			</h1>
			<CandleTestContent dataSources={result.data} />
		</div>
	)
}

export { CandleTestPage as default }
