import {
  createNodeHandler,
  errorResponse,
  fetchWalletActivity,
  jsonResponse,
  readPathSegment,
} from '../../_shared'

export async function GET(request: Request): Promise<Response> {
  try {
    const address = readPathSegment(request, 3, 'wallet address')
    return jsonResponse(await fetchWalletActivity(address))
  } catch (error) {
    return errorResponse(error)
  }
}

export default createNodeHandler(GET)
