import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VR.ified Classroom — Learn together, wherever you are",
  description: "A calm, browser-first learning space for teachers and students. VR is optional.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
