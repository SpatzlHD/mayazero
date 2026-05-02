import {
  createNodeHandler,
  errorResponse,
  fetchWalletSummary,
  jsonResponse,
  readPathSegment,
} from '../../_shared'

export async function GET(request: Request): Promise<Response> {
  try {
    const address = readPathSegment(request, 3, 'wallet address')
    return jsonResponse(await fetchWalletSummary(address))
  } catch (error) {
    return errorResponse(error)
  }
}

export default createNodeHandler(GET)
