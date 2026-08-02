import { getSession } from "../_lib/auth.js";
import { json } from "../_lib/http.js";

export default {
  async fetch(request: Request) {
    const user = await getSession(request);
    return user ? json({ user }) : json({ user: null, error: "UNAUTHORIZED" }, 401);
  }
};
