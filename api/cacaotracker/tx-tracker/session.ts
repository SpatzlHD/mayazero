import {
  createTxTrackerSession,
  errorResponse,
  jsonResponse,
} from '../_shared.js'

export async function POST(_request: Request): Promise<Response> {
  try {
    return jsonResponse(await createTxTrackerSession())
  } catch (error) {
    return errorResponse(error)
  }
}
