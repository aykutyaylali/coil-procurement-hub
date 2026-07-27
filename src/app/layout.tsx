import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { env } from "@/lib/env";

export const metadata: Metadata = {
  title: {
    default: env.APP_NAME,
    template: `%s · ${env.APP_NAME}`,
  },
  description: "Kurumsal Satınalma ve Tedarikçi Yönetim Platformu",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr" suppressHydrationWarning>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
