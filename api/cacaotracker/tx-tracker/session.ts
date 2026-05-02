import {
  createNodeRouteHandler,
  createTxTrackerSession,
  errorResponse,
  jsonResponse,
} from '../_shared'

export async function POST(request: Request): Promise<Response> {
  try {
    return jsonResponse(await createTxTrackerSession())
  } catch (error) {
    return errorResponse(error)
  }
}

export default createNodeRouteHandler({
  POST,
})
