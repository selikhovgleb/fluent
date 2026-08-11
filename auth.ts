import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "google-client-id-not-configured",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "google-client-secret-not-configured",
    }),
  ],
  secret: process.env.AUTH_SECRET,
  trustHost: true,
  session: { strategy: "jwt" },
  callbacks: {
    jwt({ token, account }) {
      if (account?.provider === "google") token.providerUserId = account.providerAccountId;
      return token;
    },
    session({ session, token }) {
      if (session.user) session.user.id = String(token.providerUserId ?? token.sub ?? "");
      return session;
    },
  },
});
