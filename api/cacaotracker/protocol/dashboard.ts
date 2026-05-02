import {
  createNodeHandler,
  errorResponse,
  fetchProtocolDashboard,
  jsonResponse,
} from '../_shared'

export async function GET(_request: Request): Promise<Response> {
  try {
    const body = await fetchProtocolDashboard()
    return jsonResponse(body)
  } catch (error) {
    return errorResponse(error)
  }
}

export default createNodeHandler(GET)
