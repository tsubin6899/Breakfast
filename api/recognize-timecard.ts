import { getSession } from "./_lib/auth.js";
import { handleTimecardRecognition } from "./_lib/timecard-core.js";

export const maxDuration = 60;

export default {
  async fetch(request: Request) {
    const user = await getSession(request);
    return handleTimecardRecognition(request, {
      authenticated: Boolean(user),
      requestId: request.headers.get("x-vercel-id") || crypto.randomUUID()
    });
  }
};
