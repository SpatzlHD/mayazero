import {
  createNodeHandler,
  errorResponse,
  fetchLiquidityPoolDetail,
  jsonResponse,
  readPathSegment,
} from '../../../_shared'

export async function GET(request: Request): Promise<Response> {
  try {
    const address = readPathSegment(request, 3, 'wallet address')
    const pool = readPathSegment(request, 5, 'pool')
    return jsonResponse(await fetchLiquidityPoolDetail(address, pool))
  } catch (error) {
    return errorResponse(error)
  }
}

export default createNodeHandler(GET)
