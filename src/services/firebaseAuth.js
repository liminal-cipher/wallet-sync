import { getAuth } from "firebase/auth";

// Browser Auth uses its own persistent storage and browser APIs.
export const createFirebaseAuth = (app) => getAuth(app);
