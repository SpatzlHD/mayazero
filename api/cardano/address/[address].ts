import {
  errorResponse,
  fetchCardanoAddressBalance,
  jsonResponse,
  readPathSegment,
} from '../_shared.js'

export async function GET(
  request: Request,
  dependencies: Parameters<typeof fetchCardanoAddressBalance>[1] = {},
): Promise<Response> {
  try {
    const address = readPathSegment(request, 3, 'Cardano address')
    return jsonResponse(await fetchCardanoAddressBalance(address, dependencies))
  } catch (error) {
    return errorResponse(error)
  }
}
