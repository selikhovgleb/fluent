import { redirect } from "next/navigation";
import { auth } from "../../auth";
import LoginExperience from "./login-experience";

type LoginPageProps = {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
};

function safeCallbackUrl(value?: string) {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/";
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const callbackUrl = safeCallbackUrl(params.callbackUrl);
  const session = await auth();

  if (session?.user) redirect(callbackUrl);

  return <LoginExperience callbackUrl={callbackUrl} oauthError={Boolean(params.error)} />;
}
