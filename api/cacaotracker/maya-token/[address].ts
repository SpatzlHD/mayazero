import {
  errorResponse,
  fetchMayaTokenRewards,
  jsonResponse,
  readPathSegment,
} from '../_shared.js'

export async function GET(request: Request): Promise<Response> {
  try {
    const address = readPathSegment(request, 3, 'wallet address')
    return jsonResponse(await fetchMayaTokenRewards(address))
  } catch (error) {
    return errorResponse(error)
  }
}
