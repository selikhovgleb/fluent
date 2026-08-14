"use server";

import { signIn } from "../../auth";

export async function signInWithGoogle(formData: FormData) {
  const requestedCallback = String(formData.get("callbackUrl") ?? "/");
  const redirectTo = requestedCallback.startsWith("/") && !requestedCallback.startsWith("//")
    ? requestedCallback
    : "/";

  await signIn("google", { redirectTo });
}
