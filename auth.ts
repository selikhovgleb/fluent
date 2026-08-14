import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

// Auth.js otherwise derives redirects from the container's internal HOSTNAME
// (0.0.0.0:3000). AWS supplies the public CloudFront URL as APP_BASE_URL.
if (!process.env.AUTH_URL && process.env.APP_BASE_URL) {
  process.env.AUTH_URL = process.env.APP_BASE_URL;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  pages: { signIn: "/login" },
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
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
