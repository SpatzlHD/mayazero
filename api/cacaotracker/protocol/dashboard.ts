import {
  errorResponse,
  fetchProtocolDashboard,
  jsonResponse,
} from '../_shared.js'

export async function GET(_request: Request): Promise<Response> {
  try {
    const body = await fetchProtocolDashboard()
    return jsonResponse(body)
  } catch (error) {
    return errorResponse(error)
  }
}
