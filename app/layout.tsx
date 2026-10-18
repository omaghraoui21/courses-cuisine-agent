import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "Nesma · Courses & Cuisine", description: "Un peu moins de courses. Un peu plus de vie. Votre maison, vos repas et vos achats réunis." };
export default function RootLayout({children}: Readonly<{children: React.ReactNode}>) { return <html lang="fr"><body>{children}</body></html>; }
